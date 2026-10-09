"""Public API for the standalone TARA RAG subsystem.

Review order: config.py -> embeddings.py -> registry.py -> retriever.py -> ingestion.py.
Database CRUD lives in repository.py (currently backed by the existing knowledge store).
"""

from .registry import LIBRARIES
from .repository import asset_overview, create_entry, delete_entry, list_documents, list_entries, update_entry
from .retriever import search
from .ingestion import classify, ingest_text

__all__ = ["LIBRARIES", "asset_overview", "create_entry", "delete_entry", "list_documents", "list_entries",
           "update_entry", "search", "classify", "ingest_text"]
