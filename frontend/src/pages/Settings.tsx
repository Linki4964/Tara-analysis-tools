import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  Plus,
  Save,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { taraApi } from '../api/taraApi';
import type { ApiProvider, Health, ProviderSpec, SavedConfig } from '../types/tara';

// Fallback catalog used until GET /api/providers responds (or if it fails).
// Mirrors tara_core/providers.py so the page still renders sensibly offline.
const FALLBACK_PROVIDERS: ProviderSpec[] = [
  { name: 'anthropic', label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-4-6', defaultBaseUrl: 'https://api.anthropic.com', requiresKey: true, allowsCustomBaseUrl: true, apiStyle: 'anthropic' },
  { name: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o', defaultBaseUrl: 'https://api.openai.com/v1', requiresKey: true, allowsCustomBaseUrl: true, apiStyle: 'openai' },
  { name: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-flash', defaultBaseUrl: 'https://api.deepseek.com', requiresKey: true, allowsCustomBaseUrl: true, apiStyle: 'openai' },
  { name: 'local', label: '本地模型 (Ollama/LM Studio/vLLM)', defaultModel: 'llama3', defaultBaseUrl: 'http://localhost:11434/v1', requiresKey: false, allowsCustomBaseUrl: true, apiStyle: 'openai' },
];

const SHORT_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  local: '本地',
};

/**
 * Guess the provider from an API key prefix.
 *
 * Only Anthropic (sk-ant-) is unambiguous; OpenAI and DeepSeek both issue
 * "sk-" keys, so an unrecognised key returns null and the user must choose.
 */
function detectProvider(key: string): Exclude<ApiProvider, 'auto'> | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('sk-ant-')) return 'anthropic';
  if (trimmed.startsWith('sk-proj-')) return 'openai';
  return null;
}

