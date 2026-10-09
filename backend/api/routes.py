from time import perf_counter
from urllib.parse import quote

from fastapi import APIRouter, UploadFile, File, Query
from fastapi.responses import JSONResponse, Response
from fastapi.concurrency import run_in_threadpool

from backend.schemas import (
    ApiConfigRequest,
    AssetRequest,
    AttackPathRequest,
    DiagramRequest,
    ExportExcelRequest,
    ItemDefinitionRequest,
    RiskTreatmentRequest,
    StructureDocxRequest,
    ThreatRequest,
)
from backend.services.file_extraction import extract_upload
from backend import rag as knowledge
from backend.services.asset_import import parse_assets_with_ai
from backend.core.database import is_database_configured
from tara_core.config import (
    activate_saved_config,
    build_provider_info,
    clear_runtime_config,
    delete_saved_config,
    get_current_api_key,
    get_runtime_config,
    list_saved_configs,
    resolve_provider,
    save_current_config,
    set_runtime_config,
)
from tara_core.llm import LLMError, call_llm_with_info
from tara_core.providers import describe_providers, is_masked_key
from tara_core import services
from tara_core.export_excel import export_to_excel
from backend.services.run_store import (
    complete_run,
    create_run,
    delete_project,
    delete_run,
    get_run,
    list_runs,
    rename_project,
    save_step_result,
    update_run_metadata,
)


router = APIRouter()


def to_payload(request) -> dict:
    if hasattr(request, "model_dump"):
        return request.model_dump()
    return request.dict()


def _is_masked_key(api_key: str) -> bool:
    """Whether the submitted key is a masked echo of an already-stored key."""
    if not is_masked_key(api_key):
        return False
    return bool(get_current_api_key())


def service_response(payload: dict):
    if payload.get("success") is False:
        status_code = payload.get("statusCode", 400)
        return JSONResponse(status_code=status_code, content=payload)
    return payload


def run_service(service, payload: dict):
    try:
        return service_response(service(payload))
    except LLMError as error:
        return JSONResponse(
            status_code=error.status_code,
            content={"success": False, "error": "LLM call failed.", "message": str(error)},
        )
    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Analysis failed.", "message": str(error)},
        )


async def _maybe_save_step(run_id: str | None, step_number: int, step_name: str, result: dict) -> None:
    """If a runId was provided, persist the successful step result."""
    if not run_id:
        return
    try:
        await save_step_result(run_id, step_number, step_name, result)
    except Exception:
        pass  # persistence is best-effort; don't break the response


async def _rag_context(libraries: list[str], query: str) -> str:
    """Best-effort RAG augmentation; analysis remains usable without PostgreSQL."""
    if not query.strip() or not is_database_configured():
        return ""
    blocks: list[str] = []
    for library in libraries:
        try:
            rows = await knowledge.search(library, query, 3)
            for row in rows:
                row.pop("relevance", None)
                blocks.append(f"[{library}] {row}")
        except Exception:
            continue
    return "\n".join(blocks)


def _append_rag(payload: dict, field: str, context: str) -> None:
    if context:
        payload[field] = f"{payload.get(field, '')}\n\n【RAG 专家知识，仅作分析依据】\n{context}".strip()


@router.get("/providers")
def get_providers():
    """Return the provider catalog (defaults, auth style, capability flags).

    The settings page renders its options from this list so the frontend never
    needs its own copy of the per-provider defaults.
    """
    return {"success": True, "providers": describe_providers()}


@router.get("/config")
def get_config():
    """Return the current API configuration (key masked)."""
    return {"success": True, "config": get_runtime_config()}


@router.post("/config")
def set_config(request: ApiConfigRequest):
    """Set runtime API configuration.

    The settings page loads the masked key from ``GET /api/config`` and posts it
    back unchanged when the user edits only the model or base URL.  Without this
    guard that round-trip would overwrite the stored key with its masked form
    (``sk-a****wxyz``), silently destroying it.  So a key that is clearly a mask
    is treated as "unchanged" rather than as a new value.
    """
    api_key = request.api_key or ""
    if _is_masked_key(api_key):
        api_key = get_current_api_key()

    set_runtime_config(
        provider=request.provider,
        api_key=api_key,
        model=request.model or "",
        base_url=request.base_url or "",
    )
    info = resolve_provider()
    return {
        "success": True,
        "provider": info.provider if info else "none",
        "model": info.model if info else None,
        "hasApiKey": bool(info),
    }


