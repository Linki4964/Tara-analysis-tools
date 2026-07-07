require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const multer = require('multer');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// ---- API Configuration (read from .env) ----
const API_PROVIDER = process.env.API_PROVIDER || 'auto'; // 'anthropic' | 'deepseek' | 'auto'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

// ---- Resolve which API to use ----
function resolveProvider() {
  if (API_PROVIDER === 'anthropic') return 'anthropic';
  if (API_PROVIDER === 'deepseek') return 'deepseek';

  // auto-detect
  if (ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.startsWith('sk-ant-')) return 'anthropic';
  if (DEEPSEEK_API_KEY) return 'deepseek';
  if (ANTHROPIC_API_KEY) return 'anthropic'; // fallback

  return null;
}

function getProviderInfo() {
  const provider = resolveProvider();
  if (!provider) return null;
  if (provider === 'deepseek') {
    return {
      provider: 'deepseek',
      model: DEEPSEEK_MODEL,
      baseUrl: DEEPSEEK_BASE_URL,
      keyPreview: DEEPSEEK_API_KEY.slice(0, 8) + '...'
    };
  }
  return {
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,
    baseUrl: 'https://api.anthropic.com',
    keyPreview: ANTHROPIC_API_KEY.slice(0, 12) + '...'
  };
}

// ---- Multer: file uploads ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.docx', '.doc', '.pdf', '.txt', '.json', '.md', '.csv'];
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Supported: ${allowedExts.join(', ')}`));
    }
  }
});

// ---- Middleware ----
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- LLM Call: unified interface ----
async function callLLM(systemPrompt, userPrompt, temperature = 0.3, maxTokens = 8192) {
  const info = getProviderInfo();
  if (!info) {
    throw new Error(
      'No API key configured. Please set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY in your .env file.\n' +
      '  cp .env.example .env   (if you haven\'t already)\n' +
      '  Then edit .env and add your key.'
    );
  }

  if (info.provider === 'deepseek') {
    return callDeepSeek(systemPrompt, userPrompt, temperature, maxTokens);
  }
  return callAnthropic(systemPrompt, userPrompt, temperature, maxTokens);
}

// ---- Anthropic API ----
async function callAnthropic(systemPrompt, userPrompt, temperature, maxTokens) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}

// ---- DeepSeek API (OpenAI-compatible) ----
async function callDeepSeek(systemPrompt, userPrompt, temperature, maxTokens) {
  const OpenAI = require('openai');
  const client = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: DEEPSEEK_BASE_URL
  });

  const response = await client.chat.completions.create({
    model: DEEPSEEK_MODEL,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });

  return response.choices[0]?.message?.content || '';
}

// ---- Helper: parse JSON from LLM response ----
function parseJsonFromLLM(textContent) {
  let cleaned = textContent.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  return JSON.parse(cleaned.trim());
}

// ================================================================
// POST /api/upload-extract
// ================================================================
app.post('/api/upload-extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase();
    let extractedText = '';

    let extractedHtml = '';

    if (ext === '.docx' || ext === '.doc') {
      // Extract plain text
      const textResult = await mammoth.extractRawText({ buffer: file.buffer });
      extractedText = textResult.value || '';
      if (textResult.messages.length > 0) {
        console.log('Mammoth warnings:', textResult.messages);
      }
      // Also extract HTML (preserves table structure)
      try {
        const htmlResult = await mammoth.convertToHtml({ buffer: file.buffer });
        extractedHtml = htmlResult.value || '';
      } catch (htmlErr) {
        console.log('Mammoth HTML conversion failed, using text only:', htmlErr.message);
      }
    } else if (ext === '.pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(file.buffer);
        extractedText = pdfData.text || '';
      } catch (pdfErr) {
        console.error('PDF parse error:', pdfErr);
        return res.status(400).json({
          error: 'Failed to parse PDF.',
          message: 'The PDF may be encrypted, scanned (image-based), or corrupted.'
        });
      }
    } else {
      extractedText = file.buffer.toString('utf-8');
    }

    extractedText = extractedText.trim();

    if (!extractedText || extractedText.length < 10) {
      return res.status(400).json({
        error: 'No text extracted.',
        message: 'The file appears to be empty or contains only non-text content.'
      });
    }

    res.json({
      success: true,
      metadata: {
        filename: file.originalname,
        fileType: ext,
        fileSize: file.size,
        charCount: extractedText.length,
        lineCount: extractedText.split('\n').length,
        hasHtml: !!extractedHtml
      },
      extractedText,
      extractedHtml: extractedHtml || undefined
    });

  } catch (error) {
    console.error('File extraction error:', error);
    res.status(500).json({
      error: 'File extraction failed.',
      message: error.message || 'Unexpected error.'
    });
  }
});

// ================================================================
// POST /api/extract-item-definition
// ================================================================
app.post('/api/extract-item-definition', async (req, res) => {
  try {
    const { extractedText, filename } = req.body;

    if (!extractedText || extractedText.trim().length < 20) {
      return res.status(400).json({
        error: 'Insufficient text.',
        message: 'The extracted text is too short to identify Item Definitions.'
      });
    }

    const systemPrompt = `你是一名汽车网络安全工程师，专门从事TARA分析。
