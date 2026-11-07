"""/imports：上傳 → 預覽（含重複偵測）→ 確認匯入 / 取消；錯誤可下載 CSV。"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from memora.api.deps import DB, CurrentPrincipal, require_user
from memora.audit import audit
from memora.config import get_settings
from memora.csvsafe import to_csv
from memora.importers import parsers
from memora.memory import service
from memora.models import ImportJob
from memora.schemas import ImportCommitIn, ImportJobDetail, ImportJobOut, MemoryCreate

router = APIRouter(prefix="/imports", tags=["imports"])

PLATFORMS = ("file", "chatgpt", "claude", "gemini", "deepseek")
PREVIEW_TTL = timedelta(hours=24)


def _close(job: ImportJob, status: str) -> None:
    """結束任務並清除暫存的原文：匯入後記憶本身是唯一副本，刪除記憶才算完整刪除。"""
    job.status = status
    job.items = []
    job.finished_at = datetime.now(UTC)


def _expire_stale(db, workspace_id: str) -> None:
    """超過 24 小時未確認的預覽自動取消並清除原文。"""
    cutoff = datetime.now(UTC) - PREVIEW_TTL
    stale = db.scalars(
        select(ImportJob).where(
            ImportJob.workspace_id == workspace_id, ImportJob.status == "previewed", ImportJob.created_at < cutoff
        )
    ).all()
    for job in stale:
        _close(job, "cancelled")
        job.options = {**job.options, "expired": True}
    if stale:
        db.commit()


def _job(db: DB, p, job_id: str) -> ImportJob:
    job = db.get(ImportJob, job_id)
    if not job or job.workspace_id != p.workspace_id:
        raise HTTPException(404, "找不到匯入任務")
    return job


@router.get("", response_model=list[ImportJobOut], dependencies=[require_user()])
def list_jobs(p: CurrentPrincipal, db: DB):
    _expire_stale(db, p.workspace_id)
    return db.scalars(
        select(ImportJob).where(ImportJob.workspace_id == p.workspace_id).order_by(ImportJob.created_at.desc()).limit(100)
    ).all()


@router.post("", response_model=ImportJobDetail, status_code=201, dependencies=[require_user(admin=True)])
async def upload(
    p: CurrentPrincipal,
    db: DB,
    file: UploadFile = File(...),
    platform: str = Form("file"),
    format: str | None = Form(None),
    default_category: str = Form("knowledge"),
):
    if platform not in PLATFORMS:
        raise HTTPException(422, f"platform 需為 {', '.join(PLATFORMS)}")
    fmt = format or parsers.detect_format(file.filename or "")
    if fmt not in parsers.FORMATS:
        raise HTTPException(422, "無法判斷檔案格式，支援 .json、.csv、.md、.txt")
    if parsers.normalize_category(default_category, "knowledge") is None:
        raise HTTPException(422, "未知的預設分類")
    limit = get_settings().import_max_mb * 1024 * 1024
    raw = await file.read(limit + 1)
    if len(raw) > limit:
        raise HTTPException(413, f"檔案超過 {get_settings().import_max_mb} MB")

    parsed = parsers.parse(fmt, raw, default_category)
    seen: dict[str, int] = {}
    items = []
    for i, it in enumerate(parsed.items):
        h = service.content_hash(it["content"])
        dup = service.find_duplicate(db, p.workspace_id, it["content"])
        dup_in_file = seen.get(h)
        seen.setdefault(h, i)
        items.append(
            {
                **it,
                "index": i,
                "duplicate_of": dup or (f"#{dup_in_file}" if dup_in_file is not None else None),
                "selected": not dup and dup_in_file is None,
            }
        )
    job = ImportJob(
        workspace_id=p.workspace_id,
        filename=(file.filename or "upload")[:300],
        format=fmt,
        platform=platform,
        status="previewed" if items else "failed",
        total=len(items),
        failed=len(parsed.errors),
        items=items,
        errors=parsed.errors,
        options={"default_category": default_category},
        created_by=p.actor,
    )
    db.add(job)
    audit(db, p, "import.upload", "import_job", job.id, format=fmt, items=len(items), errors=len(parsed.errors))
    db.commit()
    return job


@router.get("/{job_id}", response_model=ImportJobDetail, dependencies=[require_user()])
def get_job(job_id: str, p: CurrentPrincipal, db: DB):
    _expire_stale(db, p.workspace_id)
    return _job(db, p, job_id)


@router.post("/{job_id}/commit", response_model=ImportJobOut, dependencies=[require_user(admin=True)])
def commit(job_id: str, body: ImportCommitIn, p: CurrentPrincipal, db: DB):
    job = _job(db, p, job_id)
    if job.status != "previewed":
        raise HTTPException(409, f"任務狀態為 {job.status}，無法匯入")
    platform_type = job.platform if job.platform != "file" else "import"
    source = service.get_or_create_source(db, p.workspace_id, platform_type, job.filename, job.id)
    job.source_id = source.id
    exclude = set(body.exclude)
    imported = skipped = 0
    errors = list(job.errors)
    for it in job.items:
        if it["index"] in exclude or (body.skip_duplicates and it.get("duplicate_of")):
            skipped += 1
            continue
        try:
            with db.begin_nested():
                service.create_memory(
                    db,
                    p,
                    MemoryCreate(content=it["content"], category=it["category"], tags=it["tags"], status=body.status),
                    source=source,
                    check_duplicate=body.skip_duplicates,
                )
            imported += 1
        except service.DuplicateMemory as e:
            skipped += 1
            errors.append({"row": it["index"], "message": f"重複（{e.existing_id}）"})
        except ValueError as e:
            errors.append({"row": it["index"], "message": str(e)[:200]})
    job.imported, job.skipped, job.errors = imported, skipped, errors
    job.failed = len(errors)
    _close(job, "completed")
    job.options = {**job.options, "status": body.status, "skip_duplicates": body.skip_duplicates}
    audit(db, p, "import.commit", "import_job", job.id, imported=imported, skipped=skipped)
    db.commit()
    return job


@router.post("/{job_id}/cancel", response_model=ImportJobOut, dependencies=[require_user(admin=True)])
def cancel(job_id: str, p: CurrentPrincipal, db: DB):
    job = _job(db, p, job_id)
    if job.status != "previewed":
        raise HTTPException(409, f"任務狀態為 {job.status}，無法取消")
    _close(job, "cancelled")
    audit(db, p, "import.cancel", "import_job", job.id)
    db.commit()
    return job


@router.get("/{job_id}/errors.csv", dependencies=[require_user()])
def errors_csv(job_id: str, p: CurrentPrincipal, db: DB):
    job = _job(db, p, job_id)
    return Response(
        to_csv(["row", "message"], ([e.get("row"), e.get("message")] for e in job.errors)),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{job.id}-errors.csv"'},
    )
