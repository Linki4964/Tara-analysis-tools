import { KeyRound, Lock, ShieldCheck, UserRound, UsersRound } from 'lucide-react';

const ROLE_PRESETS = [
  { name: '管理员', desc: '全部功能与数据访问权限，可管理用户与角色。', icon: ShieldCheck, tag: '内置' },
  { name: '分析师', desc: '创建与执行 TARA 分析，查看并导出分析结果。', icon: UserRound, tag: '内置' },
  { name: '审计员', desc: '只读访问历史记录与分析报告，用于合规审计。', icon: Lock, tag: '内置' },
];

export default function Permissions() {
  return (
    <div className="page-shell">
      <header className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">权限管理</h1>
          <span className="page-subtitle">管理用户、角色与数据访问范围</span>
        </div>
        <span className="page-badge page-badge--wip">规划中</span>
      </header>

      <main className="page-body">
        <div className="coming-soon">
          <UsersRound size={40} className="coming-soon-icon" />
          <h2>权限体系正在建设中</h2>
          <p>后续版本将支持用户账号、角色分配、项目级数据隔离与操作审计日志。</p>
        </div>

        <section className="perm-section">
          <h2 className="dash-section-title">预置角色</h2>
          <div className="module-grid">
            {ROLE_PRESETS.map((role) => {
              const Icon = role.icon;
              return (
                <div className="module-card" key={role.name}>
                  <span className="module-card-icon module-card-icon--dim"><Icon size={22} /></span>
                  <h3 className="module-card-title">{role.name}</h3>
                  <p className="module-card-desc">{role.desc}</p>
                  <span className="module-card-tag">{role.tag}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="perm-section">
          <h2 className="dash-section-title">规划能力</h2>
          <div className="perm-plan-list">
            <div className="perm-plan-item">
              <KeyRound size={18} />
              <span>用户账号管理与认证（支持本地账号与 SSO 集成）</span>
            </div>
            <div className="perm-plan-item">
              <UserRound size={18} />
              <span>基于角色的访问控制（RBAC），按项目分配权限</span>
            </div>
            <div className="perm-plan-item">
              <Lock size={18} />
              <span>敏感分析结果的访问审计与导出留痕</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
