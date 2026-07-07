import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Eye, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { taraApi } from '../api/taraApi';
import type { RunDetail, RunSummary } from '../types/tara';

const STEP_LABELS: Record<number, string> = {
  1: '相关项定义',
  2: '资产识别',
  3: '威胁分析',
  4: '攻击路径',
  5: '风险处置',
};

const STEP_NAMES: Record<number, string> = {
  1: 'item_definition',
  2: 'assets',
  3: 'threats',
  4: 'attack_paths',
  5: 'risk_treatments',
};

export default function History() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadRuns();
  }, []);

  function loadRuns() {
    setLoading(true);
    taraApi
      .listRuns()
      .then((res) => setRuns(res.runs || []))
      .catch(() => setError('加载历史记录失败'))
      .finally(() => setLoading(false));
  }

  async function toggleExpand(runId: string) {
    if (expanded === runId) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(runId);
    setDetailLoading(true);
    try {
      const res = await taraApi.getRun(runId);
      setDetail(res.run);
    } catch {
      setError('加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDelete(runId: string) {
    if (!window.confirm('确定要删除这条记录吗？')) return;
    try {
      await taraApi.deleteRun(runId);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      if (expanded === runId) {
        setExpanded(null);
        setDetail(null);
      }
    } catch {
      setError('删除失败');
    }
  }

  function handleLoad(runId: string) {
    navigate('/', { state: { loadRunId: runId } });
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

  function stepSummary(data: Record<string, unknown>): string {
    const assets = data.assets as Array<{ assetName?: string }> | undefined;
    const threats = data.threats as Array<{ threatName?: string }> | undefined;
    const paths = data.attackPaths as Array<{ attackPathName?: string }> | undefined;
    const treatments = data.riskTreatments as Array<{ controlName?: string }> | undefined;
    const items = data.items as Array<{ itemName?: string }> | undefined;

    const list = assets || threats || paths || treatments || items;
    if (list && list.length) {
      return `${list.length} 条结果`;
    }
    if (data.systemDescription) {
      return (data.systemDescription as string).slice(0, 80) + '...';
    }
    return '已完成';
  }

  return (
    <div className="history-page">
      <div className="history-header">
        <button className="btn-back" type="button" onClick={() => navigate('/')} title="返回首页">
          <ArrowLeft size={18} />
          <span>返回</span>
        </button>
        <div className="history-header-right">
          <h2>历史记录</h2>
          <span className="history-count">{runs.length} 条记录</span>
        </div>
      </div>

      {error && (
        <div className="inline-alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>×</button>
        </div>
      )}

      <div className="history-list">
        {loading && (
          <div className="history-empty">
            <Loader2 className="spinner-icon" size={32} />
            <p>加载中...</p>
          </div>
        )}

        {!loading && runs.length === 0 && (
          <div className="history-empty">
            <Clock size={48} className="history-empty-icon" />
            <p>暂无历史记录</p>
            <p className="history-empty-hint">完成一次 TARA 分析后，结果会自动保存在这里</p>
          </div>
        )}

        {runs.map((run) => (
          <div key={run.id} className={`history-card ${expanded === run.id ? 'history-card--expanded' : ''}`}>
            <div className="history-card-header">
              <div className="history-card-info">
                <span className="history-card-project">{run.project_name || '(未命名项目)'}</span>
                <span className="history-card-date">
                  <Clock size={13} /> {formatDate(run.created_at)}
                </span>
              </div>
              <div className="history-card-badges">
                <span className={`history-card-status history-card-status--${run.status}`}>
                  {run.status === 'completed' ? '已完成' : '进行中'}
                </span>
                <span className="history-step-count">{run.step_count}/5 步</span>
              </div>
            </div>

            {run.document_filename && (
              <div className="history-card-filename">文档: {run.document_filename}</div>
            )}

            <div className="history-card-actions">
              <button className="btn-export btn-export--small" type="button" onClick={() => handleLoad(run.id)}>
                <RotateCcw size={14} /> 加载
              </button>
              <button className="btn-export btn-export--secondary btn-export--small" type="button" onClick={() => toggleExpand(run.id)}>
                <Eye size={14} /> {expanded === run.id ? '收起' : '详情'}
              </button>
              <button
                className="btn-export btn-export--secondary btn-export--small btn-export--danger"
                type="button"
                onClick={() => handleDelete(run.id)}
              >
                <Trash2 size={14} /> 删除
              </button>
            </div>

            {expanded === run.id && (
              <div className="history-detail">
                {detailLoading && (
                  <div className="history-detail-loading">
                    <Loader2 className="spinner-icon" size={20} />
                    <span>加载详情...</span>
                  </div>
                )}
                {detail && !detailLoading && (
                  <div className="history-detail-steps">
                    {detail.steps.map((step) => (
                      <div key={step.step_number} className="history-detail-step">
                        <div className="history-detail-step-header">
                          <span className="history-detail-step-num">{step.step_number}</span>
                          <span className="history-detail-step-name">{STEP_LABELS[step.step_number] || step.step_name}</span>
                        </div>
                        <div className="history-detail-step-summary">{stepSummary(step.result_data)}</div>
                      </div>
                    ))}
                    {detail.steps.length === 0 && (
                      <div className="history-detail-empty">该记录暂无步骤数据</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