你的任务是从上传的文档内容中识别并列出所有的"相关项"（Item）。

相关项是系统中需要被分析的功能模块或子系统。每个相关项通常包含：
- 一个编号（如 RQ-XXX-001）
- 一个名称/标题
- 功能描述
- 包含的子功能列表`;

    const userPrompt = `请从以下文档内容中，识别并列出所有的相关项（Item）。

要求：
1. 仔细阅读文档，找出所有独立的功能需求或系统模块
2. 每个相关项作为一个独立条目，包含编号、名称、描述和子功能
3. 如果文档中包含表格，将表格中的每一行作为一个相关项
4. 保留所有技术细节的准确性
5. 同时生成一段总结性的系统描述文本，用于后续TARA资产识别分析

文件名：${filename || '未命名文件'}

文档内容：
${extractedText.slice(0, 30000)}

请严格按照以下JSON格式输出，不要包含任何其他文字或markdown标记：

{
  "items": [
    {
      "itemId": "RQ-XXX-001",
      "itemName": "相关项名称",
      "description": "对该相关项的详细描述",
      "functions": [
        {
          "functionId": "FNC-001",
          "functionName": "子功能名称",
          "description": "子功能描述"
        }
      ]
    }
  ],
  "systemDescription": "将所有相关项总结为一段连贯的系统描述文本，用于后续资产识别分析。包含系统架构、通信方式、ECU交互、外部接口等信息。"
}

请确保 items 数组不为空，输出合法 JSON。`;

    const resultText = await callLLM(systemPrompt, userPrompt, 0.2, 4096);

    let result;
    try {
      result = parseJsonFromLLM(resultText);

      if (!result.items || !Array.isArray(result.items)) {
        throw new Error('Response missing items array');
      }

      // Ensure each item has all fields
      result.items = result.items.map((item, i) => ({
        itemId: item.itemId || `ITEM-${String(i + 1).padStart(3, '0')}`,
        itemName: item.itemName || `相关项 ${i + 1}`,
        description: item.description || '',
        functions: (item.functions || []).map((fn, j) => ({
          functionId: fn.functionId || `FNC-${String(j + 1).padStart(3, '0')}`,
          functionName: fn.functionName || `功能 ${j + 1}`,
          description: fn.description || ''
        }))
      }));

      // Build a text summary
      const itemListText = result.items.map(item =>
        `[${item.itemId}] ${item.itemName}\n${item.description}\n` +
        (item.functions.length > 0
          ? item.functions.map(fn => `  - ${fn.functionId}: ${fn.functionName}`).join('\n')
          : '')
      ).join('\n\n');

      result.systemDescription = result.systemDescription || `
该系统包含以下相关项：

${itemListText}

