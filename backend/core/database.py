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
        await conn.execute('CREATE EXTENSION IF NOT EXISTS vector')
        await conn.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')
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
        await conn.execute(KNOWLEDGE_DDL)
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


KNOWLEDGE_DDL = """
CREATE TABLE IF NOT EXISTS raw_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_name varchar(255) NOT NULL,
 file_type varchar(20) NOT NULL, file_hash varchar(64) UNIQUE, storage_path varchar(500) NOT NULL,
 parse_status varchar(30) DEFAULT 'PENDING', error_message text, chunk_count int DEFAULT 0,
 created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS kb_asset_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id uuid REFERENCES raw_documents(id) ON DELETE SET NULL,
 component_name varchar(100) NOT NULL, asset_type varchar(20) NOT NULL, asset_name varchar(255) NOT NULL,
 standard_function_desc text NOT NULL, common_interfaces text[], embedding vector(512), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS kb_damage_impacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id uuid REFERENCES raw_documents(id) ON DELETE SET NULL,
 applicable_asset_type varchar(20), security_attribute varchar(30), driving_state varchar(20), damage_scenario_template text NOT NULL,
 score_safety int DEFAULT 0, reason_safety text, score_financial int DEFAULT 0, reason_financial text,
 score_operational int DEFAULT 0, reason_operational text, score_privacy int DEFAULT 0, reason_privacy text,
 impact_level varchar(20), embedding vector(512), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS kb_threat_scenarios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id uuid REFERENCES raw_documents(id) ON DELETE SET NULL,
 source_type varchar(50) DEFAULT 'STRIDE_PATTERN', cve_id varchar(50), cvss_score numeric(3,1), stride_category varchar(30) NOT NULL,
 target_component varchar(100), threat_description_template text NOT NULL, attack_technique text,
 embedding vector(512), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS kb_attack_paths (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id uuid REFERENCES raw_documents(id) ON DELETE SET NULL,
 attack_surface varchar(100) NOT NULL, attack_chain_steps text NOT NULL,
 score_et int DEFAULT 0, reason_et text, score_exp int DEFAULT 0, reason_exp text, score_kn int DEFAULT 0, reason_kn text,
 score_wo int DEFAULT 0, reason_wo text, score_eq int DEFAULT 0, reason_eq text, feasibility_al varchar(20),
 embedding vector(512), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS kb_regulations_standards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doc_id uuid REFERENCES raw_documents(id) ON DELETE SET NULL,
 standard_name varchar(100) NOT NULL, clause_no varchar(100) NOT NULL, requirement_type varchar(50), clause_content text NOT NULL,
 mitigation_suggestion text, embedding vector(512), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS kb_golden_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_item varchar(100) NOT NULL, asset_id varchar(50), asset_type varchar(20),
 asset_name varchar(255), damage_scenario text, impact_total int, impact_level varchar(20), threat_scenario text,
 stride_category varchar(30), attack_path text, feasibility_total int, feasibility_al varchar(20), risk_level_sl varchar(20),
 treatment_decision varchar(50), cybersecurity_goal text, cybersecurity_claim text, adoption_count int DEFAULT 1,
 embedding vector(512), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS kb_correction_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tara_step int NOT NULL CHECK(tara_step BETWEEN 1 AND 5), target_component varchar(100),
 original_ai_content text, human_corrected_content text, derived_rule text NOT NULL, embedding vector(512), created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_kb_asset_embed ON kb_asset_templates USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kb_damage_embed ON kb_damage_impacts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kb_threat_embed ON kb_threat_scenarios USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kb_attack_embed ON kb_attack_paths USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kb_reg_embed ON kb_regulations_standards USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kb_golden_embed ON kb_golden_cases USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_kb_correction_embed ON kb_correction_rules USING hnsw (embedding vector_cosine_ops);
"""
