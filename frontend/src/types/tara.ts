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

// ---- Damage Impact Scoring (S/F/O/P) ----

export type DamageImpactScore = {
  safetyScore: number;
  safetyRationale: string;
  financialScore: number;
  financialRationale: string;
  operationalScore: number;
  operationalRationale: string;
  privacyScore: number;
  privacyRationale: string;
  damageImpactTotal: number;
  damageImpactLevel: string;
  damageImpactLevelLabel: string;
  damageImpactLevelDescription: string;
};

// ---- Damage Scenario (CsDS) ----

export type DamageScenario = {
  scenarioId: string;           // e.g. CsDS_AS_Da_001
  scenarioName: string;
  description: string;
  severity: string;
  affectedProperty: string;     // Confidentiality | Integrity | Availability
  // S/F/O/P scores (may come from LLM or backend scoring)
  safety?: number;
  safetyRationale?: string;
  financial?: number;
  financialRationale?: string;
  operational?: number;
  operationalRationale?: string;
  privacy?: number;
  privacyRationale?: string;
  // Populated by backend scoring
  safetyScore?: number;
  financialScore?: number;
  operationalScore?: number;
  privacyScore?: number;
  damageImpactTotal?: number;
  damageImpactLevel?: string;
  damageImpactLevelLabel?: string;
  damageImpactLevelDescription?: string;
};

// ---- Asset (AS_) ----

export type Asset = {
  assetId: string;               // e.g. AS_Da_001
  assetName: string;
  assetType: string;             // 数据流 | 硬件 | 软件 | 外部实体 | 数据
  description: string;
  valueRationale: string;
  securityProperties: SecurityProperties;
  damageScenarios: DamageScenario[];
};

// ---- Threat (CsTS) ----

export type Threat = {
  threatId: string;              // e.g. CsTS_AS_Da_001
  threatName: string;
  targetAsset: string;           // assetId, e.g. AS_Da_001
  targetAssetName: string;
  strideCategory: string;        // Spoofing | Tampering | Repudiation | Information Disclosure | Denial of Service | Elevation of Privilege
  description: string;
  relatedDamageScenarioId: string;  // e.g. CsDS_AS_Da_001
  damageScenario?: string;          // @deprecated — kept for backward compat with old data
  affectedSecurityProperty: string;
  threatSeverity: string;
};

// ---- 5-dimension Attack Feasibility ----

export type FeasibilityDimension = {
  score: number;
  label: string;
  rationale: string;
};

export type AttackFeasibilityDimensions = {
  ET: FeasibilityDimension;
  EXP: FeasibilityDimension;
  KN: FeasibilityDimension;
  WO: FeasibilityDimension;
  EQ: FeasibilityDimension;
};

// ---- Attack Path (AP_) ----

export type AttackPath = {
  attackPathId: string;          // e.g. AP_AS_Da_001
  attackPathName: string;
  relatedThreats: string[];      // e.g. ["CsTS_AS_Da_001"]
  relatedDamageScenarioId?: string;
  entryPoint: string;
  attackSteps: string[];
  consequence?: string;
  requiredCapability: string;
  // 5-dimension feasibility scores
  et?: number;
  etRationale?: string;
  exp?: number;
  expRationale?: string;
  kn?: number;
  knRationale?: string;
  wo?: number;
  woRationale?: string;
  eq?: number;
  eqRationale?: string;
  // Backend-computed feasibility
  attackFeasibilityTotal?: number;
  attackFeasibilityDimensions?: AttackFeasibilityDimensions;
  // Legacy fields (backward compat)
  attackFeasibility: string;
  attackFeasibilityScore?: number;
  attackFeasibilityLevel?: number;
  attackFeasibilityLabel?: string;
  // Impact & Risk
  impactLevel: string;
  impactLevelScore?: number;
  impactLevelLabel?: string;
  securityRiskLevel?: number;
  securityRiskLevelLabel?: string;
  securityRiskLevelName?: string;
  riskMeaning?: string;
  recommendedTreatmentDecision?: string;
  recommendedTreatmentLabel?: string;
  recommendedTreatmentDescription?: string;
  treatmentDecisionScore?: number;
  treatmentDecisionLevel?: number;
};

// ---- Risk Treatment (with CsGO / CsCL) ----

export type RiskTreatment = {
  treatmentId: string;
  relatedAttackPath: string;       // e.g. AP_AS_Da_001
  relatedThreatId?: string;        // e.g. CsTS_AS_Da_001
  relatedDamageScenarioId?: string;
  treatmentDecision: string;
  treatmentDecisionLabel?: string;
  treatmentDecisionRationale?: string;
  securityRiskLevel?: number;
  securityRiskLevelLabel?: string;
  attackFeasibilityLevel?: number;
  treatmentDecisionScore?: number;
  treatmentDecisionLevel?: number;
  controlName: string;
  controlDescription: string;
  controlType: string;
  implementationPriority: string;
  residualRisk: string;
  verificationMethod: string;
  // Cybersecurity Goal / Claim / Requirement
  cybersecurityGoalId?: string;       // e.g. CsGO_VIU_001 or "/"
  cybersecurityGoal?: string;
  cybersecurityRequirement?: string;
  cybersecurityClaimId?: string;      // e.g. CsCL_VIU_001 or "/"
  cybersecurityClaim?: string;
};

// ---- Health / Config ----

export type Health = {
  status: string;
  provider: string;
  model: string | null;
  hasApiKey: boolean;
  historyStorage?: 'enabled' | 'disabled';
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