以上相关项构成了整个系统的功能架构，各相关项之间通过CAN总线、TSP平台等进行通信与数据交互。`;

      result.itemCount = result.items.length;
      result.totalFunctions = result.items.reduce((sum, item) => sum + (item.functions || []).length, 0);

    } catch (parseError) {
      console.error('Item definition parse error:', parseError.message);
      console.error('Raw response:', resultText);
      return res.status(500).json({
        error: 'Failed to parse AI response.',
        message: 'The AI returned an invalid response. Please try again.',
        rawResponse: resultText.substring(0, 500)
      });
    }

    res.json({
      success: true,
      items: result.items,
      itemCount: result.itemCount,
      totalFunctions: result.totalFunctions,
      systemDescription: result.systemDescription,
      itemDefinition: result.systemDescription, // backward compat for Step 2 auto-fill
      originalLength: extractedText.length,
      extractedLength: resultText.trim().length
    });

  } catch (error) {
    console.error('Item definition extraction error:', error);
    res.status(500).json({
      error: 'Item Definition extraction failed.',
      message: error.message || 'Unexpected error.'
    });
  }
});

// ================================================================
// POST /api/generate-assets
// ================================================================
app.post('/api/generate-assets', async (req, res) => {
  try {
    const { projectName, systemDescription, optionalInfo } = req.body;

    if (!systemDescription || systemDescription.trim().length === 0) {
      return res.status(400).json({
        error: 'System Description is required.',
        message: 'Please provide a system description to analyze.'
      });
    }

    if (systemDescription.trim().length < 20) {
      return res.status(400).json({
        error: 'System Description is too short.',
        message: 'Please provide at least 20 characters for meaningful analysis.'
      });
    }

    const prompt = buildAssetPrompt(projectName, systemDescription, optionalInfo);

    const textContent = await callLLM(
      '你是一名汽车网络安全专家，专门从事TARA分析中的资产识别工作。你严格按照ISO/SAE 21434标准进行分析，输出必须是合法的JSON格式。',
      prompt
    );

    let result;
    try {
      result = parseJsonFromLLM(textContent);

      if (!result.assets || !Array.isArray(result.assets)) {
        throw new Error('Response missing assets array');
      }

      result.assets = result.assets.map((asset, index) => ({
        assetName: asset.assetName || `Asset ${index + 1}`,
        assetType: asset.assetType || 'Unknown',
        description: asset.description || '',
        valueRationale: asset.valueRationale || '',
        securityProperties: {
          confidentiality: asset.securityProperties?.confidentiality ?? false,
          integrity: asset.securityProperties?.integrity ?? false,
          availability: asset.securityProperties?.availability ?? false,
          authenticity: asset.securityProperties?.authenticity ?? false
        },
        damageScenarios: (asset.damageScenarios || []).map((ds, j) => ({
          scenarioName: ds.scenarioName || `损害场景 ${j + 1}`,
          description: ds.description || '',
          severity: ds.severity || 'Medium',
          affectedProperty: ds.affectedProperty || 'Unknown'
        }))
      }));

    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError.message);
      console.error('Raw response:', textContent);
      return res.status(500).json({
        error: 'Failed to parse AI response.',
        message: 'The AI returned an invalid response. Please try again.',
        rawResponse: textContent.substring(0, 500)
      });
    }

    res.json(result);

  } catch (error) {
    console.error('Error generating assets:', error);

    if (error.message && error.message.includes('No API key configured')) {
      return res.status(500).json({ error: 'API Key not configured.', message: error.message });
    }
    if (error.status === 401 || error.status === 403) {
      return res.status(500).json({ error: 'Authentication failed.', message: 'Invalid API key. Check your .env file.' });
    }
    if (error.status === 429) {
      return res.status(500).json({ error: 'Rate limited.', message: 'Too many requests. Please wait and try again.' });
    }

    res.status(500).json({
      error: 'Analysis failed.',
      message: error.message || 'An unexpected error occurred.'
    });
  }
});

// ---- Asset identification prompt ----
function buildAssetPrompt(projectName, systemDescription, optionalInfo) {
  let prompt = `你是一名拥有丰富经验的汽车网络安全工程师。

请根据ISO/SAE 21434中Asset Identification的思想，分析以下系统描述，识别系统中所有值得保护的重要资产（Asset）。

## 项目名称
${projectName || '未命名项目'}

## 系统描述
${systemDescription}
`;

  if (optionalInfo) {
    prompt += `
## 补充信息
${optionalInfo}
`;
  }

  prompt += `
## 分析要求

Asset可以包括但不限于以下类型：
- Data（数据）
- Software（软件）
- Firmware（固件）
- ECU
- Communication Link（通信链路）
- Key（密钥）
- Credentials（凭据）
- OTA Package（OTA升级包）
- Configuration（配置）
- User Privacy（用户隐私）
- Cloud Resource（云端资源）
- Service（服务）

对于每一个识别出的Asset，请输出以下字段：
- assetName: Asset的名称
- assetType: Asset的类型（从上述类型中选择）
- description: 对该Asset的描述
- valueRationale: 为什么该Asset值得保护（其在系统中的价值）
- securityProperties: 该Asset需要保护的安全属性对象，包含以下四个布尔字段：
  - confidentiality: 是否需要机密性保护
  - integrity: 是否需要完整性保护
  - availability: 是否需要可用性保护
  - authenticity: 是否需要真实性保护
