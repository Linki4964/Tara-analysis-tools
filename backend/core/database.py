"""
PostgreSQL connection via asyncpg.  Gracefully degrades to no-op when
DATABASE_URL is not set, or asyncpg is not installed, so the application
works without a database.
"""

import os
from typing import Optional

from tara_core.config import load_env_file

_pool: Optional["asyncpg.Pool"] = None  # type: ignore[name-defined]


async def get_pool() -> Optional["asyncpg.Pool"]:  # type: ignore[name-defined]
    """Return the shared connection pool, or None when DB is not configured."""
    global _pool

    load_env_file()
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return None

    if _pool is None:
        try:
            import asyncpg
        except ImportError:
            return None
        _pool = await asyncpg.create_pool(url, min_size=1, max_size=5)

    return _pool


def is_database_configured() -> bool:
    load_env_file()
    return bool(os.getenv("DATABASE_URL", "").strip())


async def init_db() -> None:
    """Create tables if they don't exist.  Called once at application startup."""
    pool = await get_pool()
    if pool is None:
        return

    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_name TEXT NOT NULL DEFAULT '',
                status      TEXT NOT NULL DEFAULT 'draft',
                document_filename TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS step_results (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
                step_number INT NOT NULL,
                step_name   TEXT NOT NULL DEFAULT '',
                result_data JSONB NOT NULL DEFAULT '{}',
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (run_id, step_number)
            )
        """)


async def close_db() -> None:
    """Close the connection pool.  Called at application shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
