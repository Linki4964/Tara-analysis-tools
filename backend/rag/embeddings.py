"""Local BGE embedding adapter.

Documents are encoded without an instruction. Retrieval queries use BGE's
Chinese retrieval instruction, matching the model author's recommendation.
"""

from functools import lru_cache
import json
from typing import Iterable
import urllib.error
import urllib.request

from .config import EMBEDDING_BASE_URL, EMBEDDING_DIMENSION, EMBEDDING_MODEL_NAME, MAX_SEQUENCE_LENGTH, MODEL_PATH, QUERY_INSTRUCTION, validate_config


@lru_cache(maxsize=1)
def get_model():
    validate_config()
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        raise RuntimeError("缺少 sentence-transformers，请执行 pip install -r requirements.txt") from error
    model = SentenceTransformer(str(MODEL_PATH), device="cpu", local_files_only=True)
    model.max_seq_length = MAX_SEQUENCE_LENGTH
    dimension = model.get_sentence_embedding_dimension()
    if dimension != EMBEDDING_DIMENSION:
        raise RuntimeError(f"模型输出维度为 {dimension}，但配置为 {EMBEDDING_DIMENSION}")
    return model


def encode_documents(texts: Iterable[str]) -> list[list[float]]:
    values = list(texts)
    if not values:
        return []
    if EMBEDDING_BASE_URL:
        return _encode_remote(values)
    vectors = get_model().encode(values, normalize_embeddings=True, show_progress_bar=False)
    return [vector.tolist() for vector in vectors]


def _encode_remote(texts: list[str]) -> list[list[float]]:
    body = json.dumps({"model": EMBEDDING_MODEL_NAME, "input": texts, "encoding_format": "float"}).encode("utf-8")
    request = urllib.request.Request(
        f"{EMBEDDING_BASE_URL}/embeddings", data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer local"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f"无法连接 Embedding 服务 {EMBEDDING_BASE_URL}: {error}") from error
    rows = sorted(payload.get("data", []), key=lambda row: row.get("index", 0))
    vectors = [row.get("embedding") for row in rows]
    if len(vectors) != len(texts) or any(not isinstance(vector, list) or len(vector) != EMBEDDING_DIMENSION for vector in vectors):
        raise RuntimeError("Embedding 服务返回的向量数量或维度不正确")
    return vectors


def encode_document(text: str) -> list[float]:
    return encode_documents([text])[0]


def encode_query(text: str) -> list[float]:
    return encode_documents([f"{QUERY_INSTRUCTION}{text}"])[0]


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"
