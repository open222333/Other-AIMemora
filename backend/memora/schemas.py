"""API 請求 / 回應格式。"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from memora.models import API_SCOPES, MEMORY_CATEGORIES, MEMORY_STATUSES

Category = Literal["profile", "preferences", "projects", "knowledge", "decisions", "technical", "temporary"]
Status = Literal["pending", "active", "archived", "rejected", "expired", "conflicted"]
Scope = Literal["memories:read", "memories:write", "memories:delete"]

assert set(Category.__args__) == set(MEMORY_CATEGORIES)  # type: ignore[attr-defined]
assert set(Status.__args__) == set(MEMORY_STATUSES)  # type: ignore[attr-defined]
assert set(Scope.__args__) == set(API_SCOPES)  # type: ignore[attr-defined]

SUBJECT_PATTERN = r"^(\*|[a-z0-9][a-z0-9_-]{0,49})$"


def _clean_tags(v: list[str]) -> list[str]:
    out: list[str] = []
    for t in v:
        t = t.strip().lower()
        if t and t not in out:
            if len(t) > 50:
                raise ValueError("標籤最多 50 字")
            out.append(t)
    if len(out) > 20:
        raise ValueError("最多 20 個標籤")
    return out


def _clean_subjects(v: list[str]) -> list[str]:
    out = sorted({s.strip().lower() for s in v if s.strip()})
    return out


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── auth ──
class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(ORM):
    id: str
    username: str
    name: str
    email: str | None
    role: str
    preferences: dict[str, Any]


class LoginOut(BaseModel):
    """session 放在 httpOnly cookie，回應本體不含 token。"""

    user: UserOut


class PreferencesIn(BaseModel):
    theme: Literal["light", "dark", "system"] | None = None
    language: str | None = None


# ── sources ──
class SourceOut(ORM):
    id: str
    type: str
    name: str
    reference: str | None
    status: str
    created_at: datetime
    memory_count: int = 0


class SourceRef(ORM):
    id: str
    type: str
    name: str
    status: str


# ── memories ──
class MemoryBase(BaseModel):
    content: str = Field(min_length=1, max_length=10_000)
    category: Category
    tags: list[str] = []
    confidence: float = Field(default=1.0, ge=0, le=1)
    visibility: list[str] | None = None  # None = 使用工作空間預設
    expires_at: datetime | None = None
    review_at: datetime | None = None

    @field_validator("content")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("內容不可為空白")
        return v

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str]) -> list[str]:
        return _clean_tags(v)

    @field_validator("visibility")
    @classmethod
    def _vis(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_subjects(v)


class MemoryCreate(MemoryBase):
    status: Literal["pending", "active"] | None = None  # None = 依規則決定


class MemoryUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=10_000)
    category: Category | None = None
    tags: list[str] | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    status: Status | None = None
    visibility: list[str] | None = None
    expires_at: datetime | None = None
    review_at: datetime | None = None
    change_reason: str | None = Field(default=None, max_length=500)

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_tags(v)

    @field_validator("visibility")
    @classmethod
    def _vis(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_subjects(v)


class MemoryOut(ORM):
    id: str
    content: str
    category: str
    tags: list[str]
    status: str
    confidence: float
    version: int
    visibility: list[str]
    source: SourceRef | None
    source_id: str | None
    proposal_for: str | None = None  # AI 修改提案：被修改的原記憶 ID
    created_by: str
    created_at: datetime
    updated_at: datetime
    last_accessed_at: datetime | None
    expires_at: datetime | None
    review_at: datetime | None


class MemoryVersionOut(ORM):
    id: str
    version: int
    content: str
    category: str
    status: str
    confidence: float
    tags: list[str]
    changed_by: str
    change_reason: str | None
    created_at: datetime


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class BulkIn(BaseModel):
    action: Literal["delete", "archive", "activate", "reject", "set_category", "add_tags", "create"]
    ids: list[str] = Field(default=[], max_length=500)
    category: Category | None = None
    tags: list[str] | None = None
    memories: list[MemoryCreate] | None = Field(default=None, max_length=500)


class BulkOut(BaseModel):
    action: str
    affected: int
    created: list[str] = []
    errors: list[dict[str, Any]] = []


class SearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    mode: Literal["hybrid", "keyword", "semantic"] = "hybrid"
    limit: int = Field(default=10, ge=1, le=50)
    category: list[Category] | None = None
    tags: list[str] | None = None
    status: list[Status] | None = None


class SearchHit(BaseModel):
    memory: MemoryOut
    score: float
    matched_by: list[str]


class SearchOut(BaseModel):
    query: str
    mode: str
    semantic_available: bool
    items: list[SearchHit]


# ── api keys ──
class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[Scope] = Field(min_length=1)
    subject: str = Field(pattern=SUBJECT_PATTERN, description="此金鑰代表的 AI，例如 claude")
    expires_at: datetime | None = None


class ApiKeyOut(ORM):
    id: str
    name: str
    prefix: str
    scopes: list[str]
    subject: str | None
    created_by: str
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None
    revoked_at: datetime | None


class ApiKeyCreated(ApiKeyOut):
    key: str  # 明文，只回傳這一次


# ── imports ──
class ImportItem(BaseModel):
    index: int
    content: str
    category: str
    tags: list[str]
    duplicate_of: str | None = None
    selected: bool = True


class ImportJobOut(ORM):
    id: str
    filename: str
    format: str
    platform: str
    status: str
    total: int
    imported: int
    skipped: int
    failed: int
    errors: list[dict[str, Any]]
    options: dict[str, Any]
    source_id: str | None
    created_by: str
    created_at: datetime
    finished_at: datetime | None


class ImportJobDetail(ImportJobOut):
    items: list[ImportItem]


class ImportCommitIn(BaseModel):
    skip_duplicates: bool = True
    status: Literal["pending", "active"] = "active"
    exclude: list[int] = []  # 不匯入的項目 index


# ── audit ──
class AuditOut(ORM):
    id: int
    actor_type: str
    actor_id: str | None
    actor_name: str
    action: str
    target_type: str | None
    target_id: str | None
    result: str
    detail: dict[str, Any]
    created_at: datetime


# ── settings ──
class WorkspaceSettings(BaseModel):
    name: str = "My Memory"
    language: str = "zh-TW"
    timezone: str = "Asia/Taipei"
    default_visibility: list[str] = []
    require_review_for_api: bool = True

    @field_validator("default_visibility")
    @classmethod
    def _vis(cls, v: list[str]) -> list[str]:
        return _clean_subjects(v)


class WorkspaceSettingsPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    language: str | None = None
    timezone: str | None = None
    default_visibility: list[str] | None = None
    require_review_for_api: bool | None = None

    @field_validator("default_visibility")
    @classmethod
    def _vis(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_subjects(v)