- damageScenarios: 该资产如果被攻击可能导致的损害场景数组（至少2个），每个损害场景包含：
  - scenarioName: 损害场景名称（中文，简洁描述）
  - description: 损害场景的详细描述
  - severity: 严重程度（High/Medium/Low）
  - affectedProperty: 受影响的安全属性（Confidentiality/Integrity/Availability/Authenticity）

## 输出格式
请严格按照以下JSON格式输出，不要包含任何其他文字、解释或markdown标记：

{
  "projectName": "${projectName || '未命名项目'}",
  "assets": [
    {
      "assetName": "资产名称",
      "assetType": "资产类型",
      "description": "资产描述",
      "valueRationale": "保护价值说明",
      "securityProperties": {
        "confidentiality": true,
        "integrity": true,
        "availability": false,
        "authenticity": true
      },
      "damageScenarios": [
        {
          "scenarioName": "损害场景名称",
          "description": "损害场景的详细描述",
          "severity": "High",
          "affectedProperty": "Confidentiality"
        }
      ]
    }
  ]
}

每个资产至少包含 2 个 damageScenarios。

请确保输出是合法的JSON，且assets数组不为空。`;

  return prompt;
}

// ================================================================
// POST /api/analyze-threats (Step 3 — Threat Analysis)
// ================================================================
app.post('/api/analyze-threats', async (req, res) => {
  try {
    const { projectName, systemDescription, assets } = req.body;

    if (!assets || !Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({
        error: 'Assets required.',
        message: 'Please complete Asset Identification (Step 2) first.'
      });
    }

    const prompt = buildThreatPrompt(projectName, systemDescription, assets);

    const textContent = await callLLM(
      '你是一名汽车网络安全威胁分析专家，严格遵循ISO/SAE 21434标准进行TARA威胁分析。输出必须是合法的JSON格式。',
      prompt, 0.3, 8192
    );

    let result;
    try {
      result = parseJsonFromLLM(textContent);
      if (!result.threats || !Array.isArray(result.threats)) {
        throw new Error('Response missing threats array');
      }
      result.threats = result.threats.map((t, i) => ({
        threatId: t.threatId || `T-${String(i + 1).padStart(3, '0')}`,
        threatName: t.threatName || `威胁 ${i + 1}`,
        targetAsset: t.targetAsset || '',
        strideCategory: t.strideCategory || 'Unknown',
        description: t.description || '',
        damageScenario: t.damageScenario || '',
        affectedSecurityProperty: t.affectedSecurityProperty || '',
        threatSeverity: t.threatSeverity || 'Medium'
      }));
    } catch (parseError) {
      console.error('Threat parse error:', parseError.message);
      return res.status(500).json({
        error: 'Failed to parse threat analysis.',
        message: 'The AI returned an invalid response. Please try again.',
        rawResponse: textContent.substring(0, 500)
      });
    }

    res.json(result);

  } catch (error) {
    console.error('Threat analysis error:', error);
    res.status(500).json({
      error: 'Threat analysis failed.',
      message: error.message || 'Unexpected error.'
    });
  }
});

function buildThreatPrompt(projectName, systemDescription, assets) {
  const assetList = assets.map((a, i) =>
    `${i + 1}. ${a.assetName} (${a.assetType}) — ${a.description}`
  ).join('\n');

  return `你是一名拥有丰富经验的汽车网络安全工程师。

请根据ISO/SAE 21434标准，对以下系统进行威胁分析（Threat Analysis），识别出针对已识别资产的潜在威胁场景。

## 项目名称
${projectName || '未命名项目'}

## 系统描述
${systemDescription || '(从资产识别步骤继承)'}

## 已识别的资产
${assetList}

## 分析要求

对每个资产，使用STRIDE模型识别潜在威胁：
- Spoofing（欺骗）
- Tampering（篡改）
- Repudiation（否认）
- Information Disclosure（信息泄露）
- Denial of Service（拒绝服务）
- Elevation of Privilege（权限提升）

