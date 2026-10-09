"""TARA knowledge-base persistence, ingestion and hybrid retrieval."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from fastapi import HTTPException

from backend.core.database import get_pool
from backend.rag.embeddings import encode_document, encode_query, vector_literal


LIBRARIES: dict[str, dict[str, Any]] = {
    "assets": {
        "table": "kb_asset_templates",
        "required": ["component_name", "asset_type", "asset_name", "standard_function_desc"],
        "text": ["component_name", "asset_name", "standard_function_desc"],
        "fields": ["component_name", "asset_type", "asset_name", "standard_function_desc", "common_interfaces"],
    },
    "damages": {
        "table": "kb_damage_impacts",
        "required": ["damage_scenario_template"],
        "text": ["damage_scenario_template", "reason_safety", "reason_financial", "reason_operational", "reason_privacy"],
        "fields": ["applicable_asset_type", "security_attribute", "driving_state", "damage_scenario_template", "score_safety", "reason_safety", "score_financial", "reason_financial", "score_operational", "reason_operational", "score_privacy", "reason_privacy", "impact_level"],
    },
    "threats": {
        "table": "kb_threat_scenarios",
        "required": ["stride_category", "threat_description_template"],
        "text": ["cve_id", "target_component", "threat_description_template", "attack_technique"],
        "fields": ["source_type", "cve_id", "cvss_score", "stride_category", "target_component", "threat_description_template", "attack_technique"],
    },
    "attack-paths": {
        "table": "kb_attack_paths",
        "required": ["attack_surface", "attack_chain_steps"],
        "text": ["attack_surface", "attack_chain_steps", "reason_et", "reason_exp", "reason_kn", "reason_wo", "reason_eq"],
        "fields": ["attack_surface", "attack_chain_steps", "score_et", "reason_et", "score_exp", "reason_exp", "score_kn", "reason_kn", "score_wo", "reason_wo", "score_eq", "reason_eq", "feasibility_al"],
    },
    "regulations": {
        "table": "kb_regulations_standards",
        "required": ["standard_name", "clause_no", "clause_content"],
        "text": ["standard_name", "clause_no", "clause_content", "mitigation_suggestion"],
        "fields": ["standard_name", "clause_no", "requirement_type", "clause_content", "mitigation_suggestion"],
    },
    "golden-cases": {
        "table": "kb_golden_cases",
        "required": ["project_item"],
        "text": ["project_item", "asset_name", "damage_scenario", "threat_scenario", "attack_path", "cybersecurity_goal", "cybersecurity_claim"],
        "fields": ["project_item", "asset_id", "asset_type", "asset_name", "damage_scenario", "impact_total", "impact_level", "threat_scenario", "stride_category", "attack_path", "feasibility_total", "feasibility_al", "risk_level_sl", "treatment_decision", "cybersecurity_goal", "cybersecurity_claim", "adoption_count"],
    },
    "corrections": {
        "table": "kb_correction_rules",
        "required": ["tara_step", "derived_rule"],
        "text": ["target_component", "original_ai_content", "human_corrected_content", "derived_rule"],
        "fields": ["tara_step", "target_component", "original_ai_content", "human_corrected_content", "derived_rule"],
    },
}


def _spec(library: str) -> dict[str, Any]:
    if library not in LIBRARIES:
        raise HTTPException(404, f"Unknown knowledge library: {library}")
    return LIBRARIES[library]


async def list_entries(library: str, query: str = "", page: int = 1, page_size: int = 20) -> dict[str, Any]:
    spec = _spec(library)
    pool = await get_pool()
    if pool is None:
        raise HTTPException(503, "知识库数据库未配置，请设置 DATABASE_URL")
    page, page_size = max(page, 1), min(max(page_size, 1), 100)
    where, args = "", []
    if query.strip():
        args.append(f"%{query.strip()}%")
        joined = " || ' ' || ".join(f"COALESCE({field}::text, '')" for field in spec["text"])
        where = f" WHERE ({joined}) ILIKE $1"
    async with pool.acquire() as conn:
        total = await conn.fetchval(f'SELECT count(*) FROM {spec["table"]}{where}', *args)
        args.extend([page_size, (page - 1) * page_size])
        rows = await conn.fetch(f'SELECT * FROM {spec["table"]}{where} ORDER BY created_at DESC LIMIT ${len(args)-1} OFFSET ${len(args)}', *args)
    return {"items": [_serialize(row) for row in rows], "total": total, "page": page, "pageSize": page_size}


async def create_entry(library: str, payload: dict[str, Any], doc_id: str | None = None) -> dict[str, Any]:
    spec = _spec(library)
    missing = [field for field in spec["required"] if payload.get(field) in (None, "")]
    if missing:
        raise HTTPException(422, f"Missing required fields: {', '.join(missing)}")
    fields = [field for field in spec["fields"] if field in payload]
    values = [payload[field] for field in fields]
    if "common_interfaces" in fields and isinstance(values[fields.index("common_interfaces")], str):
        values[fields.index("common_interfaces")] = [x.strip() for x in values[fields.index("common_interfaces")].split(",") if x.strip()]
    searchable = " ".join(str(payload.get(field, "")) for field in spec["text"])
    fields += ["embedding"]
    values += [vector_literal(encode_document(searchable))]
    if doc_id and library not in ("golden-cases", "corrections"):
        fields.insert(0, "doc_id")
        values.insert(0, doc_id)
    placeholders = [f"${i}" for i in range(1, len(values) + 1)]
    placeholders[-1] += "::vector"
    pool = await get_pool()
    if pool is None:
        raise HTTPException(503, "知识库数据库未配置，请设置 DATABASE_URL")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(f'INSERT INTO {spec["table"]} ({", ".join(fields)}) VALUES ({", ".join(placeholders)}) RETURNING *', *values)
    return _serialize(row)


async def update_entry(library: str, entry_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    spec = _spec(library)
    fields = [field for field in spec["fields"] if field in payload]
    if not fields:
        raise HTTPException(422, "No editable fields supplied")
    current_pool = await get_pool()
    if current_pool is None:
        raise HTTPException(503, "知识库数据库未配置，请设置 DATABASE_URL")
    async with current_pool.acquire() as conn:
        current = await conn.fetchrow(f'SELECT * FROM {spec["table"]} WHERE id=$1::uuid', entry_id)
        if not current:
            raise HTTPException(404, "Knowledge entry not found")
        merged = dict(current)
        merged.update(payload)
        searchable = " ".join(str(merged.get(field, "")) for field in spec["text"])
        values = [payload[field] for field in fields] + [vector_literal(encode_document(searchable)), entry_id]
        sets = [f"{field}=${i}" for i, field in enumerate(fields, 1)]
        sets.append(f"embedding=${len(fields)+1}::vector")
        row = await conn.fetchrow(f'UPDATE {spec["table"]} SET {", ".join(sets)} WHERE id=${len(values)}::uuid RETURNING *', *values)
    return _serialize(row)


async def delete_entry(library: str, entry_id: str) -> bool:
    spec = _spec(library)
    pool = await get_pool()
    if pool is None:
        raise HTTPException(503, "知识库数据库未配置，请设置 DATABASE_URL")
    async with pool.acquire() as conn:
        result = await conn.execute(f'DELETE FROM {spec["table"]} WHERE id=$1::uuid', entry_id)
    return result.endswith("1")


async def search(library: str, query: str, top_k: int = 5) -> list[dict[str, Any]]:
    spec = _spec(library)
    if not query.strip():
        raise HTTPException(422, "query is required")
    vector = vector_literal(encode_query(query))
    joined = " || ' ' || ".join(f"COALESCE({field}::text, '')" for field in spec["text"])
    pool = await get_pool()
    if pool is None:
        raise HTTPException(503, "知识库数据库未配置，请设置 DATABASE_URL")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f'''SELECT *, (0.72 * (1 - (embedding <=> $1::vector)) +
                0.28 * CASE WHEN ({joined}) ILIKE $2 THEN 1 ELSE 0 END) AS relevance
                FROM {spec["table"]} WHERE embedding IS NOT NULL
                ORDER BY relevance DESC LIMIT $3''', vector, f"%{query}%", min(max(top_k, 1), 30))
    return [_serialize(row) for row in rows]


async def asset_overview() -> dict[str, Any]:
    pool = await get_pool()
    if pool is None:
        raise HTTPException(503, "知识库数据库未配置，请设置 DATABASE_URL")
    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT count(*) FROM kb_asset_templates")
        types = await conn.fetch("SELECT asset_type, count(*) AS count FROM kb_asset_templates GROUP BY asset_type")
        components = await conn.fetch("SELECT component_name, count(*) AS count FROM kb_asset_templates GROUP BY component_name ORDER BY count DESC LIMIT 10")
        interfaces = await conn.fetch("SELECT interface, count(*) AS count FROM kb_asset_templates CROSS JOIN LATERAL unnest(COALESCE(common_interfaces, ARRAY[]::text[])) interface GROUP BY interface ORDER BY count DESC LIMIT 10")
    by_type = {key: 0 for key in ("Da", "Hw", "Sw", "Ee", "Dt")}
    by_type.update({str(row["asset_type"]): row["count"] for row in types})
    return {"total": total, "byType": by_type,
            "topComponents": [[row["component_name"], row["count"]] for row in components],
            "topInterfaces": [[row["interface"], row["count"]] for row in interfaces]}


def classify(text: str, filename: str) -> str:
    lower = filename.lower()
    if "cve" in lower or re.search(r"CVE-\d{4}-\d{4,7}", text, re.I):
        return "threats"
    if any(term in lower for term in ("iso", "21434", "r155", "r156", "gb", "standard")) or re.search(r"\b(clause|annex|requirement)\b|条款|法规", text[:3000], re.I):
        return "regulations"
    if re.search(r"CsDS_|CsTS_|AS_(Da|Hw|Sw|Ee|Dt)_|AP-", text):
        return "golden-cases"
    return "assets"


async def ingest_text(filename: str, file_type: str, content: bytes, text: str, target: str | None = None) -> dict[str, Any]:
    library = target or classify(text, filename)
    _spec(library)
    digest = hashlib.sha256(content).hexdigest()
    pool = await get_pool()
    if pool is None:
        raise HTTPException(503, "知识库数据库未配置，请设置 DATABASE_URL")
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id, parse_status, chunk_count FROM raw_documents WHERE file_hash=$1", digest)
        if existing:
            return {"documentId": str(existing["id"]), "library": library, "chunkCount": existing["chunk_count"], "duplicate": True}
        doc_id = await conn.fetchval("INSERT INTO raw_documents(file_name,file_type,file_hash,storage_path,parse_status) VALUES($1,$2,$3,$4,'PROCESSING') RETURNING id", filename, file_type, digest, f"database://raw/{digest}")
    chunks = [chunk.strip() for chunk in re.split(r"\n\s*\n|(?=CVE-\d{4}-\d{4,7})", text) if len(chunk.strip()) >= 20][:500]
    if not chunks:
        chunks = [text[:12000]]
    created = 0
    try:
        for index, chunk in enumerate(chunks):
            payload = _payload_from_chunk(library, chunk, filename, index)
            await create_entry(library, payload, str(doc_id))
            created += 1
        async with pool.acquire() as conn:
            await conn.execute("UPDATE raw_documents SET parse_status='COMPLETED', chunk_count=$1 WHERE id=$2", created, doc_id)
    except Exception as exc:
        async with pool.acquire() as conn:
            await conn.execute("UPDATE raw_documents SET parse_status='FAILED', error_message=$1, chunk_count=$2 WHERE id=$3", str(exc), created, doc_id)
        raise
    return {"documentId": str(doc_id), "library": library, "chunkCount": created, "duplicate": False}


def _payload_from_chunk(library: str, chunk: str, filename: str, index: int) -> dict[str, Any]:
    if library == "threats":
        cve = re.search(r"CVE-\d{4}-\d{4,7}", chunk, re.I)
        return {"source_type": "CVE_VULNERABILITY" if cve else "STRIDE_PATTERN", "cve_id": cve.group(0).upper() if cve else None, "stride_category": "Tampering", "threat_description_template": chunk[:8000]}
    if library == "regulations":
        clause = re.search(r"(?:Clause|条款|第)\s*([\w.\-]+)", chunk, re.I)
        return {"standard_name": filename.rsplit(".", 1)[0], "clause_no": clause.group(1) if clause else f"AUTO-{index+1}", "requirement_type": "MANDATORY", "clause_content": chunk[:12000]}
    if library == "golden-cases":
        return {"project_item": filename.rsplit(".", 1)[0], "asset_name": f"导入案例 {index+1}", "threat_scenario": chunk[:8000]}
    return {"component_name": filename.rsplit(".", 1)[0][:100], "asset_type": "Sw", "asset_name": f"导入资产 {index+1}", "standard_function_desc": chunk[:8000]}


def _serialize(row: Any) -> dict[str, Any]:
    result = dict(row)
    result.pop("embedding", None)
    for key, value in list(result.items()):
        if hasattr(value, "isoformat"):
            result[key] = value.isoformat()
        elif not isinstance(value, (str, int, float, bool, list, dict, type(None))):
            result[key] = str(value)
    return result
