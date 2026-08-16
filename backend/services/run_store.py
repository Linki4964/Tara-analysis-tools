"""
CRUD helpers for persisted TARA analysis runs.
All functions are async; they return None / empty lists when the database is not
configured (DATABASE_URL is unset), so callers don't need to branch.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from backend.core.database import get_pool

# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


async def create_run(project_name: str, document_filename: str | None = None) -> str | None:
    """Insert a new run row.  Returns the new run UUID, or None."""
    pool = await get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO runs (project_name, document_filename) VALUES ($1, $2) RETURNING id",
            project_name or "",
            document_filename or "",
        )
        return str(row["id"]) if row else None


async def save_step_result(
    run_id: str,
    step_number: int,
    step_name: str,
    result_data: dict[str, Any],
) -> bool:
    """Upsert a step result.  Returns True on success."""
    pool = await get_pool()
    if pool is None:
        return False
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO step_results (run_id, step_number, step_name, result_data)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (run_id, step_number)
            DO UPDATE SET step_name   = EXCLUDED.step_name,
                          result_data = EXCLUDED.result_data,
                          created_at  = now()
            """,
            run_id,
            step_number,
            step_name,
            json.dumps(result_data, ensure_ascii=False),
        )
        return True


async def complete_run(run_id: str) -> bool:
    """Mark a run as completed."""
    pool = await get_pool()
    if pool is None:
        return False
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE runs SET status = 'completed', updated_at = now() WHERE id = $1",
            run_id,
        )
        return result != "UPDATE 0"


async def list_runs() -> list[dict[str, Any]]:
    """Return all runs with step counts, newest first (summary only)."""
    pool = await get_pool()
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT r.id, r.project_name, r.status, r.document_filename,
                   r.created_at, r.updated_at,
                   COUNT(sr.id) AS step_count
            FROM runs r
            LEFT JOIN step_results sr ON sr.run_id = r.id
            GROUP BY r.id
            ORDER BY r.created_at DESC
            """
        )
        return [
            {
                "id": str(row["id"]),
                "project_name": row["project_name"],
                "status": row["status"],
                "document_filename": row["document_filename"],
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
                "step_count": row["step_count"],
            }
            for row in rows
        ]


async def get_run(run_id: str) -> dict[str, Any] | None:
    """Return a single run with all step_results attached."""
    pool = await get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:
        run_row = await conn.fetchrow(
            "SELECT id, project_name, status, document_filename, created_at, updated_at FROM runs WHERE id = $1",
            run_id,
        )
        if run_row is None:
            return None

        step_rows = await conn.fetch(
            "SELECT step_number, step_name, result_data, created_at FROM step_results WHERE run_id = $1 ORDER BY step_number",
            run_id,
        )

        return {
            "id": str(run_row["id"]),
            "project_name": run_row["project_name"],
            "status": run_row["status"],
            "document_filename": run_row["document_filename"],
            "created_at": run_row["created_at"].isoformat(),
            "updated_at": run_row["updated_at"].isoformat(),
            "steps": [
                {
                    "step_number": s["step_number"],
                    "step_name": s["step_name"],
                    "result_data": json.loads(s["result_data"]) if isinstance(s["result_data"], str) else s["result_data"],
                    "created_at": s["created_at"].isoformat(),
                }
                for s in step_rows
            ],
        }


async def delete_run(run_id: str) -> bool:
    """Delete a run (cascades to step_results)."""
    pool = await get_pool()
    if pool is None:
        return False
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM runs WHERE id = $1", run_id)
        return result != "DELETE 0"


# ---------------------------------------------------------------------------
# Project-level helpers (a project = all runs sharing a project_name)
# ---------------------------------------------------------------------------


async def rename_project(old_name: str, new_name: str) -> int:
    """Rename every run belonging to a project.  Returns the number of rows updated."""
    pool = await get_pool()
    if pool is None:
        return 0
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE runs SET project_name = $1, updated_at = now() WHERE project_name = $2",
            new_name,
            old_name,
        )
        return _row_count(result)


async def delete_project(project_name: str) -> int:
    """Delete every run of a project (cascades to step_results).  Returns the number deleted."""
    pool = await get_pool()
    if pool is None:
        return 0
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM runs WHERE project_name = $1", project_name)
        return _row_count(result)


async def update_run_metadata(run_id: str, document_filename: str | None = None) -> bool:
    """Update metadata of a single run (e.g. its document filename)."""
    pool = await get_pool()
    if pool is None:
        return False
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE runs SET document_filename = $2, updated_at = now() WHERE id = $1",
            run_id,
            document_filename or "",
        )
        return result != "UPDATE 0"


def _row_count(result: str) -> int:
    """Parse the 'UPDATE N' / 'DELETE N' tag returned by asyncpg."""
    try:
        return int(result.split()[-1])
    except (IndexError, ValueError):
        return 0
