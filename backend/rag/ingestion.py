"""Document classification, chunking and directed ingestion entry points."""

from backend.services.knowledge import classify, ingest_text

__all__ = ["classify", "ingest_text"]
