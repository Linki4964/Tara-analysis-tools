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
