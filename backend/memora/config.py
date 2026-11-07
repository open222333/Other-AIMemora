"""設定：全部來自環境變數（前綴 MEMORA_），參考根目錄 .env.example。"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MEMORA_", env_file=".env", extra="ignore")

    app_name: str = "MEMORA"
    env: Literal["development", "production", "test"] = "development"

    # 資料庫：可直接給完整連線字串（MEMORA_DATABASE_URL），
    # 或分欄設定（MEMORA_DB_*）。分欄時密碼含 / + = @ 等字元也不需要手動跳脫。
    database_url: str | None = None
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "memora"
    db_user: str = "memora"
    db_password: str = "memora"

    # UI 登入 session（JWT 放在 httpOnly cookie）。正式環境務必改成隨機長字串。
    secret_key: str = Field(default="change-me-in-production", min_length=16)
    access_token_minutes: int = 60 * 12
    # 透過 HTTPS 提供服務時設為 true（cookie 只走加密連線）
    cookie_secure: bool = False

    # 首次啟動時若沒有任何使用者，以此建立管理員
    admin_username: str = "admin"
    admin_password: str | None = None

    # Embedding：預設 disabled，不把資料送到任何外部服務。
    # openai = 任何 OpenAI 相容的 /v1/embeddings（OpenAI、Ollama、LM Studio、vLLM…）
    embedding_provider: Literal["disabled", "openai"] = "disabled"
    embedding_base_url: str = "http://localhost:11434/v1"
    embedding_api_key: str | None = None
    embedding_model: str = "nomic-embed-text"
    embedding_timeout_s: float = 15.0

    # API Key 每分鐘請求上限（0 = 不限制）
    rate_limit_per_minute: int = 120

    # 登入失敗節流：同一 IP 或帳號在 login_window_seconds 內失敗達上限即暫時封鎖（0 = 不限制）
    login_max_failures: int = 10
    login_window_seconds: int = 300

    # 匯入檔案大小上限（MB）
    import_max_mb: int = 20

    cors_origins: list[str] = []

    @property
    def sqlalchemy_url(self) -> str | URL:
        if self.database_url:
            return self.database_url
        return URL.create(
            "postgresql+psycopg",
            username=self.db_user,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


class ConfigError(RuntimeError):
    pass


def validate_settings(s: Settings | None = None) -> None:
    """啟動前檢查：設定錯誤時給出可直接照做的訊息（而不是讓服務起不來、前端只看到 502）。"""
    s = s or get_settings()
    problems: list[str] = []
    if s.env == "production" and (s.secret_key.startswith("change-me") or len(s.secret_key) < 32):
        problems.append("MEMORA_SECRET_KEY 仍是範例值或少於 32 字元 → 在 .env 設定隨機值（openssl rand -hex 32）")
    if s.admin_password and len(s.admin_password.encode()) > 72:
        problems.append("MEMORA_ADMIN_PASSWORD 超過 72 bytes（bcrypt 限制）→ 請縮短")
    if problems:
        raise ConfigError("設定錯誤，API 拒絕啟動：\n  - " + "\n  - ".join(problems))
