/**
 * TARA 资产识别与分析工具 — 5-Step Workflow
 * Step 1: 相关项定义  Step 2: 资产识别  Step 3: 威胁分析
 * Step 4: 攻击路径    Step 5: 风险处置
 */

// ============================================================
// Global State
// ============================================================
const state = {
  currentStep: 1,
  projectName: '',
  // Step 1
  itemDefinition: '',
  itemDefinitionItems: [],  // structured list of items
  // Step 2
  systemDescription: '',
  optionalInfo: '',
  assets: [],
  // Step 3
  threats: [],
  // Step 4
  attackPaths: [],
  // Step 5
  riskTreatments: []
};

// ============================================================
// DOM: Step Navigation
// ============================================================
const stepBtns = [1, 2, 3, 4, 5].map(n => document.getElementById(`stepBtn${n}`));
const stepPanels = [1, 2, 3, 4, 5].map(n => document.getElementById(`stepPanel${n}`));

// ============================================================
// DOM: Shared
// ============================================================
const projectNameInput = document.getElementById('projectName');
const projectDisplayName = document.getElementById('projectDisplayName');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

// ============================================================
// DOM: Step 1
// ============================================================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSizeEl = document.getElementById('fileSize');
const clearFileBtn = document.getElementById('clearFileBtn');
const extractStatus = document.getElementById('extractStatus');
const extractProgressFill = document.getElementById('extractProgressFill');
const extractStatusText = document.getElementById('extractStatusText');
const manualItemDef = document.getElementById('manualItemDef');
const step1GenerateBtn = document.getElementById('step1GenerateBtn');
const step1ResultHint = document.getElementById('step1ResultHint');
const step1Result = document.getElementById('step1Result');

// ============================================================
// DOM: Step 2
// ============================================================
const systemDescription = document.getElementById('systemDescription');
const optionalInfo = document.getElementById('optionalInfo');
const charCountEl = document.getElementById('charCount');
const step2GenerateBtn = document.getElementById('step2GenerateBtn');
const step2Loading = document.getElementById('step2Loading');
const step2ResultHint = document.getElementById('step2ResultHint');
const step2Result = document.getElementById('step2Result');

// ============================================================
// DOM: Step 3
// ============================================================
const step3Context = document.getElementById('step3Context');
const threatContext = document.getElementById('threatContext');
const step3GenerateBtn = document.getElementById('step3GenerateBtn');
const step3Loading = document.getElementById('step3Loading');
const step3ResultHint = document.getElementById('step3ResultHint');
const step3Result = document.getElementById('step3Result');

// ============================================================
// DOM: Step 4
// ============================================================
const step4Context = document.getElementById('step4Context');
const step4GenerateBtn = document.getElementById('step4GenerateBtn');
const step4Loading = document.getElementById('step4Loading');
const step4ResultHint = document.getElementById('step4ResultHint');
const step4Result = document.getElementById('step4Result');

// ============================================================
// DOM: Step 5
// ============================================================
const step5Context = document.getElementById('step5Context');
const step5GenerateBtn = document.getElementById('step5GenerateBtn');
const step5Loading = document.getElementById('step5Loading');
const step5ResultHint = document.getElementById('step5ResultHint');
const step5Result = document.getElementById('step5Result');

// ============================================================
// DOM: Export
// ============================================================
const exportModal = document.getElementById('exportModal');
const exportAllJsonBtn = document.getElementById('exportAllJsonBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// ============================================================
// Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  checkApiHealth();
  setupStepNavigation();
  setupFileUpload();
  setupCharCounter();
  setupButtons();
  updateStepStates();
});

function checkApiHealth() {
  fetch('/api/health')
    .then(r => r.json())
    .then(d => {
      if (d.hasApiKey) setStatus('connected', `API 就绪 (${d.provider || '?'})`);
      else setStatus('disconnected', 'API Key 未设置');
    })
    .catch(() => setStatus('error', '服务器未连接'));
}

function setStatus(state, text) {
  statusIndicator.className = `status-indicator status-${state}`;
  statusText.textContent = text;
}

// ============================================================
// Step Navigation
// ============================================================
function setupStepNavigation() {
  stepBtns.forEach((btn, i) => {
    btn.addEventListener('click', () => navigateToStep(i + 1));
  });
}

