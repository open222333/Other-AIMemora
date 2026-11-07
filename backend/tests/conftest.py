"""測試使用真實 PostgreSQL + pgvector（MEMORA_TEST_DATABASE_URL），每個測試前清空資料。"""

import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

TEST_URL = os.environ.get("MEMORA_TEST_DATABASE_URL", "postgresql+psycopg://memora:memora@localhost:5432/memora_test")
os.environ["MEMORA_DATABASE_URL"] = TEST_URL
os.environ["MEMORA_ENV"] = "test"
os.environ["MEMORA_ADMIN_USERNAME"] = "admin"
os.environ["MEMORA_ADMIN_PASSWORD"] = "admin-password"
os.environ["MEMORA_SECRET_KEY"] = "test-secret-key-0123456789abcdef0123456789"
os.environ["MEMORA_RATE_LIMIT_PER_MINUTE"] = "1000"

from memora.api import deps  # noqa: E402
from memora.config import get_settings  # noqa: E402
from memora.db import get_engine, reset_engine  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="session", autouse=True)
def _schema():
    get_settings.cache_clear()
    reset_engine()
    with get_engine().begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    cfg = Config(os.path.join(ROOT, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(ROOT, "migrations"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean():
    with get_engine().begin() as conn:
        tables = (
            conn.execute(text("select tablename from pg_tables where schemaname='public' and tablename <> 'alembic_version'"))
            .scalars()
            .all()
        )
        conn.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))
    deps.reset_limiter()
    yield


@pytest.fixture
def client():
    from memora.main import app

    # 瀏覽器端（前端 client）每個請求都會帶 CSRF 標頭
    with TestClient(app, headers={"X-Requested-With": "memora"}) as c:
        yield c


@pytest.fixture
def admin(client):
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-password"})
    assert r.status_code == 200, r.text  # session cookie 存在 client 的 cookie jar
    return client


def make_key(admin_client, subject="claude", scopes=("memories:read", "memories:write")) -> str:
    r = admin_client.post("/api/v1/api-keys", json={"name": f"{subject} key", "subject": subject, "scopes": list(scopes)})
    assert r.status_code == 201, r.text
    return r.json()["key"]


def new_memory(c, content, category="knowledge", **kw):
    r = c.post("/api/v1/memories", json={"content": content, "category": category, **kw})
    assert r.status_code == 201, r.text
    return r.json()
