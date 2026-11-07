"""Memory Engine：建立、更新、刪除、去重、版本、權限、向量。

所有寫入記憶的路徑（UI、REST API、匯入、未來的 MCP）都經過這裡，確保規則一致。
"""

import hashlib
import logging
import re
from datetime import UTC, datetime

from sqlalchemy import Select, and_, exists, or_, select
from sqlalchemy.orm import Session

from memora.api.deps import Principal
from memora.models import (
    AccessPolicy,
    Embedding,
    Memory,
    MemoryRelation,
    MemorySource,
    MemoryTag,
    MemoryVersion,
    Workspace,
)
from memora.retrieval import embeddings
from memora.schemas import MemoryCreate, MemoryUpdate, WorkspaceSettings

log = logging.getLogger(__name__)

_WS = re.compile(r"\s+")


class DuplicateMemory(Exception):
    def __init__(self, existing_id: str):
        super().__init__(existing_id)
        self.existing_id = existing_id


def normalize(content: str) -> str:
    return _WS.sub(" ", content).strip()


def content_hash(content: str) -> str:
    return hashlib.sha256(normalize(content).casefold().encode()).hexdigest()


def workspace_settings(db: Session, workspace_id: str) -> WorkspaceSettings:
    ws = db.get(Workspace, workspace_id)
    return WorkspaceSettings(**(ws.settings if ws else {}))


# ── 來源 ──
def get_or_create_source(db: Session, workspace_id: str, type: str, name: str, reference: str | None = None) -> MemorySource:
    q = select(MemorySource).where(
        MemorySource.workspace_id == workspace_id,
        MemorySource.type == type,
        MemorySource.name == name,
        MemorySource.reference.is_(None) if reference is None else MemorySource.reference == reference,
    )
    src = db.scalar(q)
    if not src:
        src = MemorySource(workspace_id=workspace_id, type=type, name=name, reference=reference)
        db.add(src)
        db.flush()
    return src


def default_source(db: Session, p: Principal) -> MemorySource:
    if p.is_ai:
        return get_or_create_source(db, p.workspace_id, "api", f"REST API · {p.subject}", p.id)
    return get_or_create_source(db, p.workspace_id, "manual", "手動新增")


# ── 權限 ──
def visible_to(p: Principal):
    """SQL 條件：此呼叫者可讀的記憶。使用者可看全部；API Key 只能看 visibility 含其 subject 或 * 的記憶。"""
    if not p.is_ai:
        return Memory.workspace_id == p.workspace_id
    allowed = exists().where(
        AccessPolicy.memory_id == Memory.id,
        AccessPolicy.can_read.is_(True),
        AccessPolicy.subject.in_([p.subject or "", "*"]),
    )
    return and_(Memory.workspace_id == p.workspace_id, Memory.status == "active", allowed)


def can_read(p: Principal, m: Memory) -> bool:
    if m.workspace_id != p.workspace_id:
        return False
    if not p.is_ai:
        return True
    return m.status == "active" and bool({p.subject, "*"} & set(m.visibility))


def base_query(p: Principal) -> Select[tuple[Memory]]:
    return select(Memory).where(visible_to(p))


# ── 內部 ──
def _set_tags(m: Memory, tags: list[str]) -> None:
    m.tag_rows = [MemoryTag(tag=t) for t in tags]


def _set_visibility(m: Memory, subjects: list[str]) -> None:
    m.policies = [AccessPolicy(workspace_id=m.workspace_id, subject=s, can_read=True) for s in subjects]


def _snapshot(m: Memory, changed_by: str, reason: str | None) -> MemoryVersion:
    return MemoryVersion(
        memory_id=m.id,
        version=m.version,
        content=m.content,
        category=m.category,
        status=m.status,
        confidence=m.confidence,
        tags=m.tags,
        changed_by=changed_by,
        change_reason=reason,
    )