function navigateToStep(step) {
  if (step < 1 || step > 5) return;
  if (step > 1 && !isStepDone(step - 1)) return; // must complete prior step

  state.currentStep = step;
  updateStepStates();
  refreshStepContext();
}

function isStepDone(step) {
  switch (step) {
    case 1: return !!state.itemDefinition;
    case 2: return state.assets.length > 0;
    case 3: return state.threats.length > 0;
    case 4: return state.attackPaths.length > 0;
    case 5: return state.riskTreatments.length > 0;
    default: return false;
  }
}

function updateStepStates() {
  stepBtns.forEach((btn, i) => {
    const step = i + 1;
    btn.classList.remove('active', 'done');
    btn.disabled = false;

    if (step === state.currentStep) {
      btn.classList.add('active');
    } else if (isStepDone(step)) {
      btn.classList.add('done');
    }

    // Lock steps beyond the first incomplete one
    if (step > 1 && !isStepDone(step - 1)) {
      btn.disabled = true;
    }
  });

  // Show/hide panels
  stepPanels.forEach((panel, i) => {
    panel.classList.toggle('active', (i + 1) === state.currentStep);
  });

  updateProjectDisplay();
}

function updateProjectDisplay() {
  projectDisplayName.textContent = state.projectName || '';
  projectNameInput.value = state.projectName || '';
}

function refreshStepContext() {
  if (state.currentStep === 3) refreshStep3Context();
  if (state.currentStep === 4) refreshStep4Context();
  if (state.currentStep === 5) refreshStep5Context();
}

// ============================================================
// Step 1: File Upload
// ============================================================
function setupFileUpload() {
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drop-zone--active'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drop-zone--active'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drop-zone--active');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  clearFileBtn.addEventListener('click', () => {
    fileInput.value = ''; fileInfo.classList.add('hidden'); dropZone.classList.remove('hidden');
    extractStatus.classList.add('hidden');
  });
}

function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['docx','doc','pdf','txt','json','md','csv'].includes(ext)) {
    alert(`不支持的文件类型：.${ext}`);
    return;
  }
  fileName.textContent = file.name;
  fileSizeEl.textContent = formatFileSize(file.size);
  fileInfo.classList.remove('hidden');
  dropZone.classList.add('hidden');
  extractTextFromFile(file);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

// Global state: store structured JSON from DOCX
let structuredDocxJson = null;

async function extractTextFromFile(file) {
  showExtractProgress('正在从文档中提取文本…', true);
  const fd = new FormData(); fd.append('file', file);
  try {
    const res = await fetch('/api/upload-extract', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error);
    updateExtractProgress(100, false);
    extractStatusText.textContent = `已提取 ${data.metadata.charCount.toLocaleString()} 个字符`;

    // If DOCX and has HTML, structure it as JSON first (like docx_to_json.py)
    if (data.extractedHtml && data.metadata.fileType === '.docx') {
      await structureDocxContent(data.extractedText, data.extractedHtml, data.metadata.filename);
    } else {
      // Non-DOCX: go straight to Item Definition extraction
      await extractItemDefinition(data.extractedText, data.metadata.filename);
    }
  } catch (err) {
    showExtractError(err.message);
  }
}

// ---- New: Structure DOCX content as JSON (replicates docx_to_json.py AI step) ----
async function structureDocxContent(rawText, html, filename) {
  showExtractProgress('🤖 AI 正在结构化文档内容…', true);
  try {
    const res = await fetch('/api/structure-docx', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractedText: rawText, extractedHtml: html, filename })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error);

    structuredDocxJson = data.structuredJson;
    updateExtractProgress(100, false);
    extractStatusText.textContent = '✅ 文档结构化完成！';

    // Show structured JSON in right panel
    step1ResultHint.textContent = '已转换为结构化 JSON';
    step1Result.innerHTML = renderStructuredJsonResult(structuredDocxJson, filename);

    // Now extract Item Definition from structured JSON
    // Convert structured JSON to a text representation for the Item Definition extractor
    const jsonAsText = JSON.stringify(structuredDocxJson, null, 2);
    await extractItemDefinition(jsonAsText, filename);

  } catch (err) {
    console.error('DOCX structuring failed:', err);
    extractStatusText.textContent = '⚠️ 结构化失败，直接提取 Item Definition…';
    // Fallback: extract Item Definition from raw text
    await extractItemDefinition(rawText, filename);
  }
}

