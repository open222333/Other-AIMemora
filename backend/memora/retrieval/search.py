"""Hybrid Search：條件篩選 → 關鍵字（子字串 + trigram）→ 向量 → RRF 融合排序 → 權限再確認。

關鍵字搜尋使用 ILIKE 子字串比對，數字、型號、版本號（例如 RTX 4090 與 RTX 4080）會被精確區分，
不會只靠語意相似度混為一談。
"""

from dataclasses import dataclass, field

from sqlalchemy import Float, case, cast, func, literal, or_, select
from sqlalchemy.orm import Session

from memora.api.deps import Principal
from memora.memory import service
from memora.models import Embedding, Memory, MemoryTag
from memora.retrieval import embeddings
from memora.schemas import SearchIn

RRF_K = 60
CANDIDATES = 50


@dataclass
class Hit:
    memory: Memory
    score: float = 0.0
    matched_by: list[str] = field(default_factory=list)


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def terms_of(query: str) -> list[str]:
    out: list[str] = []
    for t in query.split():
        t = t.strip()
        if t and t.lower() not in (x.lower() for x in out):
            out.append(t)
    return out[:10] or [query.strip()]


def _filtered(p: Principal, req: SearchIn):
    q = service.base_query(p)
    if req.category:
        q = q.where(Memory.category.in_(req.category))
    if req.tags:
        q = q.where(service.tag_filter([t.lower() for t in req.tags]))
    if req.status:
        q = q.where(Memory.status.in_(req.status))
    elif not p.is_ai:
        q = q.where(Memory.status.notin_(["rejected"]))
    return q


def keyword_search(db: Session, p: Principal, req: SearchIn) -> list[Memory]:
    terms = terms_of(req.query)
    matches = []
    for t in terms:
        like = f"%{_escape_like(t)}%"
        tag_hit = select(MemoryTag.memory_id).where(MemoryTag.memory_id == Memory.id, func.lower(MemoryTag.tag) == t.lower())
        matches.append(or_(Memory.content.ilike(like, escape="\\"), tag_hit.exists()))
    matched_count = sum((case((m, 1), else_=0) for m in matches), literal(0))
    # 全部詞都命中者優先，其次 trigram 相似度，最後新舊
    score = cast(matched_count, Float) + func.word_similarity(req.query, Memory.content)
    q = _filtered(p, req).where(or_(*matches)).order_by(score.desc(), Memory.updated_at.desc()).limit(CANDIDATES)
    return list(db.scalars(q).unique())


def semantic_search(db: Session, p: Principal, req: SearchIn) -> list[Memory]:
    if not embeddings.enabled():
        return []
    try:
        [vec] = embeddings.embed([req.query])
    except embeddings.EmbeddingError:
        return []
    distance = Embedding.vector.cosine_distance(vec)
    q = (
        _filtered(p, req)
        .join(Embedding, Embedding.memory_id == Memory.id)
        .where(Embedding.model == embeddings.model_name(), Embedding.dim == len(vec))
        .order_by(distance)
        .limit(CANDIDATES)
    )
    return list(db.scalars(q).unique())


def search(db: Session, p: Principal, req: SearchIn) -> tuple[list[Hit], bool]:
    hits: dict[str, Hit] = {}

    def fuse(rows: list[Memory], label: str, weight: float = 1.0):
        for rank, m in enumerate(rows):
            h = hits.setdefault(m.id, Hit(m))
            h.score += weight / (RRF_K + rank + 1)
            h.matched_by.append(label)

    if req.mode in ("hybrid", "keyword"):
        fuse(keyword_search(db, p, req), "keyword", weight=1.2)  # 精確詞略加權
    semantic_ok = embeddings.enabled()
    if req.mode in ("hybrid", "semantic"):
        fuse(semantic_search(db, p, req), "semantic")

    ranked = sorted(hits.values(), key=lambda h: (h.score, h.memory.confidence, h.memory.updated_at), reverse=True)
    # 輸出前再次確認權限
    ranked = [h for h in ranked if service.can_read(p, h.memory)][: req.limit]
    return ranked, semantic_ok
