import json

from memora.importers.parsers import parse
from tests.conftest import new_memory

API = "/api/v1"

MD = """# 我的記憶

## Preferences
- 偏好使用繁體中文回答 #language
- 回答要簡潔

## 技術
1. 使用 PostgreSQL 16
- [x] 使用 Docker Compose 部署

一般段落不會被匯入
"""


def test_parse_markdown():
    p = parse("markdown", MD.encode())
    assert [i["category"] for i in p.items] == ["preferences", "preferences", "technical", "technical"]
    assert p.items[0] == {"content": "偏好使用繁體中文回答", "category": "preferences", "tags": ["language"]}
    assert p.items[3]["content"] == "使用 Docker Compose 部署"


def test_parse_csv_and_json_errors():
    p = parse("csv", b"content,category,tags\nA,technical,x;y\n,technical,\nB,unknown,\n")
    assert len(p.items) == 1 and p.items[0]["tags"] == ["x", "y"]
    assert [e["row"] for e in p.errors] == [3, 4]
    p = parse("json", b'{"memories": [{"content": "a", "category": "Projects"}, "b", 3]}')
    assert [i["category"] for i in p.items] == ["projects", "knowledge"] and p.errors[0]["row"] == 3
    assert parse("json", b"{bad").errors
    assert parse("csv", b"\xff\xfe").errors[0]["message"].startswith("檔案需為 UTF-8")


def upload(admin, name, content, **form):
    return admin.post(f"{API}/imports", files={"file": (name, content)}, data=form)


def test_import_flow(admin):
    existing = new_memory(admin, "回答要簡潔")
    r = upload(admin, "notes.md", MD.encode() + "- 回答要簡潔\n".encode(), platform="file")
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["status"] == "previewed" and job["total"] == 5
    dups = {i["index"]: i["duplicate_of"] for i in job["items"] if i["duplicate_of"]}
    assert dups[1] == existing["id"] and dups[4] == existing["id"]
    assert sum(i["selected"] for i in job["items"]) == 3

    r = admin.post(f"{API}/imports/{job['id']}/commit", json={"exclude": [2], "status": "pending"})
    done = r.json()
    assert done["status"] == "completed" and done["imported"] == 2 and done["skipped"] == 3
    pending = admin.get(f"{API}/memories", params={"status": "pending"}).json()
    assert pending["total"] == 2
    assert pending["items"][0]["source"]["type"] == "import" and pending["items"][0]["source"]["name"] == "notes.md"
    # 完成後清除暫存原文（記憶本身是唯一副本）
    assert admin.get(f"{API}/imports/{job['id']}").json()["items"] == []
    # 已完成不可重複匯入 / 取消
    assert admin.post(f"{API}/imports/{job['id']}/commit", json={}).status_code == 409
    assert admin.post(f"{API}/imports/{job['id']}/cancel").status_code == 409
    assert admin.get(f"{API}/imports").json()[0]["id"] == job["id"]


def test_import_cancel_and_errors_csv(admin):
    job = upload(admin, "x.csv", b"content,category\nA,technical\nB,bad\n", platform="chatgpt").json()
    assert job["failed"] == 1
    csv_text = admin.get(f"{API}/imports/{job['id']}/errors.csv").text
    assert "未知的分類" in csv_text
    assert admin.post(f"{API}/imports/{job['id']}/cancel").json()["status"] == "cancelled"
    assert admin.get(f"{API}/imports/{job['id']}").json()["items"] == []
    assert admin.get(f"{API}/memories").json()["total"] == 0


def test_import_rejects_unknown_format(admin):
    assert upload(admin, "x.pdf", b"%PDF").status_code == 422


def test_export_roundtrip(admin):
    m = new_memory(admin, "要匯出的記憶", "decisions", tags=["t"])
    admin.patch(f"{API}/memories/{m['id']}", json={"content": "要匯出的記憶 v2"})
    r = admin.get(f"{API}/export")
    assert r.headers["content-disposition"].startswith("attachment")
    doc = r.json()
    assert doc["format"] == "memora.export"
    exported = doc["memories"][0]
    assert exported["content"] == "要匯出的記憶 v2" and len(exported["versions"]) == 2
    csv_text = admin.get(f"{API}/export", params={"format": "csv"}).text
    assert "要匯出的記憶 v2" in csv_text

    # 匯出檔可再匯入（內容相同 → 全部標記為重複）
    job = upload(admin, "export.json", json.dumps(doc).encode()).json()
    assert job["total"] == 1 and job["items"][0]["duplicate_of"] == m["id"]


def test_stale_preview_expires(admin):
    from datetime import UTC, datetime, timedelta

    from memora.db import SessionLocal
    from memora.models import ImportJob

    job = upload(admin, "old.txt", "舊的預覽\n".encode()).json()
    with SessionLocal() as db:
        db.get(ImportJob, job["id"]).created_at = datetime.now(UTC) - timedelta(hours=25)
        db.commit()
    j = admin.get(f"{API}/imports/{job['id']}").json()
    assert j["status"] == "cancelled" and j["items"] == [] and j["options"]["expired"] is True


def test_csv_formula_injection_escaped(admin):
    new_memory(admin, '=HYPERLINK("http://evil","click")')
    new_memory(admin, "@SUM(1+1)")
    new_memory(admin, "-2+3 是負數範例")
    new_memory(admin, "正常內容")
    text = admin.get(f"{API}/export", params={"format": "csv"}).text
    assert "'=HYPERLINK" in text and "'@SUM" in text and "'-2+3" in text
    assert "\n=" not in text and ",=" not in text
    from memora.csvsafe import safe_cell

    assert [safe_cell(v) for v in ["=1", "+1", "\t=1", "a=1", 3]] == ["'=1", "'+1", "'\t=1", "a=1", 3]
