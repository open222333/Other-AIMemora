"""MEMORA API 入口（FastAPI）。所有路由在 /api/v1 之下。"""

import logging
import secrets
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from memora import __version__
from memora.api import auth, dashboard, export, imports, memories, sources, system
from memora.config import get_settings, validate_settings
from memora.db import SessionLocal
from memora.memory.service import DuplicateMemory
from memora.models import User, Workspace
from memora.schemas import WorkspaceSettings
from memora.security.auth import hash_password

log = logging.getLogger("memora")


def ensure_admin() -> None:
    """首次啟動：沒有任何使用者時建立預設工作空間與管理員。"""
    s = get_settings()
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            return
        password = s.admin_password or secrets.token_urlsafe(12)
        ws = Workspace(name="My Memory", settings=WorkspaceSettings().model_dump())
        db.add(ws)
        db.flush()
        db.add(
            User(
                workspace_id=ws.id,
                username=s.admin_username,
                name="Administrator",
                password_hash=hash_password(password),
                role="admin",
                preferences={"theme": "system"},
            )
        )
        db.commit()
        if not s.admin_password:
            log.warning("已建立管理員 %s，初始密碼：%s（請登入後修改）", s.admin_username, password)
        else:
            log.info("已建立管理員 %s", s.admin_username)


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_settings()
    ensure_admin()
    yield


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="MEMORA API",
        description="One Memory. Every AI. — A Universal Memory Layer for Artificial Intelligence",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    if s.cors_origins:
        app.add_middleware(
            CORSMiddleware, allow_origins=s.cors_origins, allow_methods=["*"], allow_headers=["*"], allow_credentials=False
        )

    @app.exception_handler(DuplicateMemory)
    async def _dup(_: Request, e: DuplicateMemory):
        return JSONResponse({"detail": "已有相同內容的記憶", "existing_id": e.existing_id}, status_code=409)

    v1 = APIRouter(prefix="/api/v1")
    for r in (
        auth.router,
        memories.router,
        sources.router,
        imports.router,
        export.router,
        dashboard.router,
        system.router,
        system.keys,
    ):
        v1.include_router(r)
    app.include_router(v1)
    return app


app = create_app()
