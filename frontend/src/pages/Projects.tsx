import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Download,
  Eye,
  FileText,
  History,
  Loader2,
  Plus,
  Settings,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { taraApi } from '../api/taraApi';
import type { Asset, AttackPath, RiskTreatment, RunDetail, RunSummary, Threat } from '../types/tara';

type ProjectEntry = {
  id: string;                     // primary (most recent) run id
  projectNo: string;              // PRJ-XXXXXXXX derived from run id
  projectName: string;
  documentFilename: string | null;
  status: string;                 // 'completed' | 'draft'
  createdAt: string;              // earliest run creation time
  completedAt: string | null;     // latest completion time (if any completed run)
  stepCount: number;
  runCount: number;               // runs sharing this project name
};

function groupProjects(runs: RunSummary[]): ProjectEntry[] {
  const groups = new Map<string, {
    entry: RunSummary;
    count: number;
    createdAt: string;
    completedAt: string | null;
  }>();

  for (const run of runs) {
    const key = run.project_name || '(未命名)';
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        entry: run,
        count: 1,
        createdAt: run.created_at,
        completedAt: run.status === 'completed' ? run.updated_at : null,
      });
    } else {
      existing.count += 1;
      if (run.created_at < existing.createdAt) existing.createdAt = run.created_at;
      if (run.status === 'completed' && (!existing.completedAt || run.updated_at > existing.completedAt)) {
        existing.completedAt = run.updated_at;
      }
    }
  }

  return [...groups.values()].map((g) => ({
    id: g.entry.id,
    projectNo: `PRJ-${g.entry.id.slice(0, 8).toUpperCase()}`,
    projectName: g.entry.project_name || '(未命名)',
    documentFilename: g.entry.document_filename,
    status: g.completedAt ? 'completed' : 'draft',
    createdAt: g.createdAt,
    completedAt: g.completedAt,
    stepCount: g.entry.step_count || 0,
    runCount: g.count,
  }));
}

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState<{ id: string; action: string } | null>(null);

  const [editing, setEditing] = useState<ProjectEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [editDocument, setEditDocument] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function loadProjects() {
    setLoading(true);
    taraApi
      .listRuns()
      .then((res) => setProjects(groupProjects(res.runs || [])))
      .catch(() => setError('加载项目列表失败'))
      .finally(() => setLoading(false));
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const completedCount = projects.filter((p) => p.status === 'completed').length;

  function handleView(proj: ProjectEntry) {
    navigate('/workspace', { state: { loadRunId: proj.id } });
  }

  function downloadJsonReport(run: RunDetail, proj: ProjectEntry) {
    const payload = {
      projectNo: proj.projectNo,
      projectName: proj.projectName,
      generatedAt: new Date().toISOString(),
      run,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = window.document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(proj.projectName || 'project').replace(/[^a-zA-Z0-9_-]/g, '_')}_report.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function handleDownloadReport(proj: ProjectEntry) {
    setBusy({ id: proj.id, action: 'download' });
    setError('');
    try {
      const res = await taraApi.getRun(proj.id);
      const run = res.run;
      const byStep = new Map(run.steps.map((s) => [s.step_number, s.result_data]));
      const assets = (byStep.get(2)?.assets as Asset[]) || [];
      const threats = (byStep.get(3)?.threats as Threat[]) || [];
      const attackPaths = (byStep.get(4)?.attackPaths as AttackPath[]) || [];
      const riskTreatments = (byStep.get(5)?.riskTreatments as RiskTreatment[]) || [];

      let exported = false;
      if (assets.length || threats.length || attackPaths.length || riskTreatments.length) {
        try {
          await taraApi.exportExcel({
            projectName: proj.projectName,
            assets,
            threats,
            attackPaths,
            riskTreatments,
          });
          exported = true;
          setToast('Excel 报告已导出');
        } catch {
          // fall through to JSON report
        }
      }
      if (!exported) {
        downloadJsonReport(run, proj);
        setToast('完整报告已导出 (JSON)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载报告失败');
    } finally {
      setBusy(null);
    }
  }

  function openConfigure(proj: ProjectEntry) {
    setEditing(proj);
    setEditName(proj.projectName === '(未命名)' ? '' : proj.projectName);
    setEditDocument(proj.documentFilename || '');
    setError('');
  }

  async function saveConfigure() {
    if (!editing) return;
    const name = editName.trim();
    if (!name) {
      setError('项目名称不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (name !== editing.projectName) {
        await taraApi.renameProject(editing.projectName, name);
      }
      if (editDocument.trim() !== (editing.documentFilename || '')) {
        await taraApi.updateRun(editing.id, { documentFilename: editDocument.trim() || null });
      }
      setToast('项目信息已保存');
      setEditing(null);
      loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(proj: ProjectEntry) {
    const message =
      proj.runCount > 1
        ? `确定要删除项目「${proj.projectName}」吗？\n将删除该项目名下的 ${proj.runCount} 条分析记录，此操作不可恢复。`
        : `确定要删除项目「${proj.projectName}」吗？此操作不可恢复。`;
    if (!window.confirm(message)) return;
    setBusy({ id: proj.id, action: 'delete' });
    setError('');
    taraApi
      .deleteProject(proj.projectName)
      .then(() => {
        setToast('项目已删除');
        loadProjects();
      })
      .catch((err) => setError(err instanceof Error ? err.message : '删除失败'))
      .finally(() => setBusy(null));
  }

  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">项目管理</h1>
          <span className="page-subtitle">以列表方式编排项目，跟踪分析进度与结果</span>
        </div>
        <div className="page-header-right">
          <button className="btn-export btn-export--secondary" type="button" onClick={() => navigate('/history')}>
            <History size={16} /> 历史记录
          </button>
          <button className="btn-export" type="button" onClick={() => navigate('/workspace')}>
            <Plus size={16} /> 新建分析项目
          </button>
        </div>
      </header>

      <main className="page-body page-body--table">
        {error && (
          <div className="inline-alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}>×</button>
          </div>
        )}

        <div className="project-summary">
          <span>共 <strong>{projects.length}</strong> 个项目</span>
          <span className="project-summary-divider" />
          <span>已完成 <strong>{completedCount}</strong> 个</span>
          <span className="project-summary-divider" />
          <span>进行中 <strong>{projects.length - completedCount}</strong> 个</span>
        </div>

        {loading && (
          <div className="home-projects-loading">
            <Loader2 className="spinner-icon" size={28} />
            <span>加载项目列表...</span>
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="home-projects-empty">
            <FileText size={48} className="home-empty-icon" />
            <p>暂无项目</p>
            <p className="home-empty-hint">点击「新建分析项目」开始第一次 TARA 分析</p>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="project-table">
            <div className="project-table-head">
              <span>项目编号</span>
              <span>项目名称</span>
              <span>状态</span>
              <span>创建时间</span>
              <span>完成时间</span>
              <span>进度</span>
              <span className="project-table-head-actions">操作</span>
            </div>

            {projects.map((proj) => (
              <div className="project-table-row" key={proj.id}>
                <span className="project-no">{proj.projectNo}</span>
                <div className="project-name-cell">
                  <span className="project-name">{proj.projectName}</span>
                  {proj.documentFilename && (
                    <span className="project-doc">
                      <FileText size={12} /> {proj.documentFilename}
                    </span>
                  )}
                </div>
                <span className={`project-status project-status--${proj.status}`}>
                  {proj.status === 'completed' ? '已完成' : '进行中'}
                </span>
                <span className="project-date">
                  <Clock size={12} /> {formatDate(proj.createdAt)}
                </span>
                <span className={`project-date ${proj.completedAt ? '' : 'project-date--empty'}`}>
                  {proj.completedAt ? formatDate(proj.completedAt) : '—'}
                </span>
                <span className="project-progress">{proj.stepCount}/5</span>
                <div className="project-actions">
                  <button
                    className="btn-export btn-export--small"
                    type="button"
                    title="查看项目"
                    onClick={() => handleView(proj)}
                  >
                    <Eye size={14} /> 查看
                  </button>
                  <button
                    className="btn-export btn-export--secondary btn-export--small"
                    type="button"
                    title="下载报告"
                    disabled={busy?.id === proj.id && busy.action === 'download'}
                    onClick={() => handleDownloadReport(proj)}
                  >
                    {busy?.id === proj.id && busy.action === 'download' ? (
                      <Loader2 className="spinner-icon" size={14} />
                    ) : (
                      <Download size={14} />
                    )}
                    报告
                  </button>
                  <button
                    className="btn-export btn-export--secondary btn-export--small"
                    type="button"
                    title="配置"
                    onClick={() => openConfigure(proj)}
                  >
                    <Settings size={14} /> 配置
                  </button>
                  <button
                    className="btn-export btn-export--secondary btn-export--small"
                    type="button"
                    title="打开流程图绘制工作区"
                    onClick={() => navigate(`/diagram/${proj.id}`)}
                  >
                    <Workflow size={14} /> 流程图
                  </button>
                  <button
                    className="btn-export btn-export--secondary btn-export--small btn-export--danger"
                    type="button"
                    title="删除"
                    disabled={busy?.id === proj.id && busy.action === 'delete'}
                    onClick={() => handleDelete(proj)}
                  >
                    <Trash2 size={14} /> 删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {editing && (
        <div className="modal">
          <button className="modal-overlay" type="button" onClick={() => setEditing(null)} aria-label="关闭" />
          <div className="modal-content modal-settings">
            <div className="modal-header">
              <h3><Settings size={18} /> 配置项目</h3>
              <button className="modal-close" type="button" onClick={() => setEditing(null)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            <div className="settings-body">
              <div className="form-group">
                <label className="form-label">项目编号</label>
                <input className="form-input" value={editing.projectNo} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">项目名称</label>
                <input
                  className="form-input"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  placeholder="输入项目名称"
                />
              </div>
              <div className="form-group">
                <label className="form-label">关联文档</label>
                <input
                  className="form-input"
                  value={editDocument}
                  onChange={(event) => setEditDocument(event.target.value)}
                  placeholder="文档文件名（可选）"
                />
              </div>
              <div className="settings-hint">
                <span>重命名将应用到该项目名下的 {editing.runCount} 条分析记录。</span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-export" type="button" onClick={saveConfigure} disabled={saving}>
                {saving ? <Loader2 className="spinner-icon" size={16} /> : null}
                保存
              </button>
              <button className="btn-export btn-export--secondary" type="button" onClick={() => setEditing(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast toast--visible">{toast}</div>}
    </div>
  );
}
