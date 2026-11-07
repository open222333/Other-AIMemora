"""/health、/storage、/settings、/api-keys。"""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from memora import __version__
from memora.api.deps import DB, CurrentPrincipal, require_user
from memora.audit import audit
from memora.memory.service import workspace_settings
from memora.models import ApiKey, Embedding, Memory, Workspace
from memora.retrieval import embeddings
from memora.schemas import ApiKeyCreate, ApiKeyCreated, ApiKeyOut, WorkspaceSettings, WorkspaceSettingsPatch
from memora.security.auth import generate_api_key

router = APIRouter()


def _pg_info(db: Session) -> dict:
    version = db.scalar(text("show server_version"))
    vector = db.scalar(text("select extversion from pg_extension where extname = 'vector'"))
    trgm = db.scalar(text("select extversion from pg_extension where extname = 'pg_trgm'"))
    return {"postgres": version, "pgvector": vector, "pg_trgm": trgm}


@router.get("/health", tags=["system"])
def health(db: DB):
    """公開端點：只回報狀態，不含任何資料。"""
    try:
        info = _pg_info(db)
        db_ok = True
    except Exception:  # noqa: BLE001
        info, db_ok = {}, False
    ok = db_ok and bool(info.get("pgvector"))
    return {
        "status": "ok" if ok else "degraded",
        "version": __version__,
        "database": "ok" if db_ok else "error",
        "pgvector": "ok" if info.get("pgvector") else "missing",
        "embedding": embeddings.status()["provider"],
        "time": datetime.now(UTC).isoformat(),
    }


@router.get("/storage", tags=["system"], dependencies=[require_user()])
def storage(p: CurrentPrincipal, db: DB):
    ws = p.workspace_id
    info = _pg_info(db)
    tables = [
        {"name": name, "rows": rows, "bytes": size}
        for name, rows, size in db.execute(
            text(
                "select relname, n_live_tup, pg_total_relation_size(relid) from pg_stat_user_tables "
                "where schemaname = 'public' and relname <> 'alembic_version' order by pg_total_relation_size(relid) desc"
            )
        )
    ]
    model = embeddings.model_name()
    memory_count = db.scalar(select(func.count()).where(Memory.workspace_id == ws)) or 0
    embedded = (
        db.scalar(
            select(func.count())
            .select_from(Embedding)
            .join(Memory, Memory.id == Embedding.memory_id)
            .where(Memory.workspace_id == ws, Embedding.model == model)
        )
        if embeddings.enabled()
        else 0
    )
    models = [
        {"model": m, "dim": d, "count": n}
        for m, d, n in db.execute(
            select(Embedding.model, Embedding.dim, func.count())
            .join(Memory, Memory.id == Embedding.memory_id)
            .where(Memory.workspace_id == ws)
            .group_by(Embedding.model, Embedding.dim)
        )
    ]
    return {
        "database": {**info, "size_bytes": db.scalar(text("select pg_database_size(current_database())"))},
        "memories": memory_count,
        "embedding": {
            **embeddings.status(),
            "embedded": embedded,
            "missing": max(memory_count - embedded, 0) if embeddings.enabled() else None,
            "models": models,
        },
        "index": {
            "vector": "exact (未建立 ANN 索引，適合個人規模)",
            "keyword": "gin_trgm_ops" if info.get("pg_trgm") else "missing",
        },
        "tables": tables,
        "backup": {
            "configured": False,
            "last_backup_at": None,
            "note": "Phase 1 以「匯出」與 pg_dump 備份，自動備份規劃於 Phase 4",
        },
    }


@router.post("/storage/reindex", tags=["system"], dependencies=[require_user(admin=True)])
def reindex(p: CurrentPrincipal, db: DB):
    """為缺少向量的記憶補建 embedding。"""
    from memora.memory.service import refresh_embedding

    if not embeddings.enabled():
        raise HTTPException(409, "Embedding 未啟用，請設定 MEMORA_EMBEDDING_PROVIDER")
    done = failed = 0
    for m in db.scalars(select(Memory).where(Memory.workspace_id == p.workspace_id)).unique():
        if refresh_embedding(db, m):
            done += 1
        else:
            failed += 1
    audit(db, p, "storage.reindex", None, None, done=done, failed=failed)
    db.commit()
    return {"embedded": done, "failed": failed}


