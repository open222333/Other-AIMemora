"""/export：完整匯出記憶（含標籤、來源、權限與版本歷史），可再由 /imports 匯回。"""

import json
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import Response
from sqlalchemy import select

from memora.api.deps import DB, CurrentPrincipal, require_user
from memora.audit import audit
from memora.csvsafe import to_csv
from memora.models import Memory, MemorySource, MemoryVersion

router = APIRouter(tags=["export"])


@router.get("/export", dependencies=[require_user()])
def export(p: CurrentPrincipal, db: DB, format: Literal["json", "csv"] = "json", include_versions: bool = True):
    memories = db.scalars(select(Memory).where(Memory.workspace_id == p.workspace_id).order_by(Memory.created_at)).unique().all()
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    audit(db, p, "data.export", None, None, format=format, count=len(memories))
    db.commit()

    if format == "csv":
        header = ["id", "content", "category", "tags", "status", "confidence", "source", "visibility", "created_at", "updated_at"]
        rows = (
            [
                m.id,
                m.content,
                m.category,
                ";".join(m.tags),
                m.status,
                m.confidence,
                m.source.name if m.source else "",
                ";".join(m.visibility),
                m.created_at.isoformat(),
                m.updated_at.isoformat(),
            ]
            for m in memories
        )
        return Response(
            to_csv(header, rows),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="memora-export-{stamp}.csv"'},
        )

    versions: dict[str, list[dict]] = {}
    if include_versions:
        ids = [m.id for m in memories]
        for v in db.scalars(select(MemoryVersion).where(MemoryVersion.memory_id.in_(ids)).order_by(MemoryVersion.version)):
            versions.setdefault(v.memory_id, []).append(
                {
                    "version": v.version,
                    "content": v.content,
                    "category": v.category,
                    "status": v.status,
                    "tags": v.tags,
                    "changed_by": v.changed_by,
                    "change_reason": v.change_reason,
                    "created_at": v.created_at.isoformat(),
                }
            )
    sources = db.scalars(select(MemorySource).where(MemorySource.workspace_id == p.workspace_id)).all()
    doc = {
        "format": "memora.export",
        "version": 1,
        "exported_at": datetime.now(UTC).isoformat(),
        "sources": [
            {"id": s.id, "type": s.type, "name": s.name, "reference": s.reference, "created_at": s.created_at.isoformat()}
            for s in sources
        ],
        "memories": [
            {
                "id": m.id,
                "content": m.content,
                "category": m.category,
                "tags": m.tags,
                "status": m.status,
                "confidence": m.confidence,
                "source_id": m.source_id,
                "visibility": m.visibility,
                "created_by": m.created_by,
                "created_at": m.created_at.isoformat(),
                "updated_at": m.updated_at.isoformat(),
                "expires_at": m.expires_at.isoformat() if m.expires_at else None,
                **({"versions": versions.get(m.id, [])} if include_versions else {}),
            }
            for m in memories
        ],
    }
    return Response(
        json.dumps(doc, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="memora-export-{stamp}.json"'},
    )
