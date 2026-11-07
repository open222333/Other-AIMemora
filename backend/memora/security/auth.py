"""密碼雜湊、JWT、API Key。

- 密碼：bcrypt
- UI 登入：短期 JWT（HS256，secret 來自 MEMORA_SECRET_KEY）
- API Key：`mk_` + 隨機字串，只儲存 SHA-256 雜湊；明文只在建立當下回傳一次
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from memora.config import get_settings

API_KEY_PREFIX = "mk_"
MAX_PASSWORD_BYTES = 72  # bcrypt 上限；超過會被拒絕而不是靜默截斷


def hash_password(password: str) -> str:
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        raise ValueError(f"密碼最多 {MAX_PASSWORD_BYTES} bytes")
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        return False
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


SESSION_COOKIE = "memora_session"
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "memora"


def create_access_token(user_id: str, token_version: int) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "ver": token_version,
        "iat": now,
        "exp": now + timedelta(minutes=s.access_token_minutes),
        "typ": "session",
    }
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> tuple[str, int] | None:
    """回傳 (user_id, token_version)；簽章錯誤、過期或格式不符回傳 None。"""
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "session" or not isinstance(payload.get("ver"), int):
        return None
    return payload["sub"], payload["ver"]


def generate_api_key() -> tuple[str, str, str]:
    """回傳 (明文, 顯示用前綴, 雜湊)。"""
    raw = API_KEY_PREFIX + secrets.token_urlsafe(32)
    return raw, raw[:11], hash_api_key(raw)


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