# ── settings ──
@router.get("/settings", response_model=WorkspaceSettings, tags=["settings"], dependencies=[require_user()])
def get_settings_(p: CurrentPrincipal, db: DB):
    return workspace_settings(db, p.workspace_id)


@router.patch("/settings", response_model=WorkspaceSettings, tags=["settings"], dependencies=[require_user(admin=True)])
def patch_settings(body: WorkspaceSettingsPatch, p: CurrentPrincipal, db: DB):
    ws = db.get(Workspace, p.workspace_id)
    assert ws
    merged = WorkspaceSettings(**{**ws.settings, **body.model_dump(exclude_none=True)})
    ws.settings = merged.model_dump()
    if body.name:
        ws.name = body.name
    audit(db, p, "settings.update", "workspace", ws.id, fields=sorted(body.model_dump(exclude_none=True)))
    db.commit()
    return merged


# ── api keys ──
keys = APIRouter(prefix="/api-keys", tags=["api-keys"], dependencies=[require_user(admin=True)])


def _key(db: Session, p, key_id: str) -> ApiKey:
    k = db.get(ApiKey, key_id)
    if not k or k.workspace_id != p.workspace_id:
        raise HTTPException(404, "找不到 API Key")
    return k


@keys.get("", response_model=list[ApiKeyOut])
def list_keys(p: CurrentPrincipal, db: DB):
    return db.scalars(select(ApiKey).where(ApiKey.workspace_id == p.workspace_id).order_by(ApiKey.created_at.desc())).all()


@keys.post("", response_model=ApiKeyCreated, status_code=201)
def create_key(body: ApiKeyCreate, p: CurrentPrincipal, db: DB):
    raw, prefix, hashed = generate_api_key()
    k = ApiKey(
        workspace_id=p.workspace_id,
        name=body.name,
        prefix=prefix,
        key_hash=hashed,
        scopes=sorted(set(body.scopes)),
        subject=body.subject,
        created_by=p.actor,
        expires_at=body.expires_at,
    )
    db.add(k)
    db.flush()
    audit(db, p, "api_key.create", "api_key", k.id, scopes=k.scopes, subject=k.subject)
    db.commit()
    return ApiKeyCreated(**ApiKeyOut.model_validate(k).model_dump(), key=raw)


@keys.post("/{key_id}/revoke", response_model=ApiKeyOut)
def revoke_key(key_id: str, p: CurrentPrincipal, db: DB):
    k = _key(db, p, key_id)
    if not k.revoked_at:
        k.revoked_at = datetime.now(UTC)
        audit(db, p, "api_key.revoke", "api_key", k.id)
        db.commit()
    return k


@keys.post("/{key_id}/rotate", response_model=ApiKeyCreated)
def rotate_key(key_id: str, p: CurrentPrincipal, db: DB):
    """輪替：撤銷舊金鑰並以相同設定建立新金鑰。"""
    old = _key(db, p, key_id)
    if old.revoked_at:
        raise HTTPException(409, "已撤銷的金鑰無法輪替")
    old.revoked_at = datetime.now(UTC)
    raw, prefix, hashed = generate_api_key()
    k = ApiKey(
        workspace_id=p.workspace_id,
        name=old.name,
        prefix=prefix,
        key_hash=hashed,
        scopes=old.scopes,
        subject=old.subject,
        created_by=p.actor,
        expires_at=old.expires_at,
    )
    db.add(k)
    db.flush()
    audit(db, p, "api_key.rotate", "api_key", k.id, replaced=old.id)
    db.commit()
    return ApiKeyCreated(**ApiKeyOut.model_validate(k).model_dump(), key=raw)
