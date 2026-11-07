from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from memora.api.deps import DB, CurrentPrincipal, require_user
from memora.models import Memory, MemorySource
from memora.schemas import SourceOut

router = APIRouter(prefix="/sources", tags=["sources"], dependencies=[require_user()])


def _with_counts(db, workspace_id: str, source_id: str | None = None):
    counts = (
        select(Memory.source_id, func.count().label("n"))
        .where(Memory.workspace_id == workspace_id)
        .group_by(Memory.source_id)
        .subquery()
    )
    q = (
        select(MemorySource, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.source_id == MemorySource.id)
        .where(MemorySource.workspace_id == workspace_id)
        .order_by(MemorySource.created_at.desc())
    )
    if source_id:
        q = q.where(MemorySource.id == source_id)
    return [SourceOut.model_validate(s).model_copy(update={"memory_count": n}) for s, n in db.execute(q)]


@router.get("", response_model=list[SourceOut])
def list_sources(p: CurrentPrincipal, db: DB):
    return _with_counts(db, p.workspace_id)


@router.get("/{source_id}", response_model=SourceOut)
def get_source(source_id: str, p: CurrentPrincipal, db: DB):
    rows = _with_counts(db, p.workspace_id, source_id)
    if not rows:
        raise HTTPException(404, "找不到來源")
    return rows[0]
