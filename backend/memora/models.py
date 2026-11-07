"""資料表定義（對應 migrations/versions/0001_initial.py）。

設計重點：
- 每個資源都有 workspace_id，預留多使用者 / 團隊空間
- 記憶內容（memories）與版本歷史（memory_versions）分開
- 標籤、來源、存取權限、向量各自正規化成獨立資料表
"""

from datetime import UTC, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from memora.db import Base
from memora.ids import new_id


def utcnow() -> datetime:
    return datetime.now(UTC)


def _id(prefix: str):
    return mapped_column(String(40), primary_key=True, default=lambda: new_id(prefix))


def _ts():
    return mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


MEMORY_STATUSES = ("pending", "active", "archived", "rejected", "expired", "conflicted")
MEMORY_CATEGORIES = ("profile", "preferences", "projects", "knowledge", "decisions", "technical", "temporary")
SOURCE_TYPES = ("manual", "api", "mcp", "import", "chatgpt", "claude", "gemini", "deepseek", "file")
API_SCOPES = ("memories:read", "memories:write", "memories:delete")


class Workspace(Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = _id("ws")
    name: Mapped[str] = mapped_column(String(100))
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = _ts()


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = _id("usr")
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="admin")  # admin | viewer
    preferences: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 遞增後所有既有登入 session 立即失效（改密碼、登出所有裝置）
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class MemorySource(Base):
    __tablename__ = "memory_sources"
    id: Mapped[str] = _id("src")
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(200))
    reference: Mapped[str | None] = mapped_column(String(500))  # 檔名、對話 ID、API Key ID…
    status: Mapped[str] = mapped_column(String(20), default="available")  # available | missing
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = _ts()


class Memory(Base):
    __tablename__ = "memories"
    __table_args__ = (
        Index("ix_memories_ws_hash", "workspace_id", "content_hash"),
        # 關鍵字搜尋（ILIKE / 相似度）用的 trigram 索引，於 0001 migration 建立
        Index("ix_memories_content_trgm", "content", postgresql_using="gin", postgresql_ops={"content": "gin_trgm_ops"}),
    )

    id: Mapped[str] = _id("mem")
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    category: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("memory_sources.id", ondelete="SET NULL"), index=True)
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    source: Mapped[MemorySource | None] = relationship(lazy="joined")
    tag_rows: Mapped[list["MemoryTag"]] = relationship(cascade="all, delete-orphan", lazy="selectin", order_by="MemoryTag.tag")
    policies: Mapped[list["AccessPolicy"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", primaryjoin="Memory.id == AccessPolicy.memory_id"
    )
    # 此記憶若是 AI 提出的「修改提案」，指向被修改的原記憶
    proposal_rels: Mapped[list["MemoryRelation"]] = relationship(
        lazy="selectin",
        viewonly=True,
        primaryjoin="and_(Memory.id == MemoryRelation.from_memory_id, MemoryRelation.relation_type == 'proposed_update')",
    )

    @property
    def tags(self) -> list[str]:
        return sorted(t.tag for t in self.tag_rows)

    @property
    def proposal_for(self) -> str | None:
        return self.proposal_rels[0].to_memory_id if self.proposal_rels else None

    @property
    def visibility(self) -> list[str]:
        return sorted(p.subject for p in self.policies if p.can_read)


class MemoryTag(Base):
    __tablename__ = "memory_tags"
    memory_id: Mapped[str] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), primary_key=True)
    tag: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)


class MemoryVersion(Base):
    __tablename__ = "memory_versions"
    __table_args__ = (UniqueConstraint("memory_id", "version"),)
    id: Mapped[str] = _id("ver")
    memory_id: Mapped[str] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    confidence: Mapped[float] = mapped_column(Float)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(50)), default=list)
    changed_by: Mapped[str] = mapped_column(String(100))
    change_reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = _ts()


class MemoryRelation(Base):
    """記憶關聯（Phase 3：知識圖譜、衝突、取代關係）。"""

    __tablename__ = "memory_relations"
    id: Mapped[str] = _id("rel")
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    from_memory_id: Mapped[str] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), index=True)
    to_memory_id: Mapped[str] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), index=True)
    relation_type: Mapped[str] = mapped_column(String(20))  # related | supersedes | conflicts | duplicates | proposed_update
    strength: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = _ts()


class AccessPolicy(Base):
    """存取權限：subject（AI 名稱，如 claude）可否讀寫某筆記憶或某分類。"""

    __tablename__ = "access_policies"
    id: Mapped[str] = _id("pol")
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    memory_id: Mapped[str | None] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), index=True)
    category: Mapped[str | None] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(50))
    can_read: Mapped[bool] = mapped_column(Boolean, default=True)
    can_write: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = _ts()


class AIConnection(Base):
    """AI 連線（Phase 2）。secret 以加密形式儲存，永不回傳前端。"""

    __tablename__ = "ai_connections"
    id: Mapped[str] = _id("con")
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    platform: Mapped[str] = mapped_column(String(30))
    endpoint: Mapped[str | None] = mapped_column(String(500))
    secret_encrypted: Mapped[str | None] = mapped_column(Text)
    permissions: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="disconnected")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[str] = _id("key")
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    prefix: Mapped[str] = mapped_column(String(20))  # 顯示用（mk_xxxxxxxx）
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    scopes: Mapped[list[str]] = mapped_column(ARRAY(String(30)), default=list)
    subject: Mapped[str | None] = mapped_column(String(50))  # 代表哪個 AI（用於 visibility 過濾）
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = _ts()
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Embedding(Base):
    __tablename__ = "embeddings"
    __table_args__ = (UniqueConstraint("memory_id", "model"),)
    id: Mapped[str] = _id("emb")
    memory_id: Mapped[str] = mapped_column(ForeignKey("memories.id", ondelete="CASCADE"), index=True)
    model: Mapped[str] = mapped_column(String(200))
    dim: Mapped[int] = mapped_column(Integer)
    vector: Mapped[list[float]] = mapped_column(Vector())
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = _ts()


class ImportJob(Base):
    __tablename__ = "import_jobs"
    id: Mapped[str] = _id("imp")
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(300))
    format: Mapped[str] = mapped_column(String(20))
    platform: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="previewed")
    total: Mapped[int] = mapped_column(Integer, default=0)
    imported: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    errors: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    options: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("memory_sources.id", ondelete="SET NULL"))
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = _ts()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    """操作紀錄：只記錄動作與目標，不記錄完整記憶內容。"""

    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    actor_type: Mapped[str] = mapped_column(String(20))  # user | api_key | system
    actor_id: Mapped[str | None] = mapped_column(String(40))
    actor_name: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(50), index=True)
    target_type: Mapped[str | None] = mapped_column(String(30))
    target_id: Mapped[str | None] = mapped_column(String(40))
    result: Mapped[str] = mapped_column(String(20), default="success")
    detail: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