对于每一个识别出的威胁，输出以下字段：
- threatId: 威胁编号（如 T-001）
- threatName: 威胁名称（中文）
- targetAsset: 目标资产名称
- strideCategory: STRIDE分类
- description: 威胁描述（威胁如何发生）
- damageScenario: 损害场景（如果威胁成功会造成的后果）
- affectedSecurityProperty: 受影响的安全属性
- threatSeverity: 威胁严重程度（High/Medium/Low）

## 输出格式
严格输出以下JSON，不要包含任何其他文字：

{
  "projectName": "${projectName || '未命名项目'}",
  "threats": [
    {
      "threatId": "T-001",
      "threatName": "威胁名称",
      "targetAsset": "目标资产",
      "strideCategory": "Spoofing",
      "description": "威胁描述",
      "damageScenario": "损害场景描述",
      "affectedSecurityProperty": "Confidentiality",
      "threatSeverity": "High"
    }
  ]
}

请输出合法JSON，threats数组不为空。`;
}

// ================================================================
// POST /api/generate-attack-paths (Step 4 — Attack Path Analysis)
// ================================================================
app.post('/api/generate-attack-paths', async (req, res) => {
  try {
    const { projectName, systemDescription, assets, threats } = req.body;

    if (!threats || !Array.isArray(threats) || threats.length === 0) {
      return res.status(400).json({
        error: 'Threats required.',
        message: 'Please complete Threat Analysis (Step 3) first.'
      });
    }

    const prompt = buildAttackPathPrompt(projectName, systemDescription, threats);

    const textContent = await callLLM(
      '你是一名汽车网络安全攻击路径分析专家。你严格遵循ISO/SAE 21434标准，输出必须是合法的JSON格式。',
      prompt, 0.3, 8192
    );

    let result;
    try {
      result = parseJsonFromLLM(textContent);
      if (!result.attackPaths || !Array.isArray(result.attackPaths)) {
        throw new Error('Response missing attackPaths array');
      }
      result.attackPaths = result.attackPaths.map((ap, i) => ({
        attackPathId: ap.attackPathId || `AP-${String(i + 1).padStart(3, '0')}`,
        attackPathName: ap.attackPathName || `攻击路径 ${i + 1}`,
        relatedThreats: ap.relatedThreats || [],
        entryPoint: ap.entryPoint || '',
        attackSteps: ap.attackSteps || [],
        requiredCapability: ap.requiredCapability || '',
        attackFeasibility: ap.attackFeasibility || 'Medium',
        impactLevel: ap.impactLevel || 'Medium'
      }));
    } catch (parseError) {
      console.error('Attack path parse error:', parseError.message);
      return res.status(500).json({
        error: 'Failed to parse attack paths.',
        message: 'The AI returned an invalid response. Please try again.',
        rawResponse: textContent.substring(0, 500)
      });
    }

    res.json(result);

  } catch (error) {
    console.error('Attack path error:', error);
    res.status(500).json({
      error: 'Attack path analysis failed.',
      message: error.message || 'Unexpected error.'
    });
  }
});

function buildAttackPathPrompt(projectName, systemDescription, threats) {
  const threatList = threats.map((t, i) =>
    `${i + 1}. [${t.threatId}] ${t.threatName} → 目标: ${t.targetAsset} (STRIDE: ${t.strideCategory})`
  ).join('\n');

  return `你是一名汽车网络安全攻击路径分析专家。

请根据ISO/SAE 21434标准，分析如何从攻击者视角实现以下威胁，构建攻击路径。

## 项目名称
${projectName || '未命名项目'}

## 系统描述
${systemDescription || '(继承自前序步骤)'}

## 已识别的威胁
${threatList}

## 分析要求

对每个威胁或关联威胁组，分析攻击路径：
- 攻击入口点（从系统边界进入）
- 攻击步骤（逐步渗透的过程）
- 所需能力/工具
- 攻击可行性评估
- 影响等级

输出字段：
- attackPathId: 攻击路径编号（如 AP-001）
- attackPathName: 攻击路径名称（中文）
- relatedThreats: 关联的威胁ID列表
- entryPoint: 攻击入口点
- attackSteps: 攻击步骤数组（顺序描述每一步）
- requiredCapability: 攻击者所需能力/资源
- attackFeasibility: 攻击可行性（High/Medium/Low/Very Low）
- impactLevel: 影响等级（High/Medium/Low）

## 输出格式
严格输出以下JSON：