// ---- Render structured JSON in right panel ----
function renderStructuredJsonResult(json, filename) {
  const jsonStr = JSON.stringify(json, null, 2);
  return `
    <div class="result-list">
      <div class="result-card">
        <div class="result-card-header">
          <span class="result-card-title">📊 结构化 JSON</span>
          <span class="result-card-badge badge-asset">${escapeHtml(filename || 'document')}</span>
        </div>
        <pre class="structured-json-block">${escapeHtml(jsonStr.slice(0, 5000))}${jsonStr.length > 5000 ? '\n… (内容已截断)' : ''}</pre>
      </div>
    </div>`;
}

async function extractItemDefinition(rawText, filename) {
  showExtractProgress('AI 正在识别 Item Definition…', true);
  try {
    const res = await fetch('/api/extract-item-definition', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractedText: rawText, filename })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error);

    state.itemDefinition = data.itemDefinition || data.systemDescription;
    state.systemDescription = data.systemDescription || data.itemDefinition;
    state.itemDefinitionItems = data.items || [];
    if (!state.projectName && filename) {
      state.projectName = filename.replace(/\.[^.]+$/, '');
    }
    updateExtractProgress(100, false);
    extractStatusText.textContent = '✅ Item Definition 提取成功！';

    // Show results: items list + summary
    const itemCount = data.itemCount || state.itemDefinitionItems.length || 0;
    step1ResultHint.textContent = `已识别 ${itemCount} 个相关项`;
    let resultHtml = '';
    if (structuredDocxJson) {
      resultHtml += renderStructuredJsonResult(structuredDocxJson, filename) + '<div style="margin:12px 0;"></div>';
    }
    resultHtml += renderItemDefinitionItems(state.itemDefinitionItems);
    resultHtml += renderItemDefinitionResult(state.itemDefinition);
    step1Result.innerHTML = resultHtml;

    // Auto-fill Step 2
    systemDescription.value = state.itemDefinition;
    charCountEl.textContent = state.itemDefinition.length;

    // Unlock Step 2
    updateStepStates();

    setTimeout(() => { extractStatus.classList.add('hidden'); }, 3000);
  } catch (err) {
    // Fallback: use raw text
    state.itemDefinition = rawText;
    state.systemDescription = rawText;
    step1ResultHint.textContent = '⚠️ 使用原始文本';
    let fbHtml = '';
    if (structuredDocxJson) {
      fbHtml += renderStructuredJsonResult(structuredDocxJson, filename) + '<div style="margin:12px 0;"></div>';
    }
    fbHtml += renderItemDefinitionResult(rawText);
    step1Result.innerHTML = fbHtml;
    systemDescription.value = rawText;
    charCountEl.textContent = rawText.length;
    updateStepStates();
    extractStatusText.textContent = '⚠️ AI 提取失败，已使用原始文本';
    setTimeout(() => { extractStatus.classList.add('hidden'); }, 4000);
  }
}

