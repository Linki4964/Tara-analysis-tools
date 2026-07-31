from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class ApiConfigRequest(BaseModel):
    provider: Literal["auto", "anthropic", "deepseek", "local"] = "auto"
    api_key: str = ""
    model: Optional[str] = None
    base_url: Optional[str] = None


class ItemDefinitionRequest(BaseModel):
    extractedText: str
    filename: Optional[str] = None
    runId: Optional[str] = None


class AssetRequest(BaseModel):
    projectName: Optional[str] = None
    systemDescription: str
    optionalInfo: Optional[str] = None
    runId: Optional[str] = None


class ThreatRequest(BaseModel):
    projectName: Optional[str] = None
    systemDescription: Optional[str] = None
    assets: list[dict[str, Any]] = Field(default_factory=list)
    runId: Optional[str] = None


class AttackPathRequest(BaseModel):
    projectName: Optional[str] = None
    systemDescription: Optional[str] = None
    assets: list[dict[str, Any]] = Field(default_factory=list)
    threats: list[dict[str, Any]] = Field(default_factory=list)
    runId: Optional[str] = None


class RiskTreatmentRequest(BaseModel):
    projectName: Optional[str] = None
    systemDescription: Optional[str] = None
    assets: list[dict[str, Any]] = Field(default_factory=list)
    threats: list[dict[str, Any]] = Field(default_factory=list)
    attackPaths: list[dict[str, Any]] = Field(default_factory=list)
    runId: Optional[str] = None


class StructureDocxRequest(BaseModel):
    extractedText: str
    extractedHtml: Optional[str] = None
    filename: Optional[str] = None
    runId: Optional[str] = None


class ExportExcelRequest(BaseModel):
    projectName: Optional[str] = None
    assets: list[dict[str, Any]] = Field(default_factory=list)
    threats: list[dict[str, Any]] = Field(default_factory=list)
    attackPaths: list[dict[str, Any]] = Field(default_factory=list)
    riskTreatments: list[dict[str, Any]] = Field(default_factory=list)
    itemAbbreviation: Optional[str] = "VIU"