{
  "projectName": "${projectName || '未命名项目'}",
  "attackPaths": [
    {
      "attackPathId": "AP-001",
      "attackPathName": "攻击路径名称",
      "relatedThreats": ["T-001", "T-002"],
      "entryPoint": "攻击入口描述",
      "attackSteps": ["步骤1: ...", "步骤2: ...", "步骤3: ..."],
      "requiredCapability": "所需能力描述",
      "attackFeasibility": "Medium",
      "impactLevel": "High"
    }
  ]
}`;
}

// ================================================================
// POST /api/generate-risk-treatment (Step 5 — Risk Treatment)
// ================================================================
app.post('/api/generate-risk-treatment', async (req, res) => {
  try {
    const { projectName, systemDescription, assets, threats, attackPaths } = req.body;

    if (!attackPaths || !Array.isArray(attackPaths) || attackPaths.length === 0) {
      return res.status(400).json({
        error: 'Attack paths required.',
        message: 'Please complete Attack Path Analysis (Step 4) first.'
      });
    }

    const prompt = buildRiskTreatmentPrompt(projectName, systemDescription, threats, attackPaths);

    const textContent = await callLLM(
      '你是一名汽车网络安全风险处置专家。你严格遵循ISO/SAE 21434标准，输出必须是合法的JSON格式。',
      prompt, 0.3, 8192
    );

    let result;
    try {
      result = parseJsonFromLLM(textContent);
      if (!result.riskTreatments || !Array.isArray(result.riskTreatments)) {
        throw new Error('Response missing riskTreatments array');
      }
      result.riskTreatments = result.riskTreatments.map((rt, i) => ({
        treatmentId: rt.treatmentId || `RT-${String(i + 1).padStart(3, '0')}`,
        relatedAttackPath: rt.relatedAttackPath || '',
        treatmentDecision: rt.treatmentDecision || 'Mitigate',
        controlName: rt.controlName || `控制措施 ${i + 1}`,
        controlDescription: rt.controlDescription || '',
        controlType: rt.controlType || 'Technical',
        implementationPriority: rt.implementationPriority || 'Medium',
        residualRisk: rt.residualRisk || 'Low',
        verificationMethod: rt.verificationMethod || ''
      }));
    } catch (parseError) {
      console.error('Risk treatment parse error:', parseError.message);
      return res.status(500).json({
        error: 'Failed to parse risk treatment.',
        message: 'The AI returned an invalid response. Please try again.',
        rawResponse: textContent.substring(0, 500)
      });
    }

    res.json(result);

  } catch (error) {
    console.error('Risk treatment error:', error);
    res.status(500).json({
      error: 'Risk treatment generation failed.',
      message: error.message || 'Unexpected error.'
    });
  }
});

function buildRiskTreatmentPrompt(projectName, systemDescription, threats, attackPaths) {
  const apList = attackPaths.map((ap, i) =>
    `${i + 1}. [${ap.attackPathId}] ${ap.attackPathName} — 可行性: ${ap.attackFeasibility}, 影响: ${ap.impactLevel}`
  ).join('\n');

  const threatList = threats ? threats.map((t, i) =>
    `${i + 1}. [${t.threatId}] ${t.threatName} — 严重程度: ${t.threatSeverity}`
  ).join('\n') : '';

  return `你是一名汽车网络安全风险处置专家。

请根据ISO/SAE 21434标准，针对以下攻击路径和威胁，制定风险处置方案。

## 项目名称
${projectName || '未命名项目'}

## 系统描述
${systemDescription || '(继承自前序步骤)'}

## 威胁列表
${threatList || '(无)'}

## 攻击路径
${apList}

## 分析要求

对于每个攻击路径，确定处置决策并设计安全控制措施。

处置决策类型：
- Eliminate（消除）：移除风险源
- Mitigate（缓解）：降低风险到可接受水平
- Share（分担）：转移/分担风险
- Accept（接受）：接受残余风险

控制措施类型：
- Technical（技术控制）
- Organizational（组织控制）
- Physical（物理控制）

输出字段：
- treatmentId: 处置编号（如 RT-001）
- relatedAttackPath: 关联的攻击路径ID
- treatmentDecision: 处置决策（Eliminate/Mitigate/Share/Accept）
- controlName: 控制措施名称（中文）
- controlDescription: 控制措施描述
- controlType: 控制类型（Technical/Organizational/Physical）
- implementationPriority: 实施优先级（High/Medium/Low）
- residualRisk: 残余风险等级
- verificationMethod: 验证方法