// ---- Render individual Item Definition items as cards ----
function renderItemDefinitionItems(items) {
  if (!items || items.length === 0) return '';
  return `
    <div class="item-def-list">
      <div class="item-def-list-header">
        <span class="item-def-list-title">📋 相关项列表</span>
        <span class="item-def-list-count">${items.length} 个相关项</span>
      </div>
      ${items.map(item => `
        <div class="item-def-card">
          <div class="item-def-card-header">
            <span class="item-def-card-id">${escapeHtml(item.itemId || '?')}</span>
            <span class="item-def-card-name">${escapeHtml(item.itemName || '未命名')}</span>
          </div>
          ${item.description ? `<div class="item-def-card-desc">${escapeHtml(item.description)}</div>` : ''}
          ${item.functions && item.functions.length > 0 ? `
            <div class="item-def-functions">
              <div class="item-def-functions-title">⚙️ 子功能 (${item.functions.length})</div>
              ${item.functions.map(fn => `
                <div class="item-def-function-item">
                  <span class="item-def-function-id">${escapeHtml(fn.functionId || '?')}</span>
                  <span class="item-def-function-name">${escapeHtml(fn.functionName || '未命名')}</span>
                  ${fn.description ? `<span class="item-def-function-desc"> — ${escapeHtml(fn.description.slice(0, 120))}${fn.description.length > 120 ? '…' : ''}</span>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderItemDefinitionResult(text) {
  if (!text) return '';
  return `
    <details class="item-def-summary" open>
      <summary class="item-def-summary-header">
        <span class="item-def-summary-title">📄 系统描述摘要</span>
        <span class="item-def-summary-hint">（自动填入步骤2）</span>
      </summary>
      <div class="item-def-summary-text">${escapeHtml(text.slice(0, 3000))}${text.length > 3000 ? '\n\n… (内容已截断)' : ''}</div>
    </details>`;
}

// ============================================================
// Step 1: Manual input fallback
// ============================================================
step1GenerateBtn.addEventListener('click', async () => {
  const manualText = manualItemDef.value.trim();
  if (!manualText && !state.itemDefinition) {
    alert('请先上传文档或手动输入系统描述。');
    return;
  }
  if (manualText) {
    state.itemDefinition = manualText;
    state.systemDescription = manualText;
    step1ResultHint.textContent = `${manualText.length} 个字符`;
    step1Result.innerHTML = renderItemDefinitionResult(manualText);
    systemDescription.value = manualText;
    charCountEl.textContent = manualText.length;
    updateStepStates();
  }
});

// ============================================================
// Extract Progress Helpers
// ============================================================
function showExtractProgress(text, indeterminate) {
  extractStatus.classList.remove('hidden');
  extractStatusText.textContent = text;
  extractProgressFill.style.width = '0%';
  extractProgressFill.classList.toggle('extract-progress-fill--indeterminate', indeterminate);
}
function updateExtractProgress(pct, indeterminate) {
  extractProgressFill.classList.toggle('extract-progress-fill--indeterminate', indeterminate);
  extractProgressFill.style.width = `${pct}%`;
}
function showExtractError(msg) {
  extractStatusText.textContent = `❌ ${msg}`;
  extractProgressFill.classList.remove('extract-progress-fill--indeterminate');
  extractProgressFill.style.background = 'var(--error)';
  extractProgressFill.style.width = '100%';
}

// ============================================================
// Step 2: Asset Identification
// ============================================================
function setupCharCounter() {
  systemDescription.addEventListener('input', () => {
    charCountEl.textContent = systemDescription.value.length;
    state.systemDescription = systemDescription.value;
  });
  optionalInfo.addEventListener('input', () => { state.optionalInfo = optionalInfo.value; });
  projectNameInput.addEventListener('input', () => { state.projectName = projectNameInput.value; });
}

step2GenerateBtn.addEventListener('click', async () => {
  const desc = systemDescription.value.trim();
  if (!desc || desc.length < 20) {
    alert('系统描述至少需要 20 个字符。');
    return;
  }
  state.systemDescription = desc;
  state.optionalInfo = optionalInfo.value.trim();
  state.projectName = projectNameInput.value.trim() || state.projectName;

  setBtnLoading(step2GenerateBtn, step2Loading, true, '正在分析…');
  try {
    const res = await fetch('/api/generate-assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: state.projectName,
        systemDescription: state.systemDescription,
        optionalInfo: state.optionalInfo
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error);

    state.assets = data.assets || [];
    step2ResultHint.textContent = `已识别 ${state.assets.length} 个资产`;
    step2Result.innerHTML = renderAssetResults(state.assets);
    updateStepStates();
  } catch (err) {
    alert(`资产识别失败：${err.message}`);
  } finally {
    setBtnLoading(step2GenerateBtn, step2Loading, false, '生成资产清单');
  }
});

// ============================================================
// Step 3: Threat Analysis
// ============================================================
function refreshStep3Context() {
  if (state.assets.length === 0) {
    step3Context.innerHTML = '<strong>⚠️ 请先在步骤2完成资产识别。</strong>';
    step3GenerateBtn.disabled = true;
    return;
  }
  step3GenerateBtn.disabled = false;
  const items = state.assets.slice(0, 8).map(a => `• <strong>${escapeHtml(a.assetName)}</strong> (${escapeHtml(a.assetType)})`).join('<br>');
  step3Context.innerHTML = `<strong>已识别 ${state.assets.length} 个资产：</strong><br>${items}${state.assets.length > 8 ? `<br>… 还有 ${state.assets.length - 8} 个` : ''}`;
}

step3GenerateBtn.addEventListener('click', async () => {
  if (state.assets.length === 0) return;
  setBtnLoading(step3GenerateBtn, step3Loading, true, '正在分析威胁…');
  try {
    const res = await fetch('/api/analyze-threats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: state.projectName,
        systemDescription: state.systemDescription,
        assets: state.assets,
        threatContext: threatContext.value.trim()
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error);

    state.threats = data.threats || [];
    step3ResultHint.textContent = `已识别 ${state.threats.length} 个威胁`;
    step3Result.innerHTML = renderThreatResults(state.threats);
    updateStepStates();
  } catch (err) {
    alert(`威胁分析失败：${err.message}`);
  } finally {
    setBtnLoading(step3GenerateBtn, step3Loading, false, '分析威胁场景');
  }
});

// ============================================================
// Step 4: Attack Paths
// ============================================================
function refreshStep4Context() {
  if (state.threats.length === 0) {
    step4Context.innerHTML = '<strong>⚠️ 请先在步骤3完成威胁分析。</strong>';
    step4GenerateBtn.disabled = true;
    return;
  }
  step4GenerateBtn.disabled = false;
  const items = state.threats.slice(0, 5).map(t =>
    `• <strong>${escapeHtml(t.threatId)}</strong> ${escapeHtml(t.threatName)} <span style="color:var(--warning)">[${escapeHtml(t.strideCategory)}]</span>`
  ).join('<br>');
  step4Context.innerHTML = `<strong>已识别 ${state.threats.length} 个威胁：</strong><br>${items}${state.threats.length > 5 ? `<br>… 还有 ${state.threats.length - 5} 个` : ''}`;
}

step4GenerateBtn.addEventListener('click', async () => {
  if (state.threats.length === 0) return;
  setBtnLoading(step4GenerateBtn, step4Loading, true, '正在构建攻击路径…');
  try {
    const res = await fetch('/api/generate-attack-paths', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: state.projectName,
        systemDescription: state.systemDescription,
        assets: state.assets,
        threats: state.threats
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error);

    state.attackPaths = data.attackPaths || [];
    step4ResultHint.textContent = `已生成 ${state.attackPaths.length} 条攻击路径`;
    step4Result.innerHTML = renderAttackPathResults(state.attackPaths);
    updateStepStates();
  } catch (err) {
    alert(`攻击路径分析失败：${err.message}`);
  } finally {
    setBtnLoading(step4GenerateBtn, step4Loading, false, '生成攻击路径');
  }
});

// ============================================================
// Step 5: Risk Treatment
// ============================================================
function refreshStep5Context() {
  if (state.attackPaths.length === 0) {
    step5Context.innerHTML = '<strong>⚠️ 请先在步骤4完成攻击路径分析。</strong>';
    step5GenerateBtn.disabled = true;
    return;
  }
  step5GenerateBtn.disabled = false;
  const items = state.attackPaths.slice(0, 5).map(ap =>
    `• <strong>${escapeHtml(ap.attackPathId)}</strong> ${escapeHtml(ap.attackPathName)} <span style="color:var(--accent)">[可行性: ${escapeHtml(ap.attackFeasibility)}]</span>`
  ).join('<br>');
  step5Context.innerHTML = `<strong>已生成 ${state.attackPaths.length} 条攻击路径：</strong><br>${items}${state.attackPaths.length > 5 ? `<br>… 还有 ${state.attackPaths.length - 5} 条` : ''}`;
}

step5GenerateBtn.addEventListener('click', async () => {
  if (state.attackPaths.length === 0) return;
  setBtnLoading(step5GenerateBtn, step5Loading, true, '正在生成处置方案…');
  try {
    const res = await fetch('/api/generate-risk-treatment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: state.projectName,
        systemDescription: state.systemDescription,
        assets: state.assets,
        threats: state.threats,
        attackPaths: state.attackPaths
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error);

    state.riskTreatments = data.riskTreatments || [];
    step5ResultHint.textContent = `已生成 ${state.riskTreatments.length} 条处置方案`;
    step5Result.innerHTML = renderRiskTreatmentResults(state.riskTreatments);
    updateStepStates();
    // Show export modal
    setTimeout(() => exportModal.classList.remove('hidden'), 800);
  } catch (err) {
    alert(`风险处置失败：${err.message}`);
  } finally {
    setBtnLoading(step5GenerateBtn, step5Loading, false, '生成处置方案');
  }
});

// ============================================================
// Result Rendering
// ============================================================

function renderAssetResults(assets) {
  if (!assets.length) return '<div class="placeholder-block"><span class="placeholder-icon">📭</span><p>未识别到资产。</p></div>';
  return `
    <div class="summary-bar">
      <div class="summary-item"><span class="summary-value">${assets.length}</span><span class="summary-label">资产总数</span></div>
      <div class="summary-divider"></div>
      <div class="summary-item"><span class="summary-value">${new Set(assets.map(a => a.assetType)).size}</span><span class="summary-label">资产类型</span></div>
    </div>
    <div class="result-list" style="padding:20px 24px;overflow-y:auto;flex:1;">
      ${assets.map((a, i) => `
        <div class="result-card">
          <div class="result-card-header">
            <span class="result-card-title">${escapeHtml(a.assetName || `资产 ${i+1}`)}</span>
            <span class="result-card-badge badge-asset">${escapeHtml(a.assetType || '未知')}</span>
          </div>
          ${a.description ? `<div class="result-card-desc">${escapeHtml(a.description)}</div>` : ''}
          ${a.valueRationale ? `<div class="result-card-meta"><strong>💡 保护价值：</strong>${escapeHtml(a.valueRationale)}</div>` : ''}
          ${a.damageScenarios && a.damageScenarios.length > 0 ? `
            <div class="damage-scenarios">
              <div class="damage-scenarios-title">💥 损害场景 (${a.damageScenarios.length})</div>
              ${a.damageScenarios.map(ds => {
                const sevCls = `badge-severity-${(ds.severity || 'Medium').toLowerCase()}`;
                return `
                <div class="damage-scenario-item">
                  <div class="damage-scenario-header">
                    <span class="damage-scenario-name">${escapeHtml(ds.scenarioName || '?')}</span>
                    <span class="result-card-badge ${sevCls}">${escapeHtml(ds.severity || 'Medium')}</span>
                    <span class="result-card-badge badge-stride" style="font-size:11px;">${escapeHtml(ds.affectedProperty || '?')}</span>
                  </div>
                  <div class="damage-scenario-desc">${escapeHtml(ds.description || '')}</div>
                </div>`;
              }).join('')}
            </div>
          ` : ''}
          <div class="security-props">
            ${['confidentiality','integrity','availability','authenticity'].map(k => {
              const labels = { confidentiality: ['🔒','机密性'], integrity: ['✅','完整性'], availability: ['🟢','可用性'], authenticity: ['🔑','真实性'] };
              const v = a.securityProperties?.[k] === true;
              return `<span class="security-prop security-prop--${v}"><span>${labels[k][0]}</span> ${labels[k][1]} <strong>${v ? '✓' : '—'}</strong></span>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    <div class="export-bar">
      <button onclick="exportStepJSON('assets')" class="btn-export">📥 导出资产 JSON</button>
      <button onclick="copyStepJSON('assets')" class="btn-export btn-export--secondary">📋 复制 JSON</button>
    </div>`;
}

function renderThreatResults(threats) {
  if (!threats.length) return '<div class="placeholder-block"><span class="placeholder-icon">📭</span><p>未识别到威胁。</p></div>';
  return `
    <div class="summary-bar">
      <div class="summary-item"><span class="summary-value">${threats.length}</span><span class="summary-label">威胁总数</span></div>
      <div class="summary-divider"></div>
      <div class="summary-item"><span class="summary-value">${new Set(threats.map(t => t.strideCategory)).size}</span><span class="summary-label">STRIDE 类别</span></div>
    </div>
    <div class="result-list" style="padding:20px 24px;overflow-y:auto;flex:1;">
      ${threats.map(t => {
        const sevCls = `badge-severity-${(t.threatSeverity || 'Medium').toLowerCase()}`;
        return `
        <div class="result-card">
          <div class="result-card-header">
            <span class="result-card-title">${escapeHtml(t.threatId)} — ${escapeHtml(t.threatName)}</span>
            <div style="display:flex;gap:8px;">
              <span class="result-card-badge badge-stride">${escapeHtml(t.strideCategory || '?')}</span>
              <span class="result-card-badge ${sevCls}">${escapeHtml(t.threatSeverity || 'Medium')}</span>
            </div>
          </div>
          <div class="result-card-desc">${escapeHtml(t.description || '')}</div>
          <div class="result-card-meta"><strong>🎯 目标资产：</strong>${escapeHtml(t.targetAsset || '')}</div>
          <div class="result-card-meta"><strong>💥 损害场景：</strong>${escapeHtml(t.damageScenario || '')}</div>
          <div class="result-card-meta"><strong>🔐 受影响属性：</strong>${escapeHtml(t.affectedSecurityProperty || '')}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="export-bar">
      <button onclick="exportStepJSON('threats')" class="btn-export">📥 导出威胁 JSON</button>
      <button onclick="copyStepJSON('threats')" class="btn-export btn-export--secondary">📋 复制 JSON</button>
    </div>`;
}

function renderAttackPathResults(attackPaths) {
  if (!attackPaths.length) return '<div class="placeholder-block"><span class="placeholder-icon">📭</span><p>未生成攻击路径。</p></div>';
  return `
    <div class="summary-bar">
      <div class="summary-item"><span class="summary-value">${attackPaths.length}</span><span class="summary-label">攻击路径</span></div>
    </div>
    <div class="result-list" style="padding:20px 24px;overflow-y:auto;flex:1;">
      ${attackPaths.map(ap => `
        <div class="result-card">
          <div class="result-card-header">
            <span class="result-card-title">${escapeHtml(ap.attackPathId)} — ${escapeHtml(ap.attackPathName)}</span>
            <div style="display:flex;gap:8px;">
              <span class="result-card-badge badge-feasibility">可行性: ${escapeHtml(ap.attackFeasibility || '?')}</span>
              <span class="result-card-badge badge-severity-${(ap.impactLevel || 'Medium').toLowerCase()}">影响: ${escapeHtml(ap.impactLevel || 'Medium')}</span>
            </div>
          </div>
          <div class="result-card-meta"><strong>🚪 攻击入口：</strong>${escapeHtml(ap.entryPoint || '')}</div>
          <div class="result-card-meta"><strong>🔗 关联威胁：</strong>${(ap.relatedThreats || []).map(t => `<span class="threat-link">${escapeHtml(t)}</span>`).join(', ') || '—'}</div>
          ${ap.attackSteps && ap.attackSteps.length ? `
            <div class="attack-steps"><strong style="font-size:12px;color:var(--text-muted);">🛤️ 攻击步骤：</strong>
              ${ap.attackSteps.map((s, i) => `<div class="attack-step"><span class="attack-step-num">${i+1}</span>${escapeHtml(s)}</div>`).join('')}
            </div>
          ` : ''}
          <div class="result-card-meta"><strong>🛠️ 所需能力：</strong>${escapeHtml(ap.requiredCapability || '')}</div>
        </div>
      `).join('')}
    </div>
    <div class="export-bar">
      <button onclick="exportStepJSON('attackPaths')" class="btn-export">📥 导出攻击路径 JSON</button>
      <button onclick="copyStepJSON('attackPaths')" class="btn-export btn-export--secondary">📋 复制 JSON</button>
    </div>`;
}

function renderRiskTreatmentResults(treatments) {
  if (!treatments.length) return '<div class="placeholder-block"><span class="placeholder-icon">📭</span><p>未生成处置方案。</p></div>';
  return `
    <div class="summary-bar">
      <div class="summary-item"><span class="summary-value">${treatments.length}</span><span class="summary-label">处置方案</span></div>
    </div>
    <div class="result-list" style="padding:20px 24px;overflow-y:auto;flex:1;">
      ${treatments.map(rt => {
        const decCls = `badge-decision-${(rt.treatmentDecision || 'Mitigate').toLowerCase()}`;
        return `
        <div class="result-card">
          <div class="result-card-header">
            <span class="result-card-title">${escapeHtml(rt.treatmentId)} — ${escapeHtml(rt.controlName)}</span>
            <div style="display:flex;gap:8px;">
              <span class="result-card-badge ${decCls}">${escapeHtml(rt.treatmentDecision || '?')}</span>
              <span class="result-card-badge badge-control">${escapeHtml(rt.controlType || 'Technical')}</span>
            </div>
          </div>
          <div class="result-card-desc">${escapeHtml(rt.controlDescription || '')}</div>
          <div class="result-card-meta"><strong>🎯 关联攻击路径：</strong>${escapeHtml(rt.relatedAttackPath || '')}</div>
          <div class="result-card-meta"><strong>⚡ 实施优先级：</strong>${escapeHtml(rt.implementationPriority || 'Medium')} &nbsp;|&nbsp; <strong>📉 残余风险：</strong>${escapeHtml(rt.residualRisk || 'Low')}</div>
          ${rt.verificationMethod ? `<div class="result-card-meta"><strong>✅ 验证方法：</strong>${escapeHtml(rt.verificationMethod)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="export-bar">
      <button onclick="exportStepJSON('riskTreatments')" class="btn-export">📥 导出处置方案 JSON</button>
      <button onclick="copyStepJSON('riskTreatments')" class="btn-export btn-export--secondary">📋 复制 JSON</button>
    </div>`;
}

// ============================================================
// All Buttons Setup
// ============================================================
function setupButtons() {
  // Export modal
  exportAllJsonBtn.addEventListener('click', () => {
    const report = {
      projectName: state.projectName,
      generatedAt: new Date().toISOString(),
      step1_itemDefinition: state.itemDefinition,
      step2_assets: state.assets,
      step3_threats: state.threats,
      step4_attackPaths: state.attackPaths,
      step5_riskTreatments: state.riskTreatments
    };
    downloadJSON(report, `${(state.projectName || 'tara-report').replace(/[^a-zA-Z0-9_-]/g,'_')}_full_report.json`);
    exportModal.classList.add('hidden');
    showToast('✅ 完整 TARA 报告已导出！');
  });
  closeModalBtn.addEventListener('click', () => exportModal.classList.add('hidden'));
  exportModal.querySelector('.modal-overlay').addEventListener('click', () => exportModal.classList.add('hidden'));
}

// ============================================================
// Export / Copy Helpers
// ============================================================
function exportStepJSON(key) {
  const data = { projectName: state.projectName, [key]: state[key] };
  downloadJSON(data, `${(state.projectName || 'tara').replace(/[^a-zA-Z0-9_-]/g,'_')}_${key}.json`);
  showToast('✅ 已导出！');
}

function copyStepJSON(key) {
  const data = { projectName: state.projectName, [key]: state[key] };
  copyToClipboard(JSON.stringify(data, null, 2));
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('✅ 已复制到剪贴板！'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('✅ 已复制到剪贴板！');
  }
}

// ============================================================
// Button Loading Helper
// ============================================================
function setBtnLoading(btn, loadingArea, isLoading, originalText) {
  if (isLoading) {
    btn.disabled = true;
    btn.querySelector('.btn-icon').textContent = '⏳';
    btn.childNodes[btn.childNodes.length - 1].textContent = originalText;
    loadingArea.classList.remove('hidden');
  } else {
    btn.disabled = false;
    btn.querySelector('.btn-icon').textContent = btn.dataset.icon || '⚡';
    btn.childNodes[btn.childNodes.length - 1].textContent = originalText;
    loadingArea.classList.add('hidden');
  }
}

// Store original icons
document.querySelectorAll('.btn-generate').forEach(btn => {
  const iconEl = btn.querySelector('.btn-icon');
  if (iconEl) btn.dataset.icon = iconEl.textContent;
});

// ============================================================
// Toast
// ============================================================
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div'); toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('toast--visible');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('toast--visible'), 2000);
}

// ============================================================
// Utility
// ============================================================
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
