from fastapi.testclient import TestClient

from tests.conftest import make_key, new_memory

API = "/api/v1"


def as_key(client: TestClient, key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


def test_api_key_visibility_review_and_scopes(admin, client):
    key = make_key(admin, "claude")
    shared = new_memory(admin, "所有 AI 可讀", visibility=["*"])
    only_claude = new_memory(admin, "只給 Claude", visibility=["claude"])
    only_gpt = new_memory(admin, "只給 ChatGPT", visibility=["chatgpt"])
    private = new_memory(admin, "私人記憶")  # 預設 visibility = []（最小權限）
    assert private["visibility"] == []
    archived = new_memory(admin, "已封存但可見", visibility=["*"])
    admin.patch(f"{API}/memories/{archived['id']}", json={"status": "archived"})

    h = as_key(client, key)
    listed = {m["id"] for m in client.get(f"{API}/memories", headers=h).json()["items"]}
    assert listed == {shared["id"], only_claude["id"]}
    assert client.get(f"{API}/memories/{only_gpt['id']}", headers=h).status_code == 404
    hits = client.post(f"{API}/memories/search", json={"query": "記憶"}, headers=h).json()["items"]
    assert hits == []  # private / archived 都不可見
    r = client.get(f"{API}/memories/{shared['id']}", headers=h).json()
    assert r["last_accessed_at"] is not None

    # AI 寫入 → 待審核，且 visibility 自動含自己
    created = client.post(f"{API}/memories", json={"content": "使用者改用 Gemini", "category": "preferences"}, headers=h)
    assert created.status_code == 201
    c = created.json()
    assert c["status"] == "pending" and c["visibility"] == ["claude"]
    assert c["source"]["type"] == "api" and c["created_by"] == "api_key:claude key"
    # 待審核的記憶 AI 讀不到；使用者核准後才可讀
    assert client.get(f"{API}/memories/{c['id']}", headers=h).status_code == 404
    admin.patch(f"{API}/memories/{c['id']}", json={"status": "active"})
    assert client.get(f"{API}/memories/{c['id']}", headers=h).status_code == 200

    # 沒有 delete scope
    assert client.delete(f"{API}/memories/{shared['id']}", headers=h).status_code == 403
    # AI 不可改狀態 / 權限
    assert client.patch(f"{API}/memories/{shared['id']}", json={"status": "archived"}, headers=h).status_code == 403
    assert client.patch(f"{API}/memories/{shared['id']}", json={"visibility": ["*"]}, headers=h).status_code == 403
    # 修改既有記憶 → 建立待審核提案，原記憶不變（防止被 prompt injection 的 AI 直接竄改）
    r = client.patch(f"{API}/memories/{shared['id']}", json={"content": "所有 AI 可讀（已更新）"}, headers=h)
    assert r.status_code == 202
    proposal = r.json()
    assert proposal["status"] == "pending" and proposal["proposal_for"] == shared["id"]
    assert admin.get(f"{API}/memories/{shared['id']}").json()["content"] == "所有 AI 可讀"
    # API Key 不能呼叫管理功能
    assert client.get(f"{API}/api-keys", headers=h).status_code == 403
    assert client.get(f"{API}/export", headers=h).status_code == 403
    assert client.get(f"{API}/stats", headers=h).status_code == 403


def test_read_only_key(admin, client):
    key = make_key(admin, "gemini", scopes=["memories:read"])
    r = client.post(f"{API}/memories", json={"content": "x", "category": "knowledge"}, headers=as_key(client, key))
    assert r.status_code == 403


def test_delete_scope(admin, client):
    key = make_key(admin, "deepseek", scopes=["memories:read", "memories:delete"])
    m = new_memory(admin, "可刪除", visibility=["deepseek"])
    assert client.delete(f"{API}/memories/{m['id']}", headers=as_key(client, key)).status_code == 204


def test_review_setting_off(admin, client):
    admin.patch(f"{API}/settings", json={"require_review_for_api": False, "default_visibility": ["*"]})
    key = make_key(admin, "chatgpt")
    c = client.post(f"{API}/memories", json={"content": "y", "category": "knowledge"}, headers=as_key(client, key)).json()
    assert c["status"] == "active" and c["visibility"] == ["*"]
    assert admin.get(f"{API}/settings").json()["require_review_for_api"] is False


def test_revoke_and_rotate(admin, client):
    key = make_key(admin)
    keys = admin.get(f"{API}/api-keys").json()
    assert "key" not in keys[0] and "key_hash" not in keys[0] and key.startswith(keys[0]["prefix"])
    kid = keys[0]["id"]
    rotated = admin.post(f"{API}/api-keys/{kid}/rotate").json()
    assert client.get(f"{API}/memories", headers=as_key(client, key)).status_code == 401
    assert client.get(f"{API}/memories", headers=as_key(client, rotated["key"])).status_code == 200
    admin.post(f"{API}/api-keys/{rotated['id']}/revoke")
    assert client.get(f"{API}/memories", headers={"Authorization": "", "X-API-Key": rotated["key"]}).status_code == 401


def test_rate_limit(admin, client, monkeypatch):
    from memora.api import deps
    from memora.security.rate_limit import RateLimiter

    monkeypatch.setattr(deps, "_limiter", RateLimiter(3))
    key = make_key(admin)
    codes = [client.get(f"{API}/memories", headers=as_key(client, key)).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_api_key_requires_subject(admin):
    r = admin.post(f"{API}/api-keys", json={"name": "x", "scopes": ["memories:read"], "subject": "Bad Subject!"})
    assert r.status_code == 422


def test_ai_update_proposal_approve_and_reject(admin, client):
    key = make_key(admin, "claude")
    h = as_key(client, key)
    m = new_memory(admin, "主要使用 Claude", "preferences", tags=["ai"], visibility=["claude"])

    # 內容沒變 → 不建立提案
    r = client.patch(f"{API}/memories/{m['id']}", json={"content": "主要使用 Claude"}, headers=h)
    assert r.status_code == 200 and r.json()["id"] == m["id"]

    p1 = client.patch(
        f"{API}/memories/{m['id']}", json={"content": "主要使用 Gemini", "change_reason": "使用者說改用了"}, headers=h
    ).json()
    p2 = client.patch(f"{API}/memories/{m['id']}", json={"tags": ["ai", "bad"]}, headers=h).json()
    pending = admin.get(f"{API}/memories", params={"status": "pending"}).json()
    assert {x["id"] for x in pending["items"]} == {p1["id"], p2["id"]}
    assert all(x["proposal_for"] == m["id"] for x in pending["items"])
    # AI 看不到提案
    assert client.get(f"{API}/memories/{p1['id']}", headers=h).status_code == 404

    # 核准 → 套用到原記憶，提案移除；版本修改者記為提出的 AI
    r = admin.patch(f"{API}/memories/{p1['id']}", json={"status": "active"})
    assert r.status_code == 200 and r.json()["id"] == m["id"]
    assert r.json()["content"] == "主要使用 Gemini" and r.json()["version"] == 2
    assert admin.get(f"{API}/memories/{p1['id']}").status_code == 404
    v = admin.get(f"{API}/memories/{m['id']}/versions").json()[0]
    assert v["changed_by"] == "api_key:claude key" and p1["id"] in v["change_reason"]

    # 拒絕 → 原記憶不變
    admin.post(f"{API}/memories/bulk", json={"action": "reject", "ids": [p2["id"]]})
    assert admin.get(f"{API}/memories/{m['id']}").json()["tags"] == ["ai"]

    # 刪除原記憶時，針對它的待審核提案一併刪除（完整刪除）
    p3 = client.patch(f"{API}/memories/{m['id']}", json={"content": "改用 DeepSeek"}, headers=h).json()
    admin.delete(f"{API}/memories/{m['id']}")
    assert admin.get(f"{API}/memories/{p3['id']}").status_code == 404


def test_ai_update_direct_when_review_disabled(admin, client):
    admin.patch(f"{API}/settings", json={"require_review_for_api": False})
    key = make_key(admin, "claude")
    m = new_memory(admin, "舊內容", visibility=["claude"])
    r = client.patch(f"{API}/memories/{m['id']}", json={"content": "新內容"}, headers=as_key(client, key))
    assert r.status_code == 200 and r.json()["version"] == 2


def test_login_throttle(client, monkeypatch):
    from memora.api import deps
    from memora.security.rate_limit import LoginThrottle

    monkeypatch.setattr(deps, "_login_throttle", LoginThrottle(3, 300))
    codes = [client.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"}).status_code for _ in range(4)]
    assert codes == [401, 401, 401, 429]
    # 封鎖期間即使密碼正確也拒絕
    r = client.post(f"{API}/auth/login", json={"username": "admin", "password": "admin-password"})
    assert r.status_code == 429 and "Retry-After" in r.headers
    # 失敗登入有稽核紀錄
    monkeypatch.setattr(deps, "_login_throttle", LoginThrottle(3, 300))
    client.post(f"{API}/auth/login", json={"username": "admin", "password": "admin-password"})
    logs = client.get(f"{API}/activity", params={"action": "auth."}).json()
    assert logs["total"] == 3 and logs["items"][0]["result"] == "denied"


def test_password_byte_limit(admin):
    r = admin.post(f"{API}/auth/me/password", json={"current_password": "admin-password", "new_password": "密" * 30})
    assert r.status_code == 422
    r = admin.post(f"{API}/auth/me/password", json={"current_password": "admin-password", "new_password": "密碼很安全的一句話啊"})
    assert r.status_code == 204
