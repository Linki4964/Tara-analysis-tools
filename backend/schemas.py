from typing import Any, Optional
from pydantic import BaseModel, Field


class ItemDefinitionRequest(BaseModel):
    extractedText: str
    filename: Optional[str] = None


class AssetRequest(BaseModel):
    projectName: Optional[str] = None
    systemDescription: str
    optionalInfo: Optional[str] = None


class ThreatRequest(BaseModel):
    projectName: Optional[str] = None
    systemDescription: Optional[str] = None
    assets: list[dict[str, Any]] = Field(default_factory=list)


class AttackPathRequest(BaseModel):
    projectName: Optional[str] = None
    systemDescription: Optional[str] = None
    assets: list[dict[str, Any]] = Field(default_factory=list)
    threats: list[dict[str, Any]] = Field(default_factory=list)


class RiskTreatmentRequest(BaseModel):
    projectName: Optional[str] = None
    systemDescription: Optional[str] = None
    assets: list[dict[str, Any]] = Field(default_factory=list)
    threats: list[dict[str, Any]] = Field(default_factory=list)
    attackPaths: list[dict[str, Any]] = Field(default_factory=list)


class StructureDocxRequest(BaseModel):
    extractedText: str
    extractedHtml: Optional[str] = None
    filename: Optional[str] = None
