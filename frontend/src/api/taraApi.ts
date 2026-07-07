import { del, get, patch, post, upload } from './client';
import type { ApiConfig, Asset, AttackPath, ConfigsList, Health, ItemDefinition, RiskTreatment, RunDetail, RunSummary, SavedConfig, Threat, UploadedDocument } from '../types/tara';

export const taraApi = {
  health: () => get<Health>('/api/health'),
  getConfig: () => get<{ success: boolean; config: ApiConfig }>('/api/config'),
  setConfig: (payload: { provider: string; api_key: string; model?: string; base_url?: string }) =>
    post<{ success: boolean; provider: string; model: string | null; hasApiKey: boolean }>('/api/config', payload),
  deleteConfig: () => del<{ success: boolean; provider: string; model: string | null; hasApiKey: boolean }>('/api/config'),

  // Saved named configs
  listConfigs: () => get<ConfigsList>('/api/configs'),
  saveConfig: (name: string) => post<{ success: boolean; entry: SavedConfig }>('/api/configs', { name }),
  activateConfig: (name: string) =>
    post<{ success: boolean; provider: string; model: string | null; hasApiKey: boolean; entry: SavedConfig }>(
      `/api/configs/${encodeURIComponent(name)}/activate`,
      {}
    ),
  deleteSavedConfig: (name: string) => del<{ success: boolean }>(`/api/configs/${encodeURIComponent(name)}`),
  uploadExtract: (file: File) => upload<UploadedDocument>('/api/upload-extract', file),
  structureDocx: (payload: { extractedText: string; extractedHtml?: string | null; filename?: string }) =>
    post<{ success: boolean; structuredJson: unknown; metadata: { filename: string; sourceType: string; originalLength: number } }>(
      '/api/structure-docx',
      payload
    ),
  extractItems: (payload: { extractedText: string; filename?: string; runId?: string }) =>
    post<{ success: boolean; items: ItemDefinition[]; systemDescription: string; itemCount: number; totalFunctions: number }>(
      '/api/extract-item-definition',
      payload
    ),
  generateAssets: (payload: { projectName: string; systemDescription: string; optionalInfo?: string; runId?: string }) =>
    post<{ projectName: string; assets: Asset[] }>('/api/generate-assets', payload),
  analyzeThreats: (payload: { projectName: string; systemDescription: string; assets: Asset[]; runId?: string }) =>
    post<{ projectName: string; threats: Threat[] }>('/api/analyze-threats', payload),
  generateAttackPaths: (payload: { projectName: string; systemDescription: string; assets: Asset[]; threats: Threat[]; runId?: string }) =>
    post<{ projectName: string; attackPaths: AttackPath[] }>('/api/generate-attack-paths', payload),
  generateRiskTreatment: (payload: {
    projectName: string;
    systemDescription: string;
    assets: Asset[];
    threats: Threat[];
    attackPaths: AttackPath[];
    runId?: string;
  }) => post<{ projectName: string; riskTreatments: RiskTreatment[] }>('/api/generate-risk-treatment', payload),

  // ---- Persistence / History ----
  createRun: (payload: { projectName?: string; documentFilename?: string }) =>
    post<{ success: boolean; runId: string }>('/api/runs', payload),
  completeRun: (runId: string) => post<{ success: boolean }>(`/api/runs/${encodeURIComponent(runId)}/complete`, {}),
  listRuns: () => get<{ success: boolean; runs: RunSummary[] }>('/api/runs'),
  getRun: (runId: string) => get<{ success: boolean; run: RunDetail }>(`/api/runs/${encodeURIComponent(runId)}`),
  deleteRun: (runId: string) => del<{ success: boolean }>(`/api/runs/${encodeURIComponent(runId)}`),
};
