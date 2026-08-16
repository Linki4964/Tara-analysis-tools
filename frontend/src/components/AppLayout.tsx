import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  FolderKanban,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/home', label: '主页', icon: LayoutDashboard },
  { to: '/projects', label: '项目管理', icon: FolderKanban },
  { to: '/knowledge', label: '知识管理', icon: BookOpen },
  { to: '/permissions', label: '权限管理', icon: ShieldCheck },
  { to: '/settings', label: '设置', icon: Settings },
];

const COLLAPSE_KEY = 'tara-dock-collapsed';

export default function AppLayout() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <div className={`app-shell ${collapsed ? 'app-shell--collapsed' : ''}`}>
      <aside className="dock">
        <div className="dock-brand">
          <div className="dock-brand-box">
            <Shield size={22} />
          </div>
          <div className="dock-brand-text">
            <span className="dock-brand-title">TARA 平台</span>
            <span className="dock-brand-sub">威胁分析与风险评估</span>
          </div>
        </div>

        <button className="dock-new" type="button" onClick={() => navigate('/workspace')} title="新建分析项目">
          <Plus size={17} />
          <span>新建项目</span>
        </button>

        <nav className="dock-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `dock-item${isActive ? ' dock-item--active' : ''}`}
                title={item.label}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="dock-footer">
          <button
            className="dock-toggle"
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          {!collapsed && (
            <>
              <span className="dock-footer-dot" />
              <span>TARA Analysis Platform</span>
            </>
          )}
        </div>
      </aside>

      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}
