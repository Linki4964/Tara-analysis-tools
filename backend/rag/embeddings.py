"""Local BGE embedding adapter.

Documents are encoded without an instruction. Retrieval queries use BGE's
Chinese retrieval instruction, matching the model author's recommendation.
"""

from functools import lru_cache
from typing import Iterable

from .config import EMBEDDING_DIMENSION, MAX_SEQUENCE_LENGTH, MODEL_PATH, QUERY_INSTRUCTION, validate_config


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
    vectors = get_model().encode(values, normalize_embeddings=True, show_progress_bar=False)
    return [vector.tolist() for vector in vectors]


def encode_document(text: str) -> list[float]:
    return encode_documents([text])[0]


def encode_query(text: str) -> list[float]:
    return encode_documents([f"{QUERY_INSTRUCTION}{text}"])[0]


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"
