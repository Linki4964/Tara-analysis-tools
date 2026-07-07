from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse

from backend.schemas import (
    AssetRequest,
    AttackPathRequest,
    ItemDefinitionRequest,
    RiskTreatmentRequest,
    StructureDocxRequest,
    ThreatRequest,
)
from backend.services.file_extraction import extract_upload
from tara_core.config import resolve_provider
from tara_core.llm import LLMError
from tara_core import services


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


@router.get("/health")
def health():
    info = resolve_provider()
    return {
        "status": "ok",
        "provider": info.provider if info else "none",
        "model": info.model if info else None,
        "hasApiKey": bool(info),
    }


@router.post("/upload-extract")
async def upload_extract(file: UploadFile = File(...)):
    return await extract_upload(file)


@router.post("/extract-item-definition")
def extract_item_definition(request: ItemDefinitionRequest):
    return run_service(services.extract_item_definition, to_payload(request))


@router.post("/generate-assets")
def generate_assets(request: AssetRequest):
    return run_service(services.generate_assets, to_payload(request))


@router.post("/analyze-threats")
def analyze_threats(request: ThreatRequest):
    return run_service(services.analyze_threats, to_payload(request))


@router.post("/generate-attack-paths")
def generate_attack_paths(request: AttackPathRequest):
    return run_service(services.generate_attack_paths, to_payload(request))


@router.post("/generate-risk-treatment")
def generate_risk_treatment(request: RiskTreatmentRequest):
    return run_service(services.generate_risk_treatment, to_payload(request))


@router.post("/structure-docx")
def structure_docx(request: StructureDocxRequest):
    return run_service(services.structure_docx, to_payload(request))
