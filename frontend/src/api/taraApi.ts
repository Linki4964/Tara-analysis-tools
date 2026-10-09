import { del, get, patch, post, upload } from './client';
import type { ApiConfig, Asset, AttackPath, ConfigsList, Health, ItemDefinition, ProviderSpec, RiskTreatment, RunDetail, RunSummary, SavedConfig, Threat, UploadedDocument } from '../types/tara';
import type { ArchModel, DiagramCounts, ModelChanges } from '../diagram/types';

export interface GenerateDiagramResult {
  success: boolean;
  plan?: string;
  summary?: string;
  model: ArchModel;
  counts: DiagramCounts;
  changes?: ModelChanges;
  warnings?: string[];
  description?: string;
}

export const taraApi = {
  health: () => get<Health>('/api/health'),
  // Provider catalog — the settings page renders its options from this so the
  // per-provider defaults live in one place (tara_core/providers.py).
  listProviders: () => get<{ success: boolean; providers: ProviderSpec[] }>('/api/providers'),
  getConfig: () => get<{ success: boolean; config: ApiConfig }>('/api/config'),
  setConfig: (payload: { provider: string; api_key: string; model?: string; base_url?: string }) =>
    post<{ success: boolean; provider: string; model: string | null; hasApiKey: boolean }>('/api/config', payload),
  testConfig: (payload: { provider: string; api_key: string; model?: string; base_url?: string }) =>
    post<{ success: boolean; provider: string; model: string; baseUrl: string; latencyMs: number }>('/api/config/test', payload),
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
  generateDiagram: (payload: {
    projectName?: string;
    description: string;
    currentModel?: ArchModel | null;
    mode?: 'create' | 'modify';
    runId?: string;
  }) =>
    post<GenerateDiagramResult>('/api/generate-diagram', payload),
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

  // ---- Excel Export (binary download) ----
  exportExcel: async (payload: {
    projectName?: string;
    assets: Asset[];
    threats: Threat[];
    attackPaths: AttackPath[];
    riskTreatments: RiskTreatment[];
  }) => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
    const requestedFilename = `${(payload.projectName || 'tara_report').replace(/[\\/:*?"<>|]/g, '_')}.xlsx`;
    const response = await fetch(`${API_BASE_URL}/api/export-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Older backend processes put projectName directly into a latin-1 HTTP
      // header. Keep the wire value ASCII-safe; the browser filename below
      // still preserves the user's original (including Chinese) project name.
      body: JSON.stringify({ ...payload, projectName: 'tara_report' }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(err.message || err.detail || 'Export failed');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const fallbackMatch = disposition.match(/filename="?([^";]+)"?/i);
    const responseFilename = utf8Match
      ? decodeURIComponent(utf8Match[1])
      : fallbackMatch?.[1] || 'tara_export.xlsx';
    const filename = requestedFilename || responseFilename;
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return { success: true, filename };
  },

  // ---- Persistence / History ----
  createRun: (payload: { projectName?: string; documentFilename?: string }) =>
    post<{ success: boolean; runId: string }>('/api/runs', payload),
  completeRun: (runId: string) => post<{ success: boolean }>(`/api/runs/${encodeURIComponent(runId)}/complete`, {}),
  listRuns: () => get<{ success: boolean; runs: RunSummary[] }>('/api/runs'),
  getRun: (runId: string) => get<{ success: boolean; run: RunDetail }>(`/api/runs/${encodeURIComponent(runId)}`),
  deleteRun: (runId: string) => del<{ success: boolean }>(`/api/runs/${encodeURIComponent(runId)}`),

  // ---- Project-level operations ----
  renameProject: (oldName: string, newName: string) =>
    post<{ success: boolean; updated: number }>('/api/projects/rename', { oldName, newName }),
  deleteProject: (projectName: string) =>
    del<{ success: boolean; deleted: number }>(`/api/projects/${encodeURIComponent(projectName)}`),
  updateRun: (runId: string, payload: { documentFilename?: string | null }) =>
    patch<{ success: boolean }>(`/api/runs/${encodeURIComponent(runId)}`, payload),
  listKnowledge: (library: string, q = '') => get<{ success: boolean; items: Record<string, unknown>[]; total: number }>(`/api/knowledge/${library}?q=${encodeURIComponent(q)}&pageSize=100`),
  createKnowledge: (library: string, payload: Record<string, unknown>) => post<{ success: boolean; item: Record<string, unknown> }>(`/api/knowledge/${library}`, payload),
  updateKnowledge: (library: string, id: string, payload: Record<string, unknown>) => patch<{ success: boolean; item: Record<string, unknown> }>(`/api/knowledge/${library}/${id}`, payload),
  deleteKnowledge: (library: string, id: string) => del<{ success: boolean }>(`/api/knowledge/${library}/${id}`),
  searchKnowledge: (library: string, query: string) => post<{ success: boolean; items: Record<string, unknown>[] }>(`/api/knowledge/${library}/search`, { query, topK: 10 }),
  ingestKnowledge: async (file: File, target = '') => {
    const body = new FormData(); body.append('file', file);
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/knowledge-ingest${target ? `?target=${encodeURIComponent(target)}` : ''}`, { method: 'POST', body });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.message || data.detail || '导入失败');
    return data as { success: boolean; library: string; chunkCount: number; duplicate: boolean };
  },
  assetOverview: () => get<{ success: boolean; total: number; byType: Record<string, number>; topComponents: [string, number][]; topInterfaces: [string, number][] }>('/api/asset-overview'),
  previewAssetImport: async (file: File) => {
    const body = new FormData(); body.append('file', file);
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/asset-import/preview`, { method: 'POST', body });
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.message || data.detail || 'AI 解析失败');
    return data as { success: boolean; filename: string; assets: Record<string, unknown>[]; warnings: string[]; count: number };
  },
  confirmAssetImport: (assets: Record<string, unknown>[]) => post<{ success: boolean; created: number; errors: { row: number; message: string }[] }>('/api/asset-import/confirm', { assets }),
};
