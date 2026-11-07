"""/memories：CRUD、列表、版本、搜尋、批次。"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, or_, select

from memora.api.deps import DB, CurrentPrincipal, Principal, require_scope
from memora.audit import audit
from memora.memory import service
from memora.models import Memory, MemorySource, MemoryVersion
from memora.retrieval.search import _escape_like, search
from memora.schemas import (
    BulkIn,
    BulkOut,
    MemoryCreate,
    MemoryOut,
    MemoryUpdate,
    MemoryVersionOut,
    Page,
    SearchHit,
    SearchIn,
    SearchOut,
)

router = APIRouter(prefix="/memories", tags=["memories"])

READ = require_scope("memories:read")
WRITE = require_scope("memories:write")
DELETE = require_scope("memories:delete")

SORTABLE = {
    "created_at": Memory.created_at,
    "updated_at": Memory.updated_at,
    "last_accessed_at": Memory.last_accessed_at,
    "category": Memory.category,
    "status": Memory.status,
    "confidence": Memory.confidence,
    "content": Memory.content,
}


def _csv(v: str | None) -> list[str]:
    return [x for x in (v or "").split(",") if x]


def get_visible(db: DB, p: Principal, memory_id: str) -> Memory:
    m = db.get(Memory, memory_id)
    if not m or not service.can_read(p, m):
        raise HTTPException(404, "找不到記憶")
    return m


@router.get("", response_model=Page[MemoryOut], dependencies=[READ])
def list_memories(
    p: CurrentPrincipal,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = None,
    status: str | None = Query(None, description="逗號分隔，例如 active,pending"),
    category: str | None = None,
    tag: str | None = None,
    source_type: str | None = None,
    source_id: str | None = None,
    sort: str = "updated_at",
    order: Literal["asc", "desc"] = "desc",
):
    stmt = service.base_query(p)
    if q:
        like = f"%{_escape_like(q.strip())}%"
        stmt = stmt.where(or_(Memory.content.ilike(like, escape="\\"), Memory.id == q.strip()))
    if s := _csv(status):
        stmt = stmt.where(Memory.status.in_(s))
    if c := _csv(category):
        stmt = stmt.where(Memory.category.in_(c))
    if t := _csv(tag):
        stmt = stmt.where(service.tag_filter([x.lower() for x in t]))
    if st := _csv(source_type):
        stmt = stmt.where(Memory.source_id.in_(select(MemorySource.id).where(MemorySource.type.in_(st))))
    if source_id:
        stmt = stmt.where(Memory.source_id == source_id)

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    col = SORTABLE.get(sort, Memory.updated_at)
    stmt = stmt.order_by(col.asc().nulls_last() if order == "asc" else col.desc().nulls_last(), Memory.id.desc())
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique().all()
    return Page[MemoryOut](items=[MemoryOut.model_validate(m) for m in rows], total=total, page=page, page_size=page_size)


@router.post("", response_model=MemoryOut, status_code=201, dependencies=[WRITE])
def create_memory(body: MemoryCreate, p: CurrentPrincipal, db: DB):
    m = service.create_memory(db, p, body)
    audit(db, p, "memory.create", "memory", m.id, category=m.category, status=m.status)
    db.commit()
    return m


@router.post("/search", response_model=SearchOut, dependencies=[READ])
def search_memories(body: SearchIn, p: CurrentPrincipal, db: DB):
    hits, semantic_ok = search(db, p, body)
    if p.is_ai:  # 只記錄 AI 的檢索（使用者在 UI 搜尋不列入）
        service.touch_accessed(db, [h.memory for h in hits])
        audit(db, p, "memory.search", None, None, mode=body.mode, results=len(hits), ids=[h.memory.id for h in hits][:20])
        db.commit()
    return SearchOut(
        query=body.query,
        mode=body.mode,
        semantic_available=semantic_ok,
        items=[
            SearchHit(memory=MemoryOut.model_validate(h.memory), score=round(h.score, 6), matched_by=h.matched_by) for h in hits
        ],
    )


@router.post("/bulk", response_model=BulkOut, dependencies=[WRITE])
def bulk(body: BulkIn, p: CurrentPrincipal, db: DB):
    if body.action == "create":
        created, errors = [], []
        for i, item in enumerate(body.memories or []):
            try:
                with db.begin_nested():
                    created.append(service.create_memory(db, p, item).id)
            except service.DuplicateMemory as e:
                errors.append({"index": i, "message": "重複的記憶", "existing_id": e.existing_id})
        audit(db, p, "memory.bulk_create", None, None, created=len(created), errors=len(errors))
        db.commit()
        return BulkOut(action="create", affected=len(created), created=created, errors=errors)

    if p.is_ai:
        raise HTTPException(403, "API Key 只能使用批次新增（create）")
    if body.action == "delete" and not p.can("memories:delete"):
        raise HTTPException(403, "權限不足（需要 memories:delete）")
    if not body.ids:
        raise HTTPException(422, "請提供 ids")
    rows = [m for m in db.scalars(select(Memory).where(Memory.id.in_(body.ids))).unique() if service.can_read(p, m)]
    status_map = {"archive": "archived", "activate": "active", "reject": "rejected"}
    for m in rows:
        if body.action == "activate" and m.proposal_for:
            try:
                service.apply_proposal(db, p, m)
            except service.ProposalTargetMissing:
                raise HTTPException(409, f"提案 {m.id} 的原記憶已被刪除，請改為拒絕") from None
            continue
        if body.action == "delete":
            service.delete_memory(db, m)
        elif body.action in status_map:
            service.update_memory(db, p, m, MemoryUpdate(status=status_map[body.action], change_reason=f"bulk:{body.action}"))
        elif body.action == "set_category":
            if not body.category:
                raise HTTPException(422, "請提供 category")
            service.update_memory(db, p, m, MemoryUpdate(category=body.category, change_reason="bulk:set_category"))
        elif body.action == "add_tags":
            tags = sorted({*m.tags, *[t.strip().lower() for t in body.tags or [] if t.strip()]})
            service.update_memory(db, p, m, MemoryUpdate(tags=tags, change_reason="bulk:add_tags"))
    audit(db, p, f"memory.bulk_{body.action}", None, None, count=len(rows), ids=[m.id for m in rows][:100])
    db.commit()
    return BulkOut(action=body.action, affected=len(rows))


@router.get("/{memory_id}", response_model=MemoryOut, dependencies=[READ])
def get_memory(memory_id: str, p: CurrentPrincipal, db: DB):
    m = get_visible(db, p, memory_id)
    if p.is_ai:
        service.touch_accessed(db, [m])
        audit(db, p, "memory.read", "memory", m.id)
        db.commit()
    return m


@router.patch(
    "/{memory_id}",
    response_model=MemoryOut,
    dependencies=[WRITE],
    responses={202: {"model": MemoryOut, "description": "AI 的修改已建立為待審核提案（proposal_for 指向原記憶）"}},
)
def update_memory(memory_id: str, body: MemoryUpdate, p: CurrentPrincipal, db: DB, response: Response):
    m = get_visible(db, p, memory_id)
    if p.is_ai and (body.visibility is not None or body.status is not None):
        raise HTTPException(403, "API Key 不可修改記憶的狀態或存取權限")
    if p.is_ai and service.workspace_settings(db, p.workspace_id).require_review_for_api:
        proposal = service.propose_update(db, p, m, body)
        if proposal is None:
            return m
        audit(db, p, "memory.propose_update", "memory", m.id, proposal_id=proposal.id, fields=sorted(body.model_fields_set))
        db.commit()
        response.status_code = 202
        return proposal
    was_proposal = m.proposal_for
    try:
        result = service.update_memory(db, p, m, body)
    except service.ProposalTargetMissing:
        raise HTTPException(409, "提案的原記憶已被刪除，請改為拒絕此提案") from None
    action = "memory.approve_proposal" if was_proposal and result.id != memory_id else "memory.update"
    audit(db, p, action, "memory", result.id, version=result.version, fields=sorted(body.model_fields_set))
    db.commit()
    db.refresh(result)
    return result


@router.delete("/{memory_id}", status_code=204, dependencies=[DELETE])
def delete_memory(memory_id: str, p: CurrentPrincipal, db: DB):
    m = get_visible(db, p, memory_id)
    service.delete_memory(db, m)
    audit(db, p, "memory.delete", "memory", memory_id)
    db.commit()


@router.get("/{memory_id}/versions", response_model=list[MemoryVersionOut], dependencies=[READ])
def versions(memory_id: str, p: CurrentPrincipal, db: DB):
    get_visible(db, p, memory_id)
    return db.scalars(
        select(MemoryVersion).where(MemoryVersion.memory_id == memory_id).order_by(MemoryVersion.version.desc())
    ).all()
