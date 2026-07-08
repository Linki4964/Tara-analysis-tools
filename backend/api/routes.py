from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse

from backend.schemas import (
    ApiConfigRequest,
    AssetRequest,
    AttackPathRequest,
    ItemDefinitionRequest,
    RiskTreatmentRequest,
    StructureDocxRequest,
    ThreatRequest,
)
from backend.services.file_extraction import extract_upload
from backend.core.database import is_database_configured
from tara_core.config import (
    activate_saved_config,
    clear_runtime_config,
    delete_saved_config,
    get_runtime_config,
    list_saved_configs,
    resolve_provider,
    save_current_config,
    set_runtime_config,
)
from tara_core.llm import LLMError
from tara_core import services
from backend.services.run_store import (
    complete_run,
    create_run,
    delete_run,
    get_run,
    list_runs,
    save_step_result,
)


router = APIRouter()


def to_payload(request) -> dict:
    if hasattr(request, "model_dump"):
        return request.model_dump()
    return request.dict()


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


@router.get("/config")
def get_config():
    """Return the current API configuration (key masked)."""
    return {"success": True, "config": get_runtime_config()}


@router.post("/config")
def set_config(request: ApiConfigRequest):
    """Set runtime API configuration."""
    set_runtime_config(
        provider=request.provider,
        api_key=request.api_key,
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
    result = run_service(services.generate_assets, payload)
    if isinstance(result, dict) and result.get("success") is not False:
        await _maybe_save_step(payload.get("runId"), 2, "assets", result)
    return result


@router.post("/analyze-threats")
async def analyze_threats(request: ThreatRequest):
    payload = to_payload(request)
    result = run_service(services.analyze_threats, payload)
    if isinstance(result, dict) and result.get("success") is not False:
        await _maybe_save_step(payload.get("runId"), 3, "threats", result)
    return result


@router.post("/generate-attack-paths")
async def generate_attack_paths(request: AttackPathRequest):
    payload = to_payload(request)
    result = run_service(services.generate_attack_paths, payload)
    if isinstance(result, dict) and result.get("success") is not False:
        await _maybe_save_step(payload.get("runId"), 4, "attack_paths", result)
    return result


@router.post("/generate-risk-treatment")
async def generate_risk_treatment(request: RiskTreatmentRequest):
    payload = to_payload(request)
    result = run_service(services.generate_risk_treatment, payload)
    if isinstance(result, dict) and result.get("success") is not False:
        await _maybe_save_step(payload.get("runId"), 5, "risk_treatments", result)
    return result


@router.post("/structure-docx")
def structure_docx(request: StructureDocxRequest):
    return run_service(services.structure_docx, to_payload(request))