def find_duplicate(db: Session, workspace_id: str, content: str, exclude_id: str | None = None) -> str | None:
    q = select(Memory.id).where(
        Memory.workspace_id == workspace_id,
        Memory.content_hash == content_hash(content),
        Memory.status.notin_(["rejected"]),
    )
    if exclude_id:
        q = q.where(Memory.id != exclude_id)
    return db.scalar(q.limit(1))


def refresh_embedding(db: Session, m: Memory) -> bool:
    """更新向量；Embedding 未啟用或失敗時不影響記憶本身的儲存。"""
    if not embeddings.enabled():
        return False
    model = embeddings.model_name()
    existing = db.scalar(select(Embedding).where(Embedding.memory_id == m.id, Embedding.model == model))
    if existing and existing.content_hash == m.content_hash:
        return True
    try:
        [vec] = embeddings.embed([m.content])
    except embeddings.EmbeddingError as e:
        log.warning("embedding failed for %s: %s", m.id, e)
        return False
    if existing:
        existing.vector, existing.dim, existing.content_hash = vec, len(vec), m.content_hash
    else:
        db.add(Embedding(memory_id=m.id, model=model, dim=len(vec), vector=vec, content_hash=m.content_hash))
    return True


# ── 公開操作 ──
def create_memory(
    db: Session,
    p: Principal,
    data: MemoryCreate,
    source: MemorySource | None = None,
    check_duplicate: bool = True,
) -> Memory:
    settings = workspace_settings(db, p.workspace_id)
    content = normalize(data.content)
    if check_duplicate and (dup := find_duplicate(db, p.workspace_id, content)):
        raise DuplicateMemory(dup)

    status = data.status
    if p.is_ai and settings.require_review_for_api:
        status = "pending"  # AI 寫入的記憶依規則需使用者審核
    visibility = data.visibility if data.visibility is not None else list(settings.default_visibility)
    if p.is_ai and p.subject and p.subject not in visibility and "*" not in visibility:
        visibility = sorted({*visibility, p.subject})  # 寫入的 AI 至少能讀回自己的記憶

    m = Memory(
        workspace_id=p.workspace_id,
        content=content,
        content_hash=content_hash(content),
        category=data.category,
        status=status or "active",
        confidence=data.confidence,
        version=1,
        source_id=(source or default_source(db, p)).id,
        created_by=p.actor,
        expires_at=data.expires_at,
        review_at=data.review_at,
    )
    db.add(m)
    db.flush()
    _set_tags(m, data.tags)
    _set_visibility(m, visibility)
    db.flush()
    db.add(_snapshot(m, p.actor, "created"))
    refresh_embedding(db, m)
    return m


class ProposalTargetMissing(Exception):
    pass


def update_memory(db: Session, p: Principal, m: Memory, patch: MemoryUpdate, actor: str | None = None) -> Memory:
    """更新記憶；內容、分類、標籤、可信度、狀態有變動時產生新版本。actor 可覆寫版本紀錄的修改者。"""
    if m.proposal_for and patch.status == "active" and not p.is_ai:
        return apply_proposal(db, p, m)
    changes = patch.model_dump(exclude_unset=True)
    reason = changes.pop("change_reason", None)
    content_changed = False

    if "content" in changes and changes["content"] is not None:
        new = normalize(changes.pop("content"))
        if new != m.content:
            if dup := find_duplicate(db, m.workspace_id, new, exclude_id=m.id):
                raise DuplicateMemory(dup)
            m.content, m.content_hash, content_changed = new, content_hash(new), True
    tracked_changed = content_changed
    for field in ("category", "confidence", "status"):
        if field in changes and changes[field] is not None and getattr(m, field) != changes[field]:
            setattr(m, field, changes[field])
            tracked_changed = True
    for field in ("expires_at", "review_at"):
        if field in changes:
            setattr(m, field, changes[field])
    if changes.get("tags") is not None and changes["tags"] != m.tags:
        _set_tags(m, changes["tags"])
        tracked_changed = True
    if changes.get("visibility") is not None and changes["visibility"] != m.visibility:
        _set_visibility(m, changes["visibility"])

    m.updated_at = datetime.now(UTC)
    if tracked_changed:
        m.version += 1
        db.flush()
        db.add(_snapshot(m, actor or p.actor, reason))
    if content_changed:
        refresh_embedding(db, m)
    return m


