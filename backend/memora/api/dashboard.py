"""/stats、/activity：Dashboard 數字全部來自資料庫實際資料。"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select, text

from memora.api.deps import DB, CurrentPrincipal, require_user
from memora.models import AIConnection, ApiKey, AuditLog, Memory, MemorySource
from memora.schemas import AuditOut, Page

router = APIRouter(tags=["dashboard"], dependencies=[require_user()])


@router.get("/stats")
def stats(p: CurrentPrincipal, db: DB, days: int = Query(30, ge=7, le=365)):
    ws = p.workspace_id
    by_status = dict(
        db.execute(select(Memory.status, func.count()).where(Memory.workspace_id == ws).group_by(Memory.status)).all()
    )
    by_category = dict(
        db.execute(select(Memory.category, func.count()).where(Memory.workspace_id == ws).group_by(Memory.category)).all()
    )
    since = (datetime.now(UTC) - timedelta(days=days - 1)).date()
    rows = db.execute(
        select(func.date(Memory.created_at), func.count())
        .where(Memory.workspace_id == ws, func.date(Memory.created_at) >= since)
        .group_by(func.date(Memory.created_at))
    ).all()
    per_day = {d.isoformat(): n for d, n in rows}
    before = db.scalar(select(func.count()).where(Memory.workspace_id == ws, func.date(Memory.created_at) < since)) or 0
    growth, running = [], before
    for i in range(days):
        d = (since + timedelta(days=i)).isoformat()
        running += per_day.get(d, 0)
        growth.append({"date": d, "created": per_day.get(d, 0), "total": running})

    now = datetime.now(UTC)
    active_keys = db.scalar(
        select(func.count()).where(
            ApiKey.workspace_id == ws, ApiKey.revoked_at.is_(None), (ApiKey.expires_at.is_(None)) | (ApiKey.expires_at > now)
        )
    )
    return {
        "total": sum(by_status.values()),
        "active": by_status.get("active", 0),
        "pending": by_status.get("pending", 0),
        "archived": by_status.get("archived", 0),
        "conflicted": by_status.get("conflicted", 0),
        "by_status": by_status,
        "by_category": by_category,
        "sources": db.scalar(select(func.count()).where(MemorySource.workspace_id == ws)),
        "ai_connections": db.scalar(select(func.count()).where(AIConnection.workspace_id == ws)),
        "api_keys": active_keys,
        "storage_bytes": db.scalar(text("select pg_database_size(current_database())")),
        "growth": growth,
    }


@router.get("/activity", response_model=Page[AuditOut])
def activity(
    p: CurrentPrincipal,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    action: str | None = None,
    actor_type: str | None = None,
    result: str | None = None,
):
    q = select(AuditLog).where(AuditLog.workspace_id == p.workspace_id)
    if action:
        q = q.where(AuditLog.action.startswith(action))
    if actor_type:
        q = q.where(AuditLog.actor_type.in_(actor_type.split(",")))
    if result:
        q = q.where(AuditLog.result.in_(result.split(",")))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return Page[AuditOut](items=[AuditOut.model_validate(r) for r in rows], total=total, page=page, page_size=page_size)
