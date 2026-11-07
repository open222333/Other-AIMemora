from tests.conftest import new_memory

API = "/api/v1"


def test_login_and_me(client):
    assert client.get(f"{API}/memories").status_code == 401
    assert client.post(f"{API}/auth/login", json={"username": "admin", "password": "nope"}).status_code == 401
    r = client.post(f"{API}/auth/login", json={"username": "admin", "password": "admin-password"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "admin" and "password_hash" not in body["user"]
    assert "access_token" not in body  # token 只在 httpOnly cookie
    me = client.get(f"{API}/auth/me")
    assert me.json()["username"] == "admin"


def test_preferences_saved(admin):
    r = admin.patch(f"{API}/auth/me/preferences", json={"theme": "dark"})
    assert r.json()["preferences"]["theme"] == "dark"


def test_crud_versions_and_duplicates(admin):
    m = new_memory(admin, "偏好使用繁體中文回答", "preferences", tags=["Language", "language", "communication"])
    assert m["tags"] == ["communication", "language"]
    assert m["status"] == "active" and m["version"] == 1
    assert m["source"]["type"] == "manual"

    dup = admin.post(f"{API}/memories", json={"content": "  偏好使用繁體中文回答 ", "category": "preferences"})
    assert dup.status_code == 409 and dup.json()["existing_id"] == m["id"]

    r = admin.patch(f"{API}/memories/{m['id']}", json={"content": "偏好使用繁體中文回答，語氣簡潔", "change_reason": "補充"})
    assert r.status_code == 200 and r.json()["version"] == 2
    # 只改 visibility 不產生新版本
    r = admin.patch(f"{API}/memories/{m['id']}", json={"visibility": ["claude", "chatgpt"]})
    assert r.json()["version"] == 2 and r.json()["visibility"] == ["chatgpt", "claude"]
    # 標籤重新加入相同值也能正常處理
    r = admin.patch(f"{API}/memories/{m['id']}", json={"tags": ["language", "tone"]})
    assert r.json()["tags"] == ["language", "tone"] and r.json()["version"] == 3

    versions = admin.get(f"{API}/memories/{m['id']}/versions").json()
    assert [v["version"] for v in versions] == [3, 2, 1]
    assert versions[1]["change_reason"] == "補充"
    assert versions[2]["content"] == "偏好使用繁體中文回答"

    assert admin.delete(f"{API}/memories/{m['id']}").status_code == 204
    assert admin.get(f"{API}/memories/{m['id']}").status_code == 404
    assert admin.get(f"{API}/memories/{m['id']}/versions").status_code == 404


def test_validation(admin):
    r = admin.post(f"{API}/memories", json={"content": "   ", "category": "preferences"})
    assert r.status_code == 422
    r = admin.post(f"{API}/memories", json={"content": "x", "category": "nope"})
    assert r.status_code == 422


def test_list_filter_sort_paginate(admin):
    for i in range(12):
        new_memory(admin, f"記憶 {i:02d}", "technical" if i % 2 else "projects", tags=["even"] if i % 2 == 0 else [])
    r = admin.get(
        f"{API}/memories", params={"category": "technical", "page_size": 4, "page": 2, "sort": "content", "order": "asc"}
    )
    body = r.json()
    assert body["total"] == 6 and body["page"] == 2 and len(body["items"]) == 2
    assert [m["content"] for m in body["items"]] == ["記憶 09", "記憶 11"]
    assert admin.get(f"{API}/memories", params={"tag": "even"}).json()["total"] == 6
    assert admin.get(f"{API}/memories", params={"q": "記憶 1"}).json()["total"] == 2
    assert admin.get(f"{API}/memories", params={"source_type": "manual"}).json()["total"] == 12


def test_bulk(admin):
    ids = [new_memory(admin, f"bulk {i}")["id"] for i in range(3)]
    r = admin.post(f"{API}/memories/bulk", json={"action": "archive", "ids": ids[:2]})
    assert r.json()["affected"] == 2
    assert admin.get(f"{API}/memories", params={"status": "archived"}).json()["total"] == 2
    r = admin.post(f"{API}/memories/bulk", json={"action": "add_tags", "ids": ids, "tags": ["x"]})
    assert admin.get(f"{API}/memories", params={"tag": "x"}).json()["total"] == 3
    r = admin.post(
        f"{API}/memories/bulk",
        json={
            "action": "create",
            "memories": [{"content": "bulk 0", "category": "knowledge"}, {"content": "新的", "category": "knowledge"}],
        },
    )
    assert r.json()["affected"] == 1 and r.json()["errors"][0]["existing_id"] == ids[0]
    r = admin.post(f"{API}/memories/bulk", json={"action": "delete", "ids": ids})
    assert r.json()["affected"] == 3


def test_keyword_search_distinguishes_model_numbers(admin):
    a = new_memory(admin, "主要顯示卡是 RTX 4090", "technical")
    new_memory(admin, "舊電腦用 RTX 4080", "technical")
    new_memory(admin, "Python 版本 3.12", "technical", tags=["python"])
    r = admin.post(f"{API}/memories/search", json={"query": "RTX 4090"}).json()
    assert r["semantic_available"] is False
    assert r["items"][0]["memory"]["id"] == a["id"]  # 兩個詞都命中者優先
    r = admin.post(f"{API}/memories/search", json={"query": "4090", "mode": "keyword"}).json()
    assert [h["memory"]["id"] for h in r["items"]] == [a["id"]]
    r = admin.post(f"{API}/memories/search", json={"query": "python"}).json()  # 標籤命中
    assert len(r["items"]) == 1
    r = admin.post(f"{API}/memories/search", json={"query": "50%_"}).json()  # LIKE 特殊字元不會當萬用字元
    assert r["items"] == []


def test_semantic_hybrid_with_fake_embeddings(admin, monkeypatch):
    from memora.retrieval import embeddings

    vocab = ["貓", "狗", "咖啡", "茶"]

    def fake_embed(texts):
        return [[float(t.count(w)) + 0.01 for w in vocab] for t in texts]

    monkeypatch.setattr(embeddings, "enabled", lambda: True)
    monkeypatch.setattr(embeddings, "embed", fake_embed)
    cat = new_memory(admin, "家裡養了一隻貓")
    new_memory(admin, "每天早上喝咖啡")
    r = admin.post(f"{API}/memories/search", json={"query": "貓貓", "mode": "semantic", "limit": 1}).json()
    assert r["semantic_available"] is True and r["items"][0]["memory"]["id"] == cat["id"]
    r = admin.post(f"{API}/memories/search", json={"query": "貓", "mode": "hybrid"}).json()
    assert r["items"][0]["memory"]["id"] == cat["id"]
    assert set(r["items"][0]["matched_by"]) == {"keyword", "semantic"}
    storage = admin.get(f"{API}/storage").json()
    assert storage["embedding"]["embedded"] == 2


def test_stats_and_activity(admin):
    new_memory(admin, "a")
    new_memory(admin, "b", status="pending")
    s = admin.get(f"{API}/stats").json()
    assert s["total"] == 2 and s["active"] == 1 and s["pending"] == 1
    assert s["growth"][-1]["total"] == 2 and len(s["growth"]) == 30
    act = admin.get(f"{API}/activity").json()
    assert act["total"] >= 2 and act["items"][0]["action"] == "memory.create"
    # 稽核紀錄不含記憶內容
    assert all("content" not in a["detail"] for a in act["items"])


def test_health_is_public(client):
    r = client.get(f"{API}/health").json()
    assert r["status"] == "ok" and r["pgvector"] == "ok"


def test_sources_counts(admin):
    new_memory(admin, "x1")
    new_memory(admin, "x2")
    src = admin.get(f"{API}/sources").json()
    assert src[0]["type"] == "manual" and src[0]["memory_count"] == 2