## 输出格式
严格输出以下JSON：

{
  "projectName": "${projectName || '未命名项目'}",
  "riskTreatments": [
    {
      "treatmentId": "RT-001",
      "relatedAttackPath": "AP-001",
      "treatmentDecision": "Mitigate",
      "controlName": "控制措施名称",
      "controlDescription": "详细描述",
      "controlType": "Technical",
      "implementationPriority": "High",
      "residualRisk": "Low",
      "verificationMethod": "验证方法描述"
    }
  ]
}`;
}
//docx转换json

// ================================================================
// POST /api/structure-docx
// Converts DOCX content (HTML+text) to structured JSON using LLM
// Replicates the logic from docx_to_json.py AI conversion step
// ================================================================
app.post('/api/structure-docx', async (req, res) => {
  try {
    const { extractedText, extractedHtml, filename } = req.body;

    if (!extractedText || extractedText.trim().length < 20) {
      return res.status(400).json({
        error: 'Insufficient content.',
        message: 'The document content is too short to structure.'
      });
    }

    // Use HTML if available (preserves table structure), otherwise plain text
    const contentForAI = extractedHtml || extractedText;

    const systemPrompt = `你是一个精确的 JSON 数据转换器。你的任务是将从 DOCX 文档中提取的内容转换为结构化的 JSON 格式。
只返回 JSON，不要有其他内容。`;

    const userPrompt = `请将以下从 DOCX 文档中提取的内容转换为结构化的 JSON 格式。

要求:
1. 仔细分析内容，识别出数据的逻辑结构（如：需求列表、配置项、功能定义、检查清单等）
2. 如果内容中包含表格，将表格数据转为 JSON 数组，每行一个对象
3. 保留所有原始文本内容，不要遗漏任何信息
4. 添加有意义的字段名（使用英文 camelCase）
5. 如果有层级关系，用嵌套 JSON 表示
6. 返回纯 JSON，不要包含任何解释文字，不要用 markdown 代码块包裹

文件名：${filename || '未命名文件'}

文档内容如下:
${contentForAI.slice(0, 30000)}`;

    const resultText = await callLLM(systemPrompt, userPrompt, 0.1, 8192);

    let structuredJson;
    try {
      structuredJson = parseJsonFromLLM(resultText);
    } catch (parseErr) {
      console.error('Structure JSON parse error:', parseErr.message);
      return res.status(500).json({
        error: 'Failed to structure document.',
        message: 'The AI returned invalid JSON. Please try again.',
        rawResponse: resultText.substring(0, 500)
      });
    }

    res.json({
      success: true,
      metadata: {
        filename: filename || 'unknown',
        sourceType: extractedHtml ? 'docx-html' : 'text',
        originalLength: extractedText.length
      },
      structuredJson
    });

  } catch (error) {
    console.error('Structure DOCX error:', error);
    res.status(500).json({
      error: 'Document structuring failed.',
      message: error.message || 'Unexpected error.'
    });
  }
});

// ---- Health check ----
app.get('/api/health', (req, res) => {
  const info = getProviderInfo();
  res.json({
    status: 'ok',
    provider: info ? info.provider : 'none',
    model: info ? info.model : null,
    hasApiKey: !!info,
    timestamp: new Date().toISOString()
  });
});

function getLanUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];

  Object.values(interfaces).forEach((entries = []) => {
    entries.forEach((entry) => {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    });
  });

  return urls;
}

// ---- Start server ----
app.listen(PORT, HOST, () => {
  const info = getProviderInfo();
  const lanUrls = getLanUrls(PORT);
  console.log(`\n🔒 TARA Asset Identification Tool`);
  console.log(`   Local:   http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    if (lanUrls.length) {
      lanUrls.forEach((url) => console.log(`   Network: ${url}`));
    } else {
      console.log(`   Network: http://<your-lan-ip>:${PORT}`);
    }
  } else {
    console.log(`   Host:    ${HOST}`);
  }
  if (info) {
    console.log(`   API Provider: ${info.provider.toUpperCase()}`);
    console.log(`   Model: ${info.model}`);
    console.log(`   Key: ${info.keyPreview}`);
  } else {
    console.log(`   API Key: ❌ Not configured (create/edit .env file)`);
  }
  console.log(`   Supported uploads: .docx .pdf .txt .json .md .csv\n`);
});
