import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileJson,
  FileSearch,
  FolderOpen,
  Loader2,
  Map,
  Shield,
  ShieldCheck,
  Target,
  Upload,
  X
} from 'lucide-react';
import { taraApi } from './api/taraApi';
import type { Asset, AttackPath, Health, ItemDefinition, RiskTreatment, Threat, UploadedDocument } from './types/tara';
import './styles.css';

type Step = 1 | 2 | 3 | 4 | 5;
type JsonKey = 'assets' | 'threats' | 'attackPaths' | 'riskTreatments';

const steps: Array<{ id: Step; label: string }> = [
  { id: 1, label: '相关项定义' },
  { id: 2, label: '资产识别' },
  { id: 3, label: '威胁分析' },
  { id: 4, label: '攻击路径' },
  { id: 5, label: '风险处置' }
];

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);

  const [projectName, setProjectName] = useState('');
  const [document, setDocument] = useState<UploadedDocument | null>(null);
  const [manualItemDefinition, setManualItemDefinition] = useState('');
  const [structuredDocxJson, setStructuredDocxJson] = useState<unknown>(null);
  const [itemDefinition, setItemDefinition] = useState('');
  const [items, setItems] = useState<ItemDefinition[]>([]);

  const [systemDescription, setSystemDescription] = useState('');
  const [optionalInfo, setOptionalInfo] = useState('');
  const [threatContext, setThreatContext] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [attackPaths, setAttackPaths] = useState<AttackPath[]>([]);
  const [riskTreatments, setRiskTreatments] = useState<RiskTreatment[]>([]);

  useEffect(() => {
    taraApi
      .health()
      .then(setHealth)
      .catch(() => setHealth({ status: 'error', provider: 'none', model: null, hasApiKey: false }));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const canOpenStep = (step: Step) => {
    if (step === 1) return true;
    if (step === 2) return Boolean(itemDefinition);
    if (step === 3) return assets.length > 0;
    if (step === 4) return threats.length > 0;
    if (step === 5) return attackPaths.length > 0;
    return false;
  };

  const stepDone = (step: Step) => {
    if (step === 1) return Boolean(itemDefinition);
    if (step === 2) return assets.length > 0;
    if (step === 3) return threats.length > 0;
    if (step === 4) return attackPaths.length > 0;
    if (step === 5) return riskTreatments.length > 0;
    return false;
  };

  async function run<T>(label: string, task: () => Promise<T>, after: (value: T) => void) {
    setBusy(label);
    setError('');
    try {
      const value = await task();
      after(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy('');
    }
  }

  async function handleUpload(file: File) {
    await run('正在从文档中提取文本...', () => taraApi.uploadExtract(file), async (data) => {
      setDocument(data);
      if (!projectName) setProjectName(data.metadata.filename.replace(/\.[^.]+$/, ''));

      let sourceText = data.extractedText;
      if (data.metadata.fileType === '.docx' && data.extractedHtml) {
        try {
          setBusy('AI 正在结构化文档内容...');
          const structured = await taraApi.structureDocx({
            extractedText: data.extractedText,
            extractedHtml: data.extractedHtml,
            filename: data.metadata.filename
          });
          setStructuredDocxJson(structured.structuredJson);
          sourceText = JSON.stringify(structured.structuredJson, null, 2);
        } catch {
          setStructuredDocxJson(null);
        }
      }

      await extractItemDefinition(sourceText, data.metadata.filename);
    });
  }

  async function extractItemDefinition(text: string, filename?: string) {
    await run(
      'AI 正在识别 Item Definition...',
      () => taraApi.extractItems({ extractedText: text, filename }),
      (data) => {
        setItemDefinition(data.systemDescription);
        setSystemDescription(data.systemDescription);
        setItems(data.items || []);
        setCurrentStep(2);
      }
    );
  }

  function useManualInput() {
    const text = manualItemDefinition.trim();
    if (text.length < 20) {
      setError('请上传文档，或手动输入至少 20 个字符的系统描述。');
      return;
    }
    setItemDefinition(text);
    setSystemDescription(text);
    setItems([]);
    setCurrentStep(2);
  }

  function handleGenerateAssets() {
    if (systemDescription.trim().length < 20) {
      setError('系统描述至少需要 20 个字符。');
      return;
    }
    run(
      '正在分析系统并识别资产...',
      () => taraApi.generateAssets({ projectName, systemDescription, optionalInfo }),
      (data) => {
        setAssets(data.assets || []);
        setCurrentStep(3);
      }
    );
  }

  function handleAnalyzeThreats() {
    run(
      '正在分析威胁和损害场景...',
      () => taraApi.analyzeThreats({ projectName, systemDescription: `${systemDescription}\n\n${threatContext}`.trim(), assets }),
      (data) => {
        setThreats(data.threats || []);
        setCurrentStep(4);
      }
    );
  }

  function handleGenerateAttackPaths() {
    run(
      '正在构建攻击路径...',
      () => taraApi.generateAttackPaths({ projectName, systemDescription, assets, threats }),
      (data) => {
        setAttackPaths(data.attackPaths || []);
        setCurrentStep(5);
      }
    );
  }

  function handleGenerateRiskTreatment() {
    run(
      '正在生成风险处置方案...',
      () => taraApi.generateRiskTreatment({ projectName, systemDescription, assets, threats, attackPaths }),
      (data) => {
        setRiskTreatments(data.riskTreatments || []);
        setShowExportModal(true);
      }
    );
  }

  function exportJson(key: JsonKey | 'full') {
    const payload =
      key === 'full'
        ? { projectName, generatedAt: new Date().toISOString(), itemDefinition, assets, threats, attackPaths, riskTreatments }
        : { projectName, [key]: { assets, threats, attackPaths, riskTreatments }[key] };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = window.document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(projectName || 'tara').replace(/[^a-zA-Z0-9_-]/g, '_')}_${key}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setToast('JSON 已导出');
  }

  function copyJson(key: JsonKey) {
    const payload = { projectName, [key]: { assets, threats, attackPaths, riskTreatments }[key] };
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
    setToast('JSON 已复制');
  }

  return (
    <div className="template-shell">
      <header className="header">
        <div className="header-left">
          <Shield size={34} className="logo-icon" />
          <h1 className="title">TARA 分析与风险处置工具</h1>
          <span className="badge">ISO/SAE 21434</span>
        </div>
        <div className="header-center">
          <span className="project-display-name">{projectName}</span>
        </div>
        <div className="header-right">
          <span className={`status-indicator ${health?.hasApiKey ? 'status-connected' : health ? 'status-error' : 'status-disconnected'}`} />
          <span className="status-text">
            {health?.hasApiKey ? `API 就绪 (${health.provider})` : health ? 'API Key 未设置' : '正在检查 API...'}
          </span>
        </div>
      </header>

      <nav className="workflow-nav">
        {steps.map((step, index) => (
          <div className="step-wrap" key={step.id}>
            <button
              className={`step-item ${currentStep === step.id ? 'active' : ''} ${stepDone(step.id) ? 'done' : ''}`}
              disabled={!canOpenStep(step.id)}
              onClick={() => setCurrentStep(step.id)}
              type="button"
            >
              <span className="step-number">{stepDone(step.id) ? <Check size={17} /> : step.id}</span>
              <span className="step-label">{step.label}</span>
            </button>
            {index < steps.length - 1 && <ChevronRight className="step-arrow" size={18} />}
          </div>
        ))}
      </nav>

      {error && (
        <div className="inline-alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
      )}

      <main className="main-container">
        {currentStep === 1 && (
          <StepPanel
            leftTitle="相关项定义"
            leftSubtitle="上传文档或手动输入，提取 Item Definition"
            rightTitle="提取结果"
            rightSubtitle={itemDefinition ? `已识别 ${items.length} 个相关项` : '等待提取...'}
            left={
              <>
                <Field label="项目名称">
                  <input className="form-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="例如：TBOX 远程控制系统" />
                </Field>
                <Field label="上传文档">
                  <label className="drop-zone">
                    <input
                      className="file-input-hidden"
                      type="file"
                      accept=".docx,.pdf,.txt,.json,.md,.csv"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleUpload(file);
                      }}
                    />
                    <span className="drop-zone-content">
                      <Upload size={38} />
                      <span className="drop-zone-text">
                        <strong>{document ? document.metadata.filename : '拖拽文件到此处或点击上传'}</strong>
                        <span className="drop-zone-hint">.docx .pdf .txt .json .md .csv - 最大 50MB</span>
                      </span>
                    </span>
                  </label>
                  {document && (
                    <div className="file-info">
                      <FolderOpen size={16} />
                      <span>{document.metadata.filename}</span>
                      <span>{formatFileSize(document.metadata.fileSize)}</span>
                    </div>
                  )}
                </Field>
                <BusyBlock busy={busy} match={['正在从文档中提取文本...', 'AI 正在结构化文档内容...', 'AI 正在识别 Item Definition...']} />
                <Field label="手动输入（可选）">
                  <textarea
                    className="form-textarea"
                    rows={6}
                    value={manualItemDefinition}
                    onChange={(event) => setManualItemDefinition(event.target.value)}
                    placeholder="如不上传文档，可在此手动输入系统描述..."
                  />
                </Field>
                <button className="btn-generate" type="button" onClick={useManualInput} disabled={Boolean(busy)}>
                  <FileSearch size={20} /> 提取相关项定义
                </button>
              </>
            }
            right={<Step1Result items={items} itemDefinition={itemDefinition} structuredDocxJson={structuredDocxJson} filename={document?.metadata.filename} />}
          />
        )}

        {currentStep === 2 && (
          <StepPanel
            leftTitle="资产识别"
            leftSubtitle="根据系统描述识别需要保护的安全资产"
            rightTitle="识别出的资产"
            rightSubtitle={assets.length ? `已识别 ${assets.length} 个资产` : '等待生成...'}
            left={
              <>
                <Field label="系统描述">
                  <textarea className="form-textarea" rows={11} value={systemDescription} onChange={(event) => setSystemDescription(event.target.value)} />
                  <div className="char-count">{systemDescription.length} 个字符</div>
                </Field>
                <Field label="补充信息（可选）">
                  <textarea className="form-textarea form-textarea--small" rows={4} value={optionalInfo} onChange={(event) => setOptionalInfo(event.target.value)} />
                </Field>
                <button className="btn-generate" type="button" onClick={handleGenerateAssets} disabled={Boolean(busy)}>
                  <Activity size={20} /> 生成资产清单
                </button>
                <BusyBlock busy={busy} match={['正在分析系统并识别资产...']} />
              </>
            }
            right={<AssetResults assets={assets} onExport={exportJson} onCopy={copyJson} />}
          />
        )}

        {currentStep === 3 && (
          <StepPanel
            leftTitle="威胁分析"
            leftSubtitle="使用 STRIDE 模型分析每个资产面临的威胁"
            rightTitle="威胁与损害场景"
            rightSubtitle={threats.length ? `已识别 ${threats.length} 个威胁` : '等待分析...'}
            left={
              <>
                <ContextSummary title={`已识别 ${assets.length} 个资产`} lines={assets.slice(0, 8).map((asset) => `${asset.assetName} (${asset.assetType})`)} />
                <Field label="补充威胁情报（可选）">
                  <textarea className="form-textarea form-textarea--small" rows={3} value={threatContext} onChange={(event) => setThreatContext(event.target.value)} />
                </Field>
                <button className="btn-generate" type="button" onClick={handleAnalyzeThreats} disabled={Boolean(busy) || assets.length === 0}>
                  <AlertTriangle size={20} /> 分析威胁场景
                </button>
                <BusyBlock busy={busy} match={['正在分析威胁和损害场景...']} />
              </>
            }
            right={<ThreatResults threats={threats} onExport={exportJson} onCopy={copyJson} />}
          />
        )}

        {currentStep === 4 && (
          <StepPanel
            leftTitle="攻击路径分析"
            leftSubtitle="从攻击者视角分析如何实现威胁"
            rightTitle="攻击路径"
            rightSubtitle={attackPaths.length ? `已生成 ${attackPaths.length} 条攻击路径` : '等待生成...'}
            left={
              <>
                <ContextSummary title={`已识别 ${threats.length} 个威胁`} lines={threats.slice(0, 8).map((threat) => `${threat.threatId} ${threat.threatName} [${threat.strideCategory}]`)} />
                <button className="btn-generate" type="button" onClick={handleGenerateAttackPaths} disabled={Boolean(busy) || threats.length === 0}>
                  <Target size={20} /> 生成攻击路径
                </button>
                <BusyBlock busy={busy} match={['正在构建攻击路径...']} />
              </>
            }
            right={<AttackPathResults attackPaths={attackPaths} onExport={exportJson} onCopy={copyJson} />}
          />
        )}

        {currentStep === 5 && (
          <StepPanel
            leftTitle="风险处置声明"
            leftSubtitle="制定安全控制措施与处置决策"
            rightTitle="风险处置方案"
            rightSubtitle={riskTreatments.length ? `已生成 ${riskTreatments.length} 条处置方案` : '等待生成...'}
            left={
              <>
                <ContextSummary title={`已生成 ${attackPaths.length} 条攻击路径`} lines={attackPaths.slice(0, 8).map((path) => `${path.attackPathId} ${path.attackPathName} [${path.attackFeasibility}]`)} />
                <button className="btn-generate" type="button" onClick={handleGenerateRiskTreatment} disabled={Boolean(busy) || attackPaths.length === 0}>
                  <ShieldCheck size={20} /> 生成处置方案
                </button>
                <BusyBlock busy={busy} match={['正在生成风险处置方案...']} />
              </>
            }
            right={<RiskTreatmentResults riskTreatments={riskTreatments} onExport={exportJson} onCopy={copyJson} />}
          />
        )}
      </main>

      {showExportModal && (
        <div className="modal">
          <button className="modal-overlay" type="button" onClick={() => setShowExportModal(false)} aria-label="关闭" />
          <div className="modal-content">
            <h3>导出完整 TARA 报告</h3>
            <p>将包含所有 5 个步骤的分析结果。</p>
            <div className="modal-actions">
              <button className="btn-export" type="button" onClick={() => exportJson('full')}>
                <Download size={16} /> 导出 JSON
              </button>
              <button className="btn-export btn-export--secondary" type="button" onClick={() => setShowExportModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast toast--visible">{toast}</div>}
    </div>
  );
}

function StepPanel({ leftTitle, leftSubtitle, rightTitle, rightSubtitle, left, right }: {
  leftTitle: string;
  leftSubtitle: string;
  rightTitle: string;
  rightSubtitle: string;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <section className="step-panel active">
      <div className="panel-left">
        <PanelHeader title={leftTitle} subtitle={leftSubtitle} />
        <div className="panel-body">{left}</div>
      </div>
      <div className="panel-right">
        <PanelHeader title={rightTitle} subtitle={rightSubtitle} />
        <div className="panel-body panel-body-results">{right}</div>
      </div>
    </section>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel-header">
      <h2 className="panel-title">{title}</h2>
      <span className="panel-subtitle">{subtitle}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function BusyBlock({ busy, match }: { busy: string; match: string[] }) {
  if (!busy || !match.includes(busy)) return null;
  return (
    <div className="loading-area">
      <Loader2 className="spinner-icon" size={34} />
      <p className="loading-text">{busy}</p>
    </div>
  );
}

function ContextSummary({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="context-summary">
      <strong>{title}</strong>
      {lines.map((line) => (
        <span key={line}>- {line}</span>
      ))}
    </div>
  );
}

function Step1Result({ items, itemDefinition, structuredDocxJson, filename }: { items: ItemDefinition[]; itemDefinition: string; structuredDocxJson: unknown; filename?: string }) {
  if (!itemDefinition && !structuredDocxJson) {
    return <Placeholder icon={<FileSearch size={62} />} text="上传文档后，AI 将自动识别相关项并整理系统描述。" />;
  }
  return (
    <div className="result-list">
      {structuredDocxJson !== null && (
        <div className="result-card">
          <div className="result-card-header">
            <span className="result-card-title">
              <FileJson size={17} /> 结构化 JSON
            </span>
            <span className="result-card-badge badge-asset">{filename || 'document'}</span>
          </div>
          <pre className="structured-json-block">{truncate(JSON.stringify(structuredDocxJson, null, 2), 5000)}</pre>
        </div>
      )}
      {items.length > 0 && (
        <div className="item-def-list">
          <div className="item-def-list-header">
            <span className="item-def-list-title">相关项列表</span>
            <span className="item-def-list-count">{items.length} 个相关项</span>
          </div>
          {items.map((item) => (
            <div className="item-def-card" key={item.itemId}>
              <div className="item-def-card-header">
                <span className="item-def-card-id">{item.itemId}</span>
                <span className="item-def-card-name">{item.itemName}</span>
              </div>
              <div className="item-def-card-desc">{item.description}</div>
              {item.functions.length > 0 && (
                <div className="item-def-functions">
                  <div className="item-def-functions-title">子功能 ({item.functions.length})</div>
                  {item.functions.map((fn) => (
                    <div className="item-def-function-item" key={`${item.itemId}-${fn.functionId}`}>
                      <span className="item-def-function-id">{fn.functionId}</span>
                      <span className="item-def-function-name">{fn.functionName}</span>
                      <span className="item-def-function-desc">{fn.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {itemDefinition && (
        <details className="item-def-summary" open>
          <summary className="item-def-summary-header">
            <span>系统描述摘要</span>
            <span className="item-def-summary-hint">自动填入步骤2</span>
          </summary>
          <div className="item-def-summary-text">{truncate(itemDefinition, 3000)}</div>
        </details>
      )}
    </div>
  );
}

function AssetResults({ assets, onExport, onCopy }: { assets: Asset[]; onExport: (key: JsonKey) => void; onCopy: (key: JsonKey) => void }) {
  if (!assets.length) return <Placeholder icon={<Shield size={62} />} text="点击生成资产清单，AI 将识别所有需要保护的安全资产。" />;
  return (
    <>
      <SummaryBar items={[['资产总数', assets.length], ['资产类型', new Set(assets.map((asset) => asset.assetType)).size]]} />
      <div className="result-list">
        {assets.map((asset) => (
          <div className="result-card" key={asset.assetName}>
            <div className="result-card-header">
              <span className="result-card-title">{asset.assetName}</span>
              <span className="result-card-badge badge-asset">{asset.assetType}</span>
            </div>
            <div className="result-card-desc">{asset.description}</div>
            <div className="result-card-meta"><strong>保护价值：</strong>{asset.valueRationale}</div>
            {asset.damageScenarios.length > 0 && (
              <div className="damage-scenarios">
                <div className="damage-scenarios-title">损害场景 ({asset.damageScenarios.length})</div>
                {asset.damageScenarios.map((scenario) => (
                  <div className="damage-scenario-item" key={scenario.scenarioName}>
                    <div className="damage-scenario-header">
                      <span className="damage-scenario-name">{scenario.scenarioName}</span>
                      <SeverityBadge value={scenario.severity} />
                      <span className="result-card-badge badge-stride">{scenario.affectedProperty}</span>
                    </div>
                    <div className="damage-scenario-desc">{scenario.description}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="security-props">
              {Object.entries({
                confidentiality: '机密性',
                integrity: '完整性',
                availability: '可用性',
                authenticity: '真实性'
              }).map(([key, label]) => {
                const enabled = asset.securityProperties[key as keyof Asset['securityProperties']];
                return <span className={`security-prop security-prop--${enabled}`} key={key}>{label} {enabled ? '✓' : '-'}</span>;
              })}
            </div>
          </div>
        ))}
      </div>
      <ExportBar jsonKey="assets" onExport={onExport} onCopy={onCopy} />
    </>
  );
}

function ThreatResults({ threats, onExport, onCopy }: { threats: Threat[]; onExport: (key: JsonKey) => void; onCopy: (key: JsonKey) => void }) {
  if (!threats.length) return <Placeholder icon={<AlertTriangle size={62} />} text="完成资产识别后，AI 将使用 STRIDE 模型进行威胁分析。" />;
  return (
    <>
      <SummaryBar items={[['威胁总数', threats.length], ['STRIDE 类别', new Set(threats.map((threat) => threat.strideCategory)).size]]} />
      <div className="result-list">
        {threats.map((threat) => (
          <div className="result-card" key={threat.threatId}>
            <div className="result-card-header">
              <span className="result-card-title">{threat.threatId} - {threat.threatName}</span>
              <div className="badge-row">
                <span className="result-card-badge badge-stride">{threat.strideCategory}</span>
                <SeverityBadge value={threat.threatSeverity} />
              </div>
            </div>
            <div className="result-card-desc">{threat.description}</div>
            <div className="result-card-meta"><strong>目标资产：</strong>{threat.targetAsset}</div>
            <div className="result-card-meta"><strong>损害场景：</strong>{threat.damageScenario}</div>
            <div className="result-card-meta"><strong>受影响属性：</strong>{threat.affectedSecurityProperty}</div>
          </div>
        ))}
      </div>
      <ExportBar jsonKey="threats" onExport={onExport} onCopy={onCopy} />
    </>
  );
}

function AttackPathResults({ attackPaths, onExport, onCopy }: { attackPaths: AttackPath[]; onExport: (key: JsonKey) => void; onCopy: (key: JsonKey) => void }) {
  if (!attackPaths.length) return <Placeholder icon={<Map size={62} />} text="完成威胁分析后，AI 将构建从攻击入口到目标资产的攻击链。" />;
  return (
    <>
      <SummaryBar items={[['攻击路径', attackPaths.length]]} />
      <div className="result-list">
        {attackPaths.map((path) => (
          <div className="result-card" key={path.attackPathId}>
            <div className="result-card-header">
              <span className="result-card-title">{path.attackPathId} - {path.attackPathName}</span>
              <div className="badge-row">
                <span className="result-card-badge badge-feasibility">可行性: {path.attackFeasibility}</span>
                <SeverityBadge value={path.impactLevel} labelPrefix="影响: " />
              </div>
            </div>
            <div className="result-card-meta"><strong>攻击入口：</strong>{path.entryPoint}</div>
            <div className="result-card-meta"><strong>关联威胁：</strong>{path.relatedThreats.join(', ') || '-'}</div>
            <div className="attack-steps">
              {path.attackSteps.map((step, index) => (
                <div className="attack-step" key={`${path.attackPathId}-${index}`}>
                  <span className="attack-step-num">{index + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
            <div className="result-card-meta"><strong>所需能力：</strong>{path.requiredCapability}</div>
          </div>
        ))}
      </div>
      <ExportBar jsonKey="attackPaths" onExport={onExport} onCopy={onCopy} />
    </>
  );
}

function RiskTreatmentResults({ riskTreatments, onExport, onCopy }: { riskTreatments: RiskTreatment[]; onExport: (key: JsonKey) => void; onCopy: (key: JsonKey) => void }) {
  if (!riskTreatments.length) return <Placeholder icon={<ShieldCheck size={62} />} text="完成攻击路径分析后，AI 将制定风险处置措施。" />;
  return (
    <>
      <SummaryBar items={[['处置方案', riskTreatments.length]]} />
      <div className="result-list">
        {riskTreatments.map((treatment) => (
          <div className="result-card" key={treatment.treatmentId}>
            <div className="result-card-header">
              <span className="result-card-title">{treatment.treatmentId} - {treatment.controlName}</span>
              <div className="badge-row">
                <span className={`result-card-badge badge-decision-${treatment.treatmentDecision.toLowerCase()}`}>{treatment.treatmentDecision}</span>
                <span className="result-card-badge badge-control">{treatment.controlType}</span>
              </div>
            </div>
            <div className="result-card-desc">{treatment.controlDescription}</div>
            <div className="result-card-meta"><strong>关联攻击路径：</strong>{treatment.relatedAttackPath}</div>
            <div className="result-card-meta"><strong>实施优先级：</strong>{treatment.implementationPriority} | <strong>残余风险：</strong>{treatment.residualRisk}</div>
            <div className="result-card-meta"><strong>验证方法：</strong>{treatment.verificationMethod}</div>
          </div>
        ))}
      </div>
      <ExportBar jsonKey="riskTreatments" onExport={onExport} onCopy={onCopy} />
    </>
  );
}

function SummaryBar({ items }: { items: Array<[string, number]> }) {
  return (
    <div className="summary-bar">
      {items.map(([label, value], index) => (
        <div className="summary-fragment" key={label}>
          {index > 0 && <div className="summary-divider" />}
          <div className="summary-item">
            <span className="summary-value">{value}</span>
            <span className="summary-label">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExportBar({ jsonKey, onExport, onCopy }: { jsonKey: JsonKey; onExport: (key: JsonKey) => void; onCopy: (key: JsonKey) => void }) {
  return (
    <div className="export-bar">
      <button className="btn-export" type="button" onClick={() => onExport(jsonKey)}>
        <Download size={16} /> 导出 JSON
      </button>
      <button className="btn-export btn-export--secondary" type="button" onClick={() => onCopy(jsonKey)}>
        <Copy size={16} /> 复制 JSON
      </button>
    </div>
  );
}

function SeverityBadge({ value, labelPrefix = '' }: { value: string; labelPrefix?: string }) {
  return <span className={`result-card-badge badge-severity-${(value || 'Medium').toLowerCase()}`}>{labelPrefix}{value || 'Medium'}</span>;
}

function Placeholder({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="placeholder-block">
      <span className="placeholder-icon">{icon}</span>
      <p>{text}</p>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n... 内容已截断`;
}
