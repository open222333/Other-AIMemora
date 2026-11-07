import logging
from types import SimpleNamespace

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from memora.api.deps import DB, CurrentPrincipal, check_csrf, get_login_throttle, require_user
from memora.audit import audit
from memora.config import get_settings
from memora.models import User
from memora.schemas import LoginIn, LoginOut, PreferencesIn, UserOut
from memora.security.auth import (
    MAX_PASSWORD_BYTES,
    SESSION_COOKIE,
    create_access_token,
    hash_password,
    verify_password,
)

log = logging.getLogger("memora.auth")

router = APIRouter(prefix="/auth", tags=["auth"])


def set_session_cookie(response: Response, user: User) -> None:
    """httpOnly：JavaScript 讀不到；SameSite=Strict：跨站請求不會帶上；path 限定 /api。"""
    s = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        create_access_token(user.id, user.token_version),
        max_age=s.access_token_minutes * 60,
        httponly=True,
        secure=s.cookie_secure,
        samesite="strict",
        path="/api",
    )


def clear_session_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(SESSION_COOKIE, path="/api", httponly=True, secure=s.cookie_secure, samesite="strict")


# 帳號不存在時也做一次 bcrypt，避免以回應時間判斷帳號是否存在
_DUMMY_HASH = hash_password("memora-timing-guard")


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, db: DB, request: Request, response: Response):
    check_csrf(request)  # 防止登入 CSRF（被誘導登入攻擊者的帳號）
    username = body.username.strip()
    ip = request.client.host if request.client else "unknown"
    keys = (f"ip:{ip}", f"user:{username.lower()}")
    throttle = get_login_throttle()
    if wait := throttle.blocked(*keys):
        raise HTTPException(429, f"登入失敗次數過多，請 {wait} 秒後再試", headers={"Retry-After": str(wait)})

    user = db.scalar(select(User).where(User.username == username))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok or not user.is_active:
        throttle.fail(*keys)
        log.warning("login failed: username=%r ip=%s", username[:64], ip)
        if user:  # 帳號存在才寫入稽核紀錄（需要 workspace）
            actor = SimpleNamespace(workspace_id=user.workspace_id, type="user", id=None, name=username[:100], ip=ip)
            audit(db, actor, "auth.login_failed", "user", user.id, result="denied")
            db.commit()
        raise HTTPException(401, "帳號或密碼錯誤")
    throttle.reset(*keys)
    set_session_cookie(response, user)
    return LoginOut(user=UserOut.model_validate(user))


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response):
    """登出此瀏覽器：清除 cookie。要讓其他裝置也失效請用 /auth/logout-all。"""
    check_csrf(request)
    clear_session_cookie(response)


@router.post("/logout-all", status_code=204, dependencies=[require_user()])
def logout_all(p: CurrentPrincipal, db: DB, response: Response):
    """登出所有裝置：遞增 token 版本，所有既有 session 立即失效。"""
    user = db.get(User, p.id)
    assert user
    user.token_version += 1
    audit(db, p, "auth.logout_all", "user", user.id)
    db.commit()
    clear_session_cookie(response)


@router.get("/me", response_model=UserOut, dependencies=[require_user()])
def me(p: CurrentPrincipal, db: DB):
    return db.get(User, p.id)


@router.patch("/me/preferences", response_model=UserOut, dependencies=[require_user()])
def update_preferences(body: PreferencesIn, p: CurrentPrincipal, db: DB):
    user = db.get(User, p.id)
    assert user
    user.preferences = {**user.preferences, **body.model_dump(exclude_none=True)}
    db.commit()
    return user


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def _bcrypt_limit(cls, v: str) -> str:
        if len(v.encode()) > MAX_PASSWORD_BYTES:
            raise ValueError(f"密碼最多 {MAX_PASSWORD_BYTES} bytes（中文約 24 字）")
        return v


@router.post("/me/password", status_code=204, dependencies=[require_user()])
def change_password(body: PasswordIn, p: CurrentPrincipal, db: DB, response: Response):
    """改密碼後其他裝置的 session 全部失效，目前這個瀏覽器換發新 session。"""
    user = db.get(User, p.id)
    assert user
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "目前密碼不正確")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    audit(db, p, "user.password_change", "user", user.id)
    db.commit()
    set_session_cookie(response, user)
