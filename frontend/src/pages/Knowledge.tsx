import { BookOpen, BookOpenCheck, Database, FileSearch, GraduationCap, Layers, ShieldAlert } from 'lucide-react';

const KNOWLEDGE_MODULES = [
  {
    title: '威胁情报库',
    desc: '沉淀 STRIDE 威胁模式与典型损害场景，快速复用已验证的威胁分析结论。',
    icon: ShieldAlert,
  },
  {
    title: '资产模板库',
    desc: '面向常见 ECU、网关、云端服务等系统形态的资产与安全属性模板。',
    icon: Database,
  },
  {
    title: '标准与法规',
    desc: 'ISO/SAE 21434、UN R155 等法规条款与要求的索引与速查。',
    icon: BookOpenCheck,
  },
  {
    title: '分析经验库',
    desc: '保存优秀分析案例、攻击路径与处置方案的沉淀，供团队共享学习。',
    icon: GraduationCap,
  },
];

export default function Knowledge() {
  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">知识管理</h1>
          <span className="page-subtitle">集中管理威胁情报、资产模板与标准法规等分析知识</span>
        </div>
        <span className="page-badge page-badge--wip">规划中</span>
      </header>

      <main className="page-body">
        <div className="coming-soon">
          <BookOpen size={40} className="coming-soon-icon" />
          <h2>知识库功能正在建设中</h2>
          <p>后续版本将支持威胁情报、资产模板、标准法规与分析经验的统一管理与检索。</p>
        </div>

        <div className="module-grid">
          {KNOWLEDGE_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <div className="module-card" key={mod.title}>
                <span className="module-card-icon"><Icon size={22} /></span>
                <h3 className="module-card-title">{mod.title}</h3>
                <p className="module-card-desc">{mod.desc}</p>
                <span className="module-card-tag">即将上线</span>
              </div>
            );
          })}
        </div>

        <div className="knowledge-note">
          <Layers size={16} />
          <span>知识库数据将通过后端服务持久化，并可在 TARA 分析流程中作为上下文自动引用。</span>
        </div>
      </main>
    </div>
  );
}
