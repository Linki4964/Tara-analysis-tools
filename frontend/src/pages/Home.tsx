import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, FileText, Loader2, Plus, RotateCcw, Shield } from 'lucide-react';
import { taraApi } from '../api/taraApi';
import type { RunSummary } from '../types/tara';

export default function Home() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    taraApi
      .listRuns()
      .then((res) => {
        // Group by project_name to show unique projects
        const seen = new Set<string>();
        const unique: RunSummary[] = [];
        for (const run of res.runs || []) {
          const key = run.project_name || '(未命名)';
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(run);
          }
        }
        setProjects(unique);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-header-left">
          <Shield size={40} className="home-logo" />
          <div>
            <h1 className="home-title">TARA 分析与风险处置工具</h1>
            <span className="home-subtitle">ISO/SAE 21434 · 汽车网络安全威胁分析与风险评估</span>
          </div>
        </div>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <h2>开始新的分析</h2>
          <p>创建新的 TARA 分析项目，通过 5 个步骤完成威胁分析与风险处置</p>
          <button className="home-cta" type="button" onClick={() => navigate('/workspace')}>
            <Plus size={22} /> 新建分析项目
          </button>
        </section>

        <section className="home-projects">
          <h2>已有项目</h2>

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
              <p className="home-empty-hint">完成一次 TARA 分析后，项目将自动显示在这里</p>
            </div>
          )}

          {!loading && projects.length > 0 && (
            <div className="home-project-grid">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="home-project-card"
                  onClick={() => navigate(`/workspace`, { state: { loadRunId: proj.id } })}
                >
                  <div className="home-project-card-icon">
                    <Shield size={28} />
                  </div>
                  <div className="home-project-card-body">
                    <h3>{proj.project_name || '(未命名项目)'}</h3>
                    <span className="home-project-card-date">
                      <Clock size={13} /> {formatDate(proj.created_at)}
                    </span>
                    <div className="home-project-card-meta">
                      <span className={`home-project-card-status home-project-card-status--${proj.status}`}>
                        {proj.status === 'completed' ? '已完成' : '进行中'}
                      </span>
                      <span className="home-project-card-steps">{proj.step_count}/5 步</span>
                    </div>
                  </div>
                  <div className="home-project-card-action">
                    <RotateCcw size={18} />
                    <span>继续</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
