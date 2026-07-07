export type SecurityProperties = {
  confidentiality: boolean;
  integrity: boolean;
  availability: boolean;
  authenticity: boolean;
};

export type UploadedDocument = {
  success: boolean;
  metadata: {
    filename: string;
    fileType: string;
    fileSize: number;
    charCount: number;
    lineCount: number;
    hasHtml: boolean;
  };
  extractedText: string;
  extractedHtml?: string | null;
};

export type ItemDefinition = {
  itemId: string;
  itemName: string;
  description: string;
  functions: Array<{
    functionId: string;
    functionName: string;
    description: string;
  }>;
};

export type Asset = {
  assetName: string;
  assetType: string;
  description: string;
  valueRationale: string;
  securityProperties: SecurityProperties;
  damageScenarios: Array<{
    scenarioName: string;
    description: string;
    severity: string;
    affectedProperty: string;
  }>;
};

export type Threat = {
  threatId: string;
  threatName: string;
  targetAsset: string;
  strideCategory: string;
  description: string;
  damageScenario: string;
  affectedSecurityProperty: string;
  threatSeverity: string;
};

export type AttackPath = {
  attackPathId: string;
  attackPathName: string;
  relatedThreats: string[];
  entryPoint: string;
  attackSteps: string[];
  requiredCapability: string;
  attackFeasibility: string;
  impactLevel: string;
};

export type RiskTreatment = {
  treatmentId: string;
  relatedAttackPath: string;
  treatmentDecision: string;
  controlName: string;
  controlDescription: string;
  controlType: string;
  implementationPriority: string;
  residualRisk: string;
  verificationMethod: string;
};

export type Health = {
  status: string;
  provider: string;
  model: string | null;
  hasApiKey: boolean;
};

export type ApiProvider = 'auto' | 'anthropic' | 'deepseek' | 'local';

export type ApiConfig = {
  provider: ApiProvider;
  api_key: string;
  model: string;
  base_url: string;
};

export type SavedConfig = {
  name: string;
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
  active: boolean;
};

export type ConfigsList = {
  success: boolean;
  current: ApiConfig;
  saved: SavedConfig[];
};

// ---- History / Persistence types ----

export type RunSummary = {
  id: string;
  project_name: string;
  status: string;
  document_filename: string | null;
  created_at: string;
  updated_at: string;
  step_count: number;
};

export type RunDetail = {
  id: string;
  project_name: string;
  status: string;
  document_filename: string | null;
  created_at: string;
  updated_at: string;
  steps: Array<{
    step_number: number;
    step_name: string;
    result_data: Record<string, unknown>;
    created_at: string;
  }>;
};
