"""Migrate existing RAG vectors to local bge-small-zh-v1.5 (512 dimensions).

Content columns are preserved. Only vector indexes/values are rebuilt.
Usage: python scripts/migrate_rag_to_bge.py
"""

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.rag.embeddings import encode_documents, vector_literal  # noqa: E402
from backend.services.knowledge import LIBRARIES  # noqa: E402
from tara_core.config import load_env_file  # noqa: E402


INDEXES = {
    "kb_asset_templates": "idx_kb_asset_embed",
    "kb_damage_impacts": "idx_kb_damage_embed",
    "kb_threat_scenarios": "idx_kb_threat_embed",
    "kb_attack_paths": "idx_kb_attack_embed",
    "kb_regulations_standards": "idx_kb_reg_embed",
    "kb_golden_cases": "idx_kb_golden_embed",
    "kb_correction_rules": "idx_kb_correction_embed",
}


async def main() -> None:
    load_env_file()
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL 未配置")
    try:
        import asyncpg
    except ImportError as error:
        raise SystemExit("缺少 asyncpg，请先安装 requirements.txt") from error

    connection = await asyncpg.connect(database_url)
    try:
        migrated = 0
        skipped = 0
        for library, spec in LIBRARIES.items():
            table = spec["table"]
            index = INDEXES[table]
            exists = await connection.fetchval("SELECT to_regclass($1)", table)
            if not exists:
                print(f"[{library}] 表不存在，跳过（应用启动时会创建 512 维新表）。")
                skipped += 1
                continue
            print(f"[{library}] 调整向量列为 512 维……")
            await connection.execute(f"DROP INDEX IF EXISTS {index}")
            # Existing vectors cannot be cast between dimensions; content is retained
            # and every vector is regenerated immediately below.
            await connection.execute(f"ALTER TABLE {table} ALTER COLUMN embedding TYPE vector(512) USING NULL::vector(512)")
            rows = await connection.fetch(f"SELECT * FROM {table} ORDER BY created_at")
            for start in range(0, len(rows), 64):
                batch = rows[start:start + 64]
                texts = [" ".join(str(dict(row).get(field) or "") for field in spec["text"]) for row in batch]
                vectors = encode_documents(texts)
                await connection.executemany(
                    f"UPDATE {table} SET embedding=$1::vector WHERE id=$2",
                    [(vector_literal(vector), row["id"]) for row, vector in zip(batch, vectors)],
                )
                print(f"  {min(start + len(batch), len(rows))}/{len(rows)}")
            await connection.execute(f"CREATE INDEX {index} ON {table} USING hnsw (embedding vector_cosine_ops)")
            migrated += 1
        print(f"迁移结束：已迁移 {migrated} 张表，跳过 {skipped} 张表。")
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