@router.post("/config/test")
def test_config(request: ApiConfigRequest):
    """Test the values currently in the form without saving them."""
    api_key = request.api_key or ""
    if _is_masked_key(api_key):
        api_key = get_current_api_key()
    try:
        # An untouched settings form represents the active .env configuration.
        # Test it in-place without ever sending its secret back to the browser.
        if request.provider == "auto" and not api_key and not request.model and not request.base_url:
            info = resolve_provider()
            if not info:
                raise ValueError("No active API configuration was found.")
        else:
            info = build_provider_info(
                request.provider,
                api_key,
                request.model or "",
                request.base_url or "",
            )
        started = perf_counter()
        answer = call_llm_with_info(
            info,
            "Reply with exactly OK.",
            "Connection test",
            temperature=0,
            max_tokens=8,
        )
        if not answer.strip():
            raise LLMError("The model returned an empty answer.", 502)
        latency_ms = round((perf_counter() - started) * 1000)
        return {
            "success": True,
            "provider": info.provider,
            "model": info.model,
            "baseUrl": info.base_url,
            "latencyMs": latency_ms,
        }
    except ValueError as error:
        return JSONResponse(status_code=400, content={"success": False, "message": str(error)})
    except LLMError as error:
        return JSONResponse(
            status_code=error.status_code,
            content={"success": False, "message": str(error)},
        )


@router.delete("/config")
def delete_config():
    """Clear runtime API config and fall back to .env."""
    clear_runtime_config()
    info = resolve_provider()
    return {
        "success": True,
        "provider": info.provider if info else "none",
        "model": info.model if info else None,
        "hasApiKey": bool(info),
    }


# ---- Saved named configs (switch between multiple keys) ----

@router.get("/configs")
def get_configs():
    """List all saved configs + current runtime config."""
    return {
        "success": True,
        "current": get_runtime_config(),
        "saved": list_saved_configs(),
    }


@router.post("/configs")
def create_config(payload: dict):
    """Save the current runtime config with a name."""
    name = (payload or {}).get("name", "").strip()
    if not name:
        return JSONResponse(status_code=400, content={"success": False, "message": "name is required"})
    entry = save_current_config(name)
    if not entry:
        return JSONResponse(status_code=400, content={"success": False, "message": "No runtime config to save."})
    return {"success": True, "entry": entry}


@router.post("/configs/{name}/activate")
def activate_config(name: str):
    """Switch to a previously saved config."""
    entry = activate_saved_config(name)
    if not entry:
        return JSONResponse(status_code=404, content={"success": False, "message": f"Config '{name}' not found."})
    info = resolve_provider()
    return {
        "success": True,
        "provider": info.provider if info else "none",
        "model": info.model if info else None,
        "hasApiKey": bool(info),
        "entry": entry,
    }


@router.delete("/configs/{name}")
def delete_config_entry(name: str):
    """Delete a saved config."""
    ok = delete_saved_config(name)
    if not ok:
        return JSONResponse(status_code=404, content={"success": False, "message": f"Config '{name}' not found."})
    return {"success": True}


# ---- Analysis Run persistence ----

@router.get("/runs")
async def get_runs():
    """List all past runs (summary only, no full result data)."""
    runs = await list_runs()
    return {"success": True, "runs": runs}


@router.get("/runs/{run_id}")
async def get_run_detail(run_id: str):
    """Full detail of a single run including all step results."""
    run = await get_run(run_id)
    if run is None:
        return JSONResponse(status_code=404, content={"success": False, "message": "Run not found"})
    return {"success": True, "run": run}


@router.delete("/runs/{run_id}")
async def delete_run_route(run_id: str):
    """Delete a run and all its step results."""
    ok = await delete_run(run_id)
    if not ok:
        return JSONResponse(status_code=404, content={"success": False, "message": "Run not found"})
    return {"success": True}


@router.post("/runs")
async def create_run_route(payload: dict):
    """Create a new run. Returns the run ID."""
    project_name = (payload or {}).get("projectName", "")
    document_filename = (payload or {}).get("documentFilename")
    run_id = await create_run(project_name, document_filename)
    if run_id is None:
        return JSONResponse(status_code=503, content={"success": False, "message": "Database not available"})
    return {"success": True, "runId": run_id}


