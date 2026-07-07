import { get, post, upload } from './client';
import type { Asset, AttackPath, Health, ItemDefinition, RiskTreatment, Threat, UploadedDocument } from '../types/tara';

export const taraApi = {
  health: () => get<Health>('/api/health'),
  uploadExtract: (file: File) => upload<UploadedDocument>('/api/upload-extract', file),
  structureDocx: (payload: { extractedText: string; extractedHtml?: string | null; filename?: string }) =>
    post<{ success: boolean; structuredJson: unknown; metadata: { filename: string; sourceType: string; originalLength: number } }>(
      '/api/structure-docx',
      payload
    ),
  extractItems: (payload: { extractedText: string; filename?: string }) =>
    post<{ success: boolean; items: ItemDefinition[]; systemDescription: string; itemCount: number; totalFunctions: number }>(
      '/api/extract-item-definition',
      payload
    ),
  generateAssets: (payload: { projectName: string; systemDescription: string; optionalInfo?: string }) =>
    post<{ projectName: string; assets: Asset[] }>('/api/generate-assets', payload),
  analyzeThreats: (payload: { projectName: string; systemDescription: string; assets: Asset[] }) =>
    post<{ projectName: string; threats: Threat[] }>('/api/analyze-threats', payload),
  generateAttackPaths: (payload: { projectName: string; systemDescription: string; assets: Asset[]; threats: Threat[] }) =>
    post<{ projectName: string; attackPaths: AttackPath[] }>('/api/generate-attack-paths', payload),
  generateRiskTreatment: (payload: {
    projectName: string;
    systemDescription: string;
    assets: Asset[];
    threats: Threat[];
    attackPaths: AttackPath[];
  }) => post<{ projectName: string; riskTreatments: RiskTreatment[] }>('/api/generate-risk-treatment', payload)
};
