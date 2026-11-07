"""Embedding 服務。

預設 disabled：不把任何記憶內容送出本機。啟用時呼叫 OpenAI 相容的 `/embeddings` 端點
（OpenAI、Ollama、LM Studio、vLLM…），由使用者自行設定 base URL 與金鑰。
"""

import logging

import httpx

from memora.config import get_settings

log = logging.getLogger(__name__)


class EmbeddingError(RuntimeError):
    pass


def enabled() -> bool:
    return get_settings().embedding_provider != "disabled"


def model_name() -> str:
    return get_settings().embedding_model


def embed(texts: list[str]) -> list[list[float]]:
    s = get_settings()
    if not enabled():
        raise EmbeddingError("Embedding 未啟用")
    headers = {"Authorization": f"Bearer {s.embedding_api_key}"} if s.embedding_api_key else {}
    try:
        res = httpx.post(
            f"{s.embedding_base_url.rstrip('/')}/embeddings",
            json={"model": s.embedding_model, "input": texts},
            headers=headers,
            timeout=s.embedding_timeout_s,
        )
        res.raise_for_status()
        data = sorted(res.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]
    except (httpx.HTTPError, KeyError, ValueError) as e:
        # 不記錄請求內容（可能含敏感記憶）
        raise EmbeddingError(f"Embedding 服務呼叫失敗：{type(e).__name__}") from e


def status() -> dict:
    s = get_settings()
    return {
        "provider": s.embedding_provider,
        "model": s.embedding_model if enabled() else None,
        "base_url": s.embedding_base_url if enabled() else None,
    }