@router.post("/runs/{run_id}/complete")
async def complete_run_route(run_id: str):
    """Mark a run as completed."""
    await complete_run(run_id)
    return {"success": True}


@router.post("/projects/rename")
async def rename_project_route(payload: dict):
    """Rename a project (every run sharing the old project name)."""
    old_name = (payload or {}).get("oldName", "")
    new_name = (payload or {}).get("newName", "")
    if not old_name or not new_name:
        return JSONResponse(status_code=400, content={"success": False, "message": "oldName and newName are required"})
    if old_name == new_name:
        return {"success": True, "updated": 0}
    updated = await rename_project(old_name, new_name)
    if updated == 0:
        return JSONResponse(status_code=404, content={"success": False, "message": "Project not found"})
    return {"success": True, "updated": updated}


@router.delete("/projects/{project_name}")
async def delete_project_route(project_name: str):
    """Delete a project and all its runs / step results."""
    deleted = await delete_project(project_name)
    if deleted == 0:
        return JSONResponse(status_code=404, content={"success": False, "message": "Project not found"})
    return {"success": True, "deleted": deleted}


@router.patch("/runs/{run_id}")
async def update_run_route(run_id: str, payload: dict):
    """Update metadata of a single run (e.g. document filename)."""
    document_filename = (payload or {}).get("documentFilename")
    ok = await update_run_metadata(run_id, document_filename)
    if not ok:
        return JSONResponse(status_code=404, content={"success": False, "message": "Run not found"})
    return {"success": True}


@router.get("/health")
def health():
    info = resolve_provider()
    return {
        "status": "ok",
        "provider": info.provider if info else "none",
        "model": info.model if info else None,
        "hasApiKey": bool(info),
        "historyStorage": "enabled" if is_database_configured() else "disabled",
    }


@router.post("/upload-extract")
async def upload_extract(file: UploadFile = File(...)):
    return await extract_upload(file)


# ---- TARA RAG knowledge management ----

@router.get("/knowledge/libraries")
def knowledge_libraries():
    return {"success": True, "libraries": [
        {"key": key, "fields": spec["fields"], "required": spec["required"]}
        for key, spec in knowledge.LIBRARIES.items()
    ]}


@router.get("/knowledge/{library}")
async def knowledge_list(library: str, q: str = "", page: int = 1, page_size: int = Query(20, alias="pageSize")):
    return {"success": True, **(await knowledge.list_entries(library, q, page, page_size))}


@router.post("/knowledge/{library}")
async def knowledge_create(library: str, payload: dict):
    return {"success": True, "item": await knowledge.create_entry(library, payload)}


@router.patch("/knowledge/{library}/{entry_id}")
async def knowledge_update(library: str, entry_id: str, payload: dict):
    return {"success": True, "item": await knowledge.update_entry(library, entry_id, payload)}


@router.delete("/knowledge/{library}/{entry_id}")
async def knowledge_delete(library: str, entry_id: str):
    if not await knowledge.delete_entry(library, entry_id):
        return JSONResponse(status_code=404, content={"success": False, "message": "Knowledge entry not found"})
    return {"success": True}


@router.post("/knowledge/{library}/search")
async def knowledge_search(library: str, payload: dict):
    return {"success": True, "items": await knowledge.search(library, str(payload.get("query", "")), int(payload.get("topK", 5)))}


@router.post("/knowledge-ingest")
async def knowledge_ingest(file: UploadFile = File(...), target: str | None = None):
    content = await file.read()
    await file.seek(0)
    extracted = await extract_upload(file)
    result = await knowledge.ingest_text(
        extracted["metadata"]["filename"], extracted["metadata"]["fileType"], content,
        extracted["extractedText"], target,
    )
    return {"success": True, **result}


@router.get("/asset-overview")
async def asset_overview():
    return {"success": True, **(await knowledge.asset_overview())}


@router.post("/asset-import/preview")
async def asset_import_preview(file: UploadFile = File(...)):
    extracted = await extract_upload(file)
    parsed = await run_in_threadpool(parse_assets_with_ai, extracted["extractedText"], extracted["metadata"]["filename"])
    return {"success": True, "filename": extracted["metadata"]["filename"], **parsed}