# ── AI 修改提案 ──
PROPOSAL_FIELDS = ("content", "category", "tags", "confidence")


def propose_update(db: Session, p: Principal, m: Memory, patch: MemoryUpdate) -> Memory | None:
    """AI 修改既有記憶時不直接覆寫，而是建立「待審核」的提案記憶，核准後才套用到原記憶。

    回傳提案；若內容與原記憶完全相同則回傳 None（不需修改）。
    """
    changes = {k: v for k, v in patch.model_dump(exclude_unset=True).items() if k in PROPOSAL_FIELDS and v is not None}
    proposed = {
        "content": normalize(changes.get("content", m.content)),
        "category": changes.get("category", m.category),
        "tags": changes.get("tags", m.tags),
        "confidence": changes.get("confidence", m.confidence),
    }
    if all(proposed[k] == getattr(m, k) for k in PROPOSAL_FIELDS):
        return None
    if dup := find_duplicate(db, m.workspace_id, proposed["content"], exclude_id=m.id):
        raise DuplicateMemory(dup)
    proposal = Memory(
        workspace_id=m.workspace_id,
        content=proposed["content"],
        content_hash=content_hash(proposed["content"]),
        category=proposed["category"],
        status="pending",
        confidence=proposed["confidence"],
        version=1,
        source_id=default_source(db, p).id,
        created_by=p.actor,
    )
    db.add(proposal)
    db.flush()
    _set_tags(proposal, proposed["tags"])
    _set_visibility(proposal, m.visibility)
    db.add(
        MemoryRelation(
            workspace_id=m.workspace_id, from_memory_id=proposal.id, to_memory_id=m.id, relation_type="proposed_update"
        )
    )
    db.add(_snapshot(proposal, p.actor, (patch.change_reason or f"修改提案：{m.id}")[:500]))
    db.flush()
    db.refresh(proposal)
    return proposal


def apply_proposal(db: Session, p: Principal, proposal: Memory) -> Memory:
    """核准提案：把提案內容寫入原記憶（產生新版本，修改者記為提出的 AI），並移除提案。"""
    target = db.get(Memory, proposal.proposal_for) if proposal.proposal_for else None
    if not target:
        raise ProposalTargetMissing(proposal.id)
    patch = MemoryUpdate(
        content=proposal.content,
        category=proposal.category,  # type: ignore[arg-type]
        tags=proposal.tags,
        confidence=proposal.confidence,
        change_reason=f"採納修改提案 {proposal.id}（{p.actor} 核准）",
    )
    author = proposal.created_by
    db.delete(proposal)  # 先移除，避免與原記憶的重複檢查衝突
    db.flush()
    return update_memory(db, p, target, patch, actor=author)


def delete_memory(db: Session, m: Memory) -> None:
    """完整刪除：記憶、版本歷史、標籤、權限與向量一併刪除（FK cascade），
    針對它的待審核修改提案也一併刪除。稽核紀錄只保留 ID。"""
    proposals = select(MemoryRelation.from_memory_id).where(
        MemoryRelation.to_memory_id == m.id, MemoryRelation.relation_type == "proposed_update"
    )
    for pm in db.scalars(select(Memory).where(Memory.id.in_(proposals), Memory.status == "pending")).unique():
        db.delete(pm)
    db.delete(m)


def touch_accessed(db: Session, memories: list[Memory]) -> None:
    now = datetime.now(UTC)
    for m in memories:
        m.last_accessed_at = now


def tag_filter(tags: list[str]):
    return or_(*[exists().where(MemoryTag.memory_id == Memory.id, MemoryTag.tag == t) for t in tags])
