"""RAG-only configuration. No LLM/provider settings belong here."""

import os
from pathlib import Path

from tara_core.config import load_env_file

load_env_file()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_PATH = PROJECT_ROOT.parent / "bge-small-zh-v1.5"
MODEL_PATH = Path(os.getenv("RAG_EMBEDDING_MODEL", str(DEFAULT_MODEL_PATH)))
EMBEDDING_BASE_URL = os.getenv("RAG_EMBEDDING_BASE_URL", "").rstrip("/")
EMBEDDING_MODEL_NAME = os.getenv("RAG_EMBEDDING_MODEL_NAME", "bge-small-zh-v1.5")
EMBEDDING_DIMENSION = int(os.getenv("RAG_EMBEDDING_DIMENSION", "512"))
QUERY_INSTRUCTION = os.getenv("RAG_QUERY_INSTRUCTION", "为这个句子生成表示以用于检索相关文章：")
MAX_SEQUENCE_LENGTH = int(os.getenv("RAG_MAX_SEQUENCE_LENGTH", "512"))


def validate_config() -> None:
    if EMBEDDING_BASE_URL:
        return
    if not MODEL_PATH.is_dir():
        raise RuntimeError(f"BGE 模型目录不存在：{MODEL_PATH}。请设置 RAG_EMBEDDING_MODEL。")
