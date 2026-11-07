"""認證與權限。

- UI 使用者：登入後由後端設定 httpOnly cookie（前端 JavaScript 讀不到，XSS 無法竊取）。
  以 cookie 認證的寫入請求必須帶 `X-Requested-With: memora`（CSRF 防護，搭配 SameSite=Strict）。
- AI / 自動化：API Key（mk_ 開頭），放在 `Authorization: Bearer` 或 `X-API-Key`。
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from memora.config import get_settings
from memora.db import get_db
from memora.models import API_SCOPES, ApiKey, User
from memora.security.auth import (
    API_KEY_PREFIX,
    CSRF_HEADER,
    CSRF_VALUE,
    SESSION_COOKIE,
    decode_access_token,
    hash_api_key,
)
from memora.security.rate_limit import LoginThrottle, RateLimiter

DB = Annotated[Session, Depends(get_db)]

_limiter: RateLimiter | None = None


def get_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter(get_settings().rate_limit_per_minute)
    return _limiter


_login_throttle: LoginThrottle | None = None


def get_login_throttle() -> LoginThrottle:
    global _login_throttle
    if _login_throttle is None:
        s = get_settings()
        _login_throttle = LoginThrottle(s.login_max_failures, s.login_window_seconds)
    return _login_throttle


def reset_limiter() -> None:
    global _limiter, _login_throttle
    _limiter = None
    _login_throttle = None


@dataclass
class Principal:
    """目前的呼叫者：UI 使用者或 API Key（代表某個 AI）。"""

    type: str  # user | api_key
    id: str
    name: str
    workspace_id: str
    role: str  # admin | viewer | api
    scopes: set[str] = field(default_factory=set)
    subject: str | None = None  # API Key 代表的 AI（用於 visibility 過濾）
    ip: str | None = None

    @property
    def actor(self) -> str:
        return f"{self.type}:{self.name}"

    @property
    def is_ai(self) -> bool:
        return self.type == "api_key"

    def can(self, scope: str) -> bool:
        return scope in self.scopes


def _bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return request.headers.get("x-api-key") or None


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def check_csrf(request: Request) -> None:
    """以 cookie 認證時，寫入類請求需帶自訂標頭。跨站表單或圖片請求無法加自訂標頭，跨站 fetch 會被 CORS 預檢擋下。"""
    if request.method not in SAFE_METHODS and request.headers.get(CSRF_HEADER, "").lower() != CSRF_VALUE:
        raise HTTPException(403, "缺少 CSRF 防護標頭（X-Requested-With: memora）")


def _api_key_principal(token: str, request: Request, db: Session) -> Principal:
    key = db.scalar(select(ApiKey).where(ApiKey.key_hash == hash_api_key(token)))
    now = datetime.now(UTC)
    if not key or key.revoked_at or (key.expires_at and key.expires_at <= now):
        raise HTTPException(401, "API Key 無效、已撤銷或已過期")
    allowed, retry = get_limiter().hit(key.id)
    if not allowed:
        raise HTTPException(429, "請求過於頻繁，請稍後再試", headers={"Retry-After": str(retry)})
    if not key.last_used_at or now - key.last_used_at > timedelta(minutes=1):
        key.last_used_at = now
        db.commit()
    return Principal(
        type="api_key",
        id=key.id,
        name=key.name,
        workspace_id=key.workspace_id,
        role="api",
        scopes=set(key.scopes),
        subject=key.subject,
        ip=request.client.host if request.client else None,
    )


def session_user(request: Request, db: Session) -> User | None:
    """從 session cookie 取得使用者；token 版本不符（已登出所有裝置或改過密碼）視為失效。"""
    raw = request.cookies.get(SESSION_COOKIE)
    decoded = decode_access_token(raw) if raw else None
    if not decoded:
        return None
    user_id, version = decoded
    user = db.get(User, user_id)
    if not user or not user.is_active or user.token_version != version:
        return None
    return user


def get_principal(request: Request, db: DB) -> Principal:
    token = _bearer(request)
    if token:
        if not token.startswith(API_KEY_PREFIX):
            raise HTTPException(
                401, "Bearer 只接受 API Key（mk_ 開頭）；UI 請使用登入 session", headers={"WWW-Authenticate": "Bearer"}
            )
        return _api_key_principal(token, request, db)

    user = session_user(request, db)
    if not user:
        raise HTTPException(401, "未登入或登入已過期", headers={"WWW-Authenticate": "Bearer"})
    check_csrf(request)
    scopes = set(API_SCOPES) if user.role == "admin" else {"memories:read"}
    return Principal(
        type="user",
        id=user.id,
        name=user.username,
        workspace_id=user.workspace_id,
        role=user.role,
        scopes=scopes,
        ip=request.client.host if request.client else None,
    )


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]


def require_scope(scope: str):
    def dep(p: CurrentPrincipal) -> Principal:
        if not p.can(scope):
            raise HTTPException(403, f"權限不足（需要 {scope}）")
        return p

    return Depends(dep)


def require_user(admin: bool = False):
    """限定 UI 使用者（API Key 不可呼叫管理功能）。"""

    def dep(p: CurrentPrincipal) -> Principal:
        if p.type != "user":
            raise HTTPException(403, "此功能僅限登入的使用者")
        if admin and p.role != "admin":
            raise HTTPException(403, "需要管理員權限")
        return p

    return Depends(dep)