export default function Settings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [providers, setProviders] = useState<ProviderSpec[]>(FALLBACK_PROVIDERS);
  const [settingsProvider, setSettingsProvider] = useState<ApiProvider>('auto');
  const [settingsApiKey, setSettingsApiKey] = useState('');
  const [settingsModel, setSettingsModel] = useState('');
  const [settingsBaseUrl, setSettingsBaseUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsTesting, setSettingsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  // True while the field holds the masked key returned by the server, so we
  // don't post the mask back as if it were a new key.
  const [keyIsMasked, setKeyIsMasked] = useState(false);

  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const providerMap = useMemo(() => {
    const map: Record<string, ProviderSpec> = {};
    providers.forEach((p) => { map[p.name] = p; });
    return map;
  }, [providers]);

  const detected = detectProvider(settingsApiKey);
  const effectiveProvider: Exclude<ApiProvider, 'auto'> =
    settingsProvider === 'auto' ? (detected ?? 'deepseek') : settingsProvider;
  const spec = providerMap[effectiveProvider];
  const needsKey = spec?.requiresKey ?? true;
  // A key must be supplied unless the provider is keyless or we're holding the
  // server's masked value (meaning a real key is already stored).
  const keySatisfied = !needsKey || Boolean(settingsApiKey.trim()) || keyIsMasked;

  useEffect(() => {
    taraApi
      .health()
      .then(setHealth)
      .catch(() => setHealth({ status: 'error', provider: 'none', model: null, hasApiKey: false }));
    taraApi
      .listProviders()
      .then((res) => { if (res.providers?.length) setProviders(res.providers); })
      .catch(() => {});
    taraApi.getConfig().then((res) => {
      const cfg = res.config;
      if (cfg && cfg.provider) {
        setSettingsProvider(cfg.provider);
        setSettingsApiKey(cfg.api_key || '');
        // A masked key from the server is a placeholder, not a real value.
        setKeyIsMasked(Boolean(cfg.api_key && cfg.api_key.includes('*')));
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

  useEffect(() => {
    setTestResult(null);
  }, [settingsProvider, settingsApiKey, settingsModel, settingsBaseUrl]);

  function loadSavedConfigs() {
    taraApi.listConfigs().then((res) => setSavedConfigs(res.saved || [])).catch(() => {});
  }

  async function saveSettings() {
    setSettingsSaving(true);
    setError('');
    try {
      const res = await taraApi.setConfig({
        provider: effectiveProvider,
        // Send the masked value through unchanged: the server recognises it as
        // "keep the stored key" rather than overwriting it.
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

  async function testConnection() {
    setSettingsTesting(true);
    setError('');
    setTestResult(null);
    try {
      const res = await taraApi.testConfig({
        provider: effectiveProvider,
        api_key: settingsApiKey,
        model: settingsModel || undefined,
        base_url: settingsBaseUrl || undefined,
      });
      setTestResult({ ok: true, message: `连接成功 · ${res.model} · ${res.latencyMs} ms` });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : '连接失败' });
    } finally {
      setSettingsTesting(false);
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
      setKeyIsMasked(false);
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
          <span className="page-subtitle">配置模型服务</span>
        </div>
        <div className="page-header-right">
          <span className={`status-indicator ${health?.hasApiKey ? 'status-connected' : health ? 'status-error' : 'status-disconnected'}`} />
          <span className="status-text">
            {health?.hasApiKey ? `${SHORT_LABELS[health.provider] || providerMap[health.provider]?.label || health.provider} · 已配置` : health ? '未配置' : '加载中'}
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
              <label className="form-label">服务商</label>
              <div className="provider-auto-detect">
                <div className={`auto-detect-result ${settingsApiKey.trim() || keyIsMasked ? 'auto-detect-result--found' : ''}`}>
                  <span className={`auto-detect-dot ${settingsApiKey.trim() || keyIsMasked ? 'auto-detect-dot--active' : ''}`} />
                  <span className="auto-detect-label">
                    {settingsProvider === 'auto'
                      ? detected
                        ? `已识别: ${providerMap[detected]?.label ?? detected}`
                        : keyIsMasked
                          ? '使用已保存的密钥'
                          : '请选择服务商'
                      : `手动选择: ${providerMap[settingsProvider]?.label ?? settingsProvider}`}
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
                  {providers.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className={`provider-tab provider-tab--small ${settingsProvider === p.name ? 'provider-tab--active' : ''}`}
                      onClick={() => setSettingsProvider(p.name)}
                    >
                      {SHORT_LABELS[p.name] ?? p.name}
                    </button>
                  ))}
                </div>
              </div>
              {settingsProvider === 'auto' && !detected && !keyIsMasked && settingsApiKey.trim() && (
                <div className="settings-hint settings-hint--warn">
                  <Shield size={14} />
                  <span>OpenAI 与 DeepSeek 的 Key 都以 <code>sk-</code> 开头，无法通过前缀区分。请在上方手动选择提供商。</span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">API Key</label>
              <div className="input-with-icon">
                <input
                  className="form-input"
                  type={showApiKey ? 'text' : 'password'}
                  value={settingsApiKey}
                  onChange={(event) => {
                    setSettingsApiKey(event.target.value);
                    setKeyIsMasked(false);
                  }}
                  placeholder={
                    needsKey ? '输入你的 API Key' : '本地模型可留空 (默认 ollama)'
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
              {keyIsMasked && <div className="form-caption"><Shield size={13} />密钥已安全保存，输入新值可替换</div>}
            </div>

            <div className="form-group">
              <label className="form-label">模型名称</label>
              <input
                className="form-input"
                value={settingsModel}
                onChange={(event) => setSettingsModel(event.target.value)}
                placeholder={spec?.defaultModel ?? ''}
              />
            </div>

            {spec?.allowsCustomBaseUrl !== false && (
              <div className="form-group">
                <label className="form-label">API 地址</label>
                <input
                  className="form-input"
                  value={settingsBaseUrl}
                  onChange={(event) => setSettingsBaseUrl(event.target.value)}
                  placeholder={spec?.defaultBaseUrl ?? ''}
                />
                <div className="form-caption">留空使用默认地址 {spec?.defaultBaseUrl}</div>
              </div>
            )}

            {testResult && (
              <div className={`connection-result ${testResult.ok ? 'connection-result--success' : 'connection-result--error'}`} role="status">
                {testResult.ok ? <Check size={16} /> : <X size={16} />}
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="settings-actions">
              <button
                className="btn-export btn-export--secondary"
                type="button"
                onClick={testConnection}
                disabled={settingsSaving || settingsTesting || !keySatisfied}
              >
                {settingsTesting ? <Loader2 className="spinner-icon" size={16} /> : <PlugZap size={16} />}
                {settingsTesting ? '测试中' : '测试连接'}
              </button>
              <button
                className="btn-export"
                type="button"
                onClick={saveSettings}
                disabled={settingsSaving || !keySatisfied}
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
