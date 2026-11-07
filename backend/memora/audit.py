"""操作紀錄。只記錄動作、目標與少量 metadata，不寫入完整記憶內容。"""

from typing import Any

from sqlalchemy.orm import Session

from memora.models import AuditLog


def audit(
    db: Session,
    principal: Any,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    result: str = "success",
    **detail: Any,
) -> None:
    db.add(
        AuditLog(
            workspace_id=principal.workspace_id,
            actor_type=principal.type,
            actor_id=principal.id,
            actor_name=principal.name,
            action=action,
            target_type=target_type,
            target_id=target_id,
            result=result,
            detail=detail,
            ip=getattr(principal, "ip", None),
        )
    )
