"""UI 登入 session：httpOnly cookie、CSRF、登出、登出所有裝置、改密碼失效。"""

from fastapi.testclient import TestClient

from memora.security.auth import create_access_token
from tests.conftest import make_key

API = "/api/v1"
CSRF = {"X-Requested-With": "memora"}


def new_browser() -> TestClient:
    from memora.main import app

    return TestClient(app, headers=CSRF)


def login(c: TestClient, password: str = "admin-password"):
    return c.post(f"{API}/auth/login", json={"username": "admin", "password": password})


def test_cookie_attributes(client):
    r = login(client)
    cookie = r.headers["set-cookie"].lower()
    assert cookie.startswith("memora_session=")
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api" in cookie
    assert "max-age=" in cookie


def test_csrf_header_required_for_cookie_writes(admin):
    no_csrf = {"X-Requested-With": ""}
    # 讀取不需要
    assert admin.get(f"{API}/memories", headers=no_csrf).status_code == 200
    # 寫入沒有標頭 → 403
    r = admin.post(f"{API}/memories", json={"content": "x", "category": "knowledge"}, headers=no_csrf)
    assert r.status_code == 403 and "CSRF" in r.json()["detail"]
    assert admin.post(f"{API}/memories", json={"content": "x", "category": "knowledge"}).status_code == 201
    # 登入本身也檢查（防登入 CSRF）
    assert (
        admin.post(f"{API}/auth/login", json={"username": "admin", "password": "admin-password"}, headers=no_csrf).status_code
        == 403
    )


def test_api_key_not_subject_to_csrf(admin, client):
    key = make_key(admin)
    with new_browser() as c:  # 沒有 cookie 的獨立用戶端
        c.headers.pop("X-Requested-With")
        r = c.post(f"{API}/memories", json={"content": "y", "category": "knowledge"}, headers={"Authorization": f"Bearer {key}"})
        assert r.status_code == 201


def test_jwt_as_bearer_rejected(client):
    from memora.db import SessionLocal
    from memora.models import User

    login(client)
    with SessionLocal() as db:
        user = db.query(User).one()
        token = create_access_token(user.id, user.token_version)
    with new_browser() as c:
        r = c.get(f"{API}/memories", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401 and "API Key" in r.json()["detail"]
        # 同一個 token 放在 cookie 才有效
        c.cookies.set("memora_session", token, path="/api")
        assert c.get(f"{API}/memories").status_code == 200


def test_logout_clears_cookie(admin):
    r = admin.post(f"{API}/auth/logout")
    assert r.status_code == 204 and "memora_session=" in r.headers["set-cookie"]
    assert admin.get(f"{API}/auth/me").status_code == 401


def test_logout_all_invalidates_other_devices(admin):
    with new_browser() as phone:
        assert login(phone).status_code == 200
        assert phone.get(f"{API}/auth/me").status_code == 200
        assert admin.post(f"{API}/auth/logout-all").status_code == 204
        assert phone.get(f"{API}/auth/me").status_code == 401
        assert admin.get(f"{API}/auth/me").status_code == 401
        assert login(phone).status_code == 200  # 重新登入即可


def test_password_change_invalidates_other_sessions(admin):
    with new_browser() as other:
        login(other)
        r = admin.post(f"{API}/auth/me/password", json={"current_password": "admin-password", "new_password": "new-password-123"})
        assert r.status_code == 204
        assert other.get(f"{API}/auth/me").status_code == 401  # 其他裝置失效
        assert admin.get(f"{API}/auth/me").status_code == 200  # 目前瀏覽器換發新 session
        assert login(other, "admin-password").status_code == 401
        assert login(other, "new-password-123").status_code == 200


def test_tampered_or_expired_cookie(client):
    import jwt

    from memora.config import get_settings

    with new_browser() as c:
        c.cookies.set("memora_session", "not-a-jwt", path="/api")
        assert c.get(f"{API}/auth/me").status_code == 401
        forged = jwt.encode(
            {"sub": "usr_x", "ver": 0, "typ": "session", "exp": 9999999999},
            "attacker-guessed-secret-0123456789abcdef",
            algorithm="HS256",
        )
        c.cookies.set("memora_session", forged, path="/api")
        assert c.get(f"{API}/auth/me").status_code == 401
        expired = jwt.encode({"sub": "usr_x", "ver": 0, "typ": "session", "exp": 1}, get_settings().secret_key, algorithm="HS256")
        c.cookies.set("memora_session", expired, path="/api")
        assert c.get(f"{API}/auth/me").status_code == 401