@router.post("/asset-import/confirm")
async def asset_import_confirm(payload: dict):
    assets = payload.get("assets") or []
    if not isinstance(assets, list) or not assets:
        return JSONResponse(status_code=422, content={"success": False, "message": "没有可导入的资产"})
    created, errors = [], []
    for index, asset in enumerate(assets):
        if not isinstance(asset, dict) or asset.get("selected") is False:
            continue
        clean = {key: asset.get(key) for key in knowledge.LIBRARIES["assets"]["fields"] if key in asset}
        try:
            created.append(await knowledge.create_entry("assets", clean))
        except Exception as error:
            errors.append({"row": asset.get("source_row", index + 1), "message": str(error)})
    return {"success": not errors, "created": len(created), "items": created, "errors": errors}


@router.post("/extract-item-definition")
async def extract_item_definition(request: ItemDefinitionRequest):
    payload = to_payload(request)
    result = run_service(services.extract_item_definition, payload)
    if isinstance(result, dict) and result.get("success") is not False:
        await _maybe_save_step(payload.get("runId"), 1, "item_definition", result)
    return result


@router.post("/generate-assets")
async def generate_assets(request: AssetRequest):
    payload = to_payload(request)
    _append_rag(payload, "optionalInfo", await _rag_context(["assets", "golden-cases", "corrections"], payload.get("systemDescription", "")))
    result = run_service(services.generate_assets, payload)
    if isinstance(result, dict) and result.get("success") is not False:
        await _maybe_save_step(payload.get("runId"), 2, "assets", result)
    return result


@router.post("/analyze-threats")
async def analyze_threats(request: ThreatRequest):
    payload = to_payload(request)
    _append_rag(payload, "systemDescription", await _rag_context(["damages", "threats", "golden-cases", "corrections"], str(payload.get("assets", ""))))
    result = run_service(services.analyze_threats, payload)
    if isinstance(result, dict) and result.get("success") is not False:
        await _maybe_save_step(payload.get("runId"), 3, "threats", result)
    return result


@router.post("/generate-attack-paths")
async def generate_attack_paths(request: AttackPathRequest):
    payload = to_payload(request)
    _append_rag(payload, "systemDescription", await _rag_context(["attack-paths", "golden-cases", "corrections"], str(payload.get("threats", ""))))
    result = run_service(services.generate_attack_paths, payload)
    if isinstance(result, dict) and result.get("success") is not False:
        await _maybe_save_step(payload.get("runId"), 4, "attack_paths", result)
    return result


@router.post("/generate-risk-treatment")
async def generate_risk_treatment(request: RiskTreatmentRequest):
    payload = to_payload(request)
    _append_rag(payload, "systemDescription", await _rag_context(["regulations", "golden-cases", "corrections"], str(payload.get("attackPaths", ""))))
    result = run_service(services.generate_risk_treatment, payload)
    if isinstance(result, dict) and result.get("success") is not False:
        await _maybe_save_step(payload.get("runId"), 5, "risk_treatments", result)
    return result


@router.post("/structure-docx")
def structure_docx(request: StructureDocxRequest):
    return run_service(services.structure_docx, to_payload(request))


@router.post("/generate-diagram")
async def generate_diagram_route(request: DiagramRequest):
    """AI draws an ISO/SAE 21434 architecture image.

    Accepts a natural-language description (and optionally the current semantic
    ArchModel for a modify round-trip) and returns a normalized ArchModel which the
    frontend auto-layouts and renders as a standards vector image.
    """
    return run_service(services.generate_diagram, to_payload(request))


@router.post("/export-excel")
def export_excel(request: ExportExcelRequest):
    """Export TARA analysis results as an Excel file based on the template."""
    try:
        data = to_payload(request)
        excel_bytes = export_to_excel(
            project_name=data.get("projectName", ""),
            assets=data.get("assets") or [],
            threats=data.get("threats") or [],
            attack_paths=data.get("attackPaths") or [],
            risk_treatments=data.get("riskTreatments") or [],
            item_abbreviation=data.get("itemAbbreviation", "VIU"),
        )
        filename = (data.get("projectName") or "tara").replace("/", "_").replace("\\", "_")
        encoded_filename = quote(f"{filename}.xlsx")
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="tara_report.xlsx"; filename*=UTF-8\'\'{encoded_filename}'
                )
            },
        )
    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Excel export failed.", "message": str(error)},
        )
