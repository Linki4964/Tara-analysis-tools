import { useEffect, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { taraApi } from '../api/taraApi';
import type { ApiProvider, Health, SavedConfig } from '../types/tara';

function detectProvider(key: string): { provider: ApiProvider; label: string } {
  const trimmed = key.trim();
  if (!trimmed) {
    return { provider: 'local', label: '未输入 Key — 将使用本地模型' };
  }
  if (trimmed.startsWith('sk-ant-')) {
    return { provider: 'anthropic', label: '已识别: Anthropic (Claude)' };
  }
  if (trimmed.startsWith('sk-')) {
    return { provider: 'deepseek', label: '已识别: OpenAI 兼容 (DeepSeek 等)' };
  }
  return { provider: 'deepseek', label: '已识别: OpenAI 兼容格式' };
}

const PROVIDER_LABELS: Record<ApiProvider, string> = {
  auto: '自动检测',
  anthropic: 'Anthropic (Claude)',
  deepseek: 'DeepSeek',
  local: '本地模型 (Ollama/vLLM)',
};

const PROVIDER_SHORT: Record<ApiProvider, string> = {
  auto: '自动',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  local: '本地',
};

export default function Settings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [settingsProvider, setSettingsProvider] = useState<ApiProvider>('auto');
  const [settingsApiKey, setSettingsApiKey] = useState('');
  const [settingsModel, setSettingsModel] = useState('');
  const [settingsBaseUrl, setSettingsBaseUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const detected = detectProvider(settingsApiKey);
  const effectiveProvider: ApiProvider = settingsProvider === 'auto' ? detected.provider : settingsProvider;

  useEffect(() => {
    taraApi
      .health()
      .then(setHealth)
      .catch(() => setHealth({ status: 'error', provider: 'none', model: null, hasApiKey: false }));
    taraApi.getConfig().then((res) => {
      const cfg = res.config;
      if (cfg && cfg.provider) {
        setSettingsProvider(cfg.provider);
        setSettingsApiKey(cfg.api_key || '');
        setSettingsModel(cfg.model || '');
        setSettingsBaseUrl(cfg.base_url || '');
      }
    }).catch(() => {});
    loadSavedConfigs();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function loadSavedConfigs() {
    taraApi.listConfigs().then((res) => setSavedConfigs(res.saved || [])).catch(() => {});
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setError('');
    try {
      const res = await taraApi.setConfig({
        provider: effectiveProvider,
        api_key: settingsApiKey,
        model: settingsModel || undefined,
        base_url: settingsBaseUrl || undefined,
      });
      setHealth({ status: 'ok', provider: res.provider, model: res.model, hasApiKey: res.hasApiKey });
      setToast('API 配置已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存配置失败');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function clearSettings() {
    setSettingsSaving(true);
    setError('');
    try {
      const res = await taraApi.deleteConfig();
      setHealth({ status: 'ok', provider: res.provider, model: res.model, hasApiKey: res.hasApiKey });
      setSettingsApiKey('');
      setSettingsModel('');
      setSettingsBaseUrl('');
      setToast('API 配置已清除，恢复使用 .env 设置');
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除配置失败');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function switchToConfig(name: string) {
    setError('');
    try {
      const res = await taraApi.activateConfig(name);
      setHealth({ status: 'ok', provider: res.provider, model: res.model, hasApiKey: res.hasApiKey });
      setToast(`已切换到: ${name}`);
      loadSavedConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败');
    }
  }

  async function handleSaveCurrentConfig() {
    const name = saveName.trim();
    if (!name) return;
    setError('');
    try {
      await taraApi.saveConfig(name);
      setSaveName('');
      setShowSaveInput(false);
      setToast(`已保存配置: ${name}`);
      loadSavedConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  }

  async function handleDeleteConfig(name: string) {
    setError('');
    try {
      await taraApi.deleteSavedConfig(name);
      setToast(`已删除: ${name}`);
      loadSavedConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }

  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">设置</h1>
          <span className="page-subtitle">配置 AI 模型提供商与运行参数</span>
        </div>
        <div className="page-header-right">
          <span className={`status-indicator ${health?.hasApiKey ? 'status-connected' : health ? 'status-error' : 'status-disconnected'}`} />
          <span className="status-text">
            {health?.hasApiKey ? `${PROVIDER_SHORT[health.provider as ApiProvider] || health.provider} · ${health.model || ''}` : health ? '未设置' : '检查中...'}
          </span>
        </div>
      </header>

      <main className="page-body page-body--settings">
        {error && (
          <div className="inline-alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}>×</button>
          </div>
        )}

        <section className="settings-card">
          <div className="settings-card-head">
            <h2 className="dash-section-title"><SettingsIcon size={18} /> 模型与 API 配置</h2>
          </div>

          <div className="settings-body">
            <div className="form-group">
              <label className="form-label">模型提供商</label>
              <div className="provider-auto-detect">
                <div className={`auto-detect-result ${settingsApiKey.trim() ? 'auto-detect-result--found' : ''}`}>
                  <span className={`auto-detect-dot ${settingsApiKey.trim() ? 'auto-detect-dot--active' : ''}`} />
                  <span className="auto-detect-label">
                    {settingsProvider === 'auto' ? detected.label : `手动选择: ${PROVIDER_LABELS[settingsProvider]}`}
                  </span>
                </div>
                <div className="provider-tabs provider-tabs--compact">
                  <button
                    type="button"
                    className={`provider-tab provider-tab--small ${settingsProvider === 'auto' ? 'provider-tab--active' : ''}`}
                    onClick={() => setSettingsProvider('auto')}
                  >
                    自动
                  </button>
                  {(['anthropic', 'deepseek', 'local'] as ApiProvider[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`provider-tab provider-tab--small ${settingsProvider === value ? 'provider-tab--active' : ''}`}
                      onClick={() => setSettingsProvider(value)}
                    >
                      {PROVIDER_SHORT[value]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">API Key</label>
              <div className="input-with-icon">
                <input
                  className="form-input"
                  type={showApiKey ? 'text' : 'password'}
                  value={settingsApiKey}
                  onChange={(event) => setSettingsApiKey(event.target.value)}
                  placeholder={
                    effectiveProvider === 'local'
                      ? '本地模型可留空 (默认 ollama)'
                      : '输入你的 API Key'
                  }
                />
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowApiKey(!showApiKey)}
                  aria-label={showApiKey ? '隐藏' : '显示'}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">模型名称</label>
              <input
                className="form-input"
                value={settingsModel}
                onChange={(event) => setSettingsModel(event.target.value)}
                placeholder={
                  effectiveProvider === 'anthropic'
                    ? 'claude-sonnet-4-20250514'
                    : effectiveProvider === 'deepseek'
                      ? 'deepseek-chat'
                      : 'llama3'
                }
              />
            </div>

            {effectiveProvider !== 'anthropic' && (
              <div className="form-group">
                <label className="form-label">Base URL</label>
                <input
                  className="form-input"
                  value={settingsBaseUrl}
                  onChange={(event) => setSettingsBaseUrl(event.target.value)}
                  placeholder={
                    effectiveProvider === 'deepseek'
                      ? 'https://api.deepseek.com'
                      : 'http://localhost:11434/v1'
                  }
                />
              </div>
            )}

            {settingsProvider === 'local' && (
              <div className="settings-hint">
                <Shield size={14} />
                <span>本地模型使用 OpenAI 兼容 API（支持 Ollama、LM Studio、vLLM 等）。</span>
              </div>
            )}

            <div className="settings-actions">
              <button
                className="btn-export"
                type="button"
                onClick={saveSettings}
                disabled={settingsSaving || (!settingsApiKey && settingsProvider !== 'local')}
              >
                {settingsSaving ? <Loader2 className="spinner-icon" size={16} /> : <Save size={16} />}
                保存配置
              </button>
              <button
                className="btn-export btn-export--secondary"
                type="button"
                onClick={clearSettings}
                disabled={settingsSaving}
              >
                <Trash2 size={16} /> 清除配置
              </button>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <h2 className="dash-section-title"><Check size={18} /> 已保存的配置</h2>
            <span className="settings-card-hint">保存多组 API 配置，随时一键切换</span>
          </div>

          {savedConfigs.length === 0 && (
            <div className="key-switcher-empty">暂无已保存的配置 — 配置好上方参数后保存当前配置</div>
          )}

          {savedConfigs.map((cfg) => (
            <div
              key={cfg.name}
              className={`key-switcher-item ${cfg.active ? 'key-switcher-item--active' : ''}`}
            >
              <button
                type="button"
                className="key-switcher-item-main"
                onClick={() => switchToConfig(cfg.name)}
              >
                <span className={`key-switcher-dot ${cfg.active ? 'key-switcher-dot--active' : ''}`} />
                <span className="key-switcher-item-name">{cfg.name}</span>
                <span className="key-switcher-item-provider">{cfg.provider}</span>
                <span className="key-switcher-item-key">{cfg.api_key || '(无 key)'}</span>
              </button>
              <button
                type="button"
                className="key-switcher-item-delete"
                onClick={(e) => { e.stopPropagation(); handleDeleteConfig(cfg.name); }}
                aria-label={`删除 ${cfg.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}

          <div className="settings-save-row">
            {showSaveInput ? (
              <>
                <input
                  className="form-input key-switcher-save-input"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="输入名称..."
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCurrentConfig(); }}
                />
                <button className="btn-export btn-export--small" type="button" onClick={handleSaveCurrentConfig}>
                  <Check size={14} />
                </button>
                <button className="btn-export btn-export--secondary btn-export--small" type="button" onClick={() => setShowSaveInput(false)}>
                  <X size={14} />
                </button>
              </>
            ) : (
              <button
                className="key-switcher-save-btn"
                type="button"
                onClick={() => setShowSaveInput(true)}
                disabled={!health?.hasApiKey}
              >
                <Plus size={14} /> 保存当前配置
              </button>
            )}
          </div>
        </section>
      </main>

      {toast && <div className="toast toast--visible">{toast}</div>}
    </div>
  );
}
