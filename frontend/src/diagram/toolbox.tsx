/**
 * Right-side drawing toolbox — a slim single-column rail of icon buttons.
 *
 * One tool is active at a time; the user picks a primitive and draws it on the
 * board (drag for shapes/arrows, click for text). A small delete affordance is
 * pinned to the bottom of the rail. Delete / copy / paste / z-order live on the
 * board's right-click context menu and the Delete key.
 */
import type { ToolId } from './shapes';

export interface ToolboxProps {
  tool: ToolId;
  onTool: (t: ToolId) => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

/** 20×20 inline glyphs (kept dependency-free, always visible). */
function Glyph({ kind, size = 20 }: { kind: ToolId; size?: number }) {
  const sw = 1.7;
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round' as const };
  switch (kind) {
    case 'select':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
          <path d="M4 3l7 15 2.2-6L19.5 11 4 3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'rect':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.4" fill="#fff" />
        </svg>
      );
    case 'dashedRect':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.4" strokeDasharray="4 3" />
        </svg>
      );
    case 'circle':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
          <circle cx="12" cy="12" r="8.4" fill="#fff" />
        </svg>
      );
    case 'arrowSingle':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
          <path d="M4 12h13" />
          <path d="M13.4 7.4L18 12l-4.6 4.6" />
        </svg>
      );
    case 'arrowDouble':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
          <path d="M4 12h16" />
          <path d="M19 7.4L23 12l-4 4.6" />
          <path d="M5 7.4L1 12l4 4.6" />
        </svg>
      );
    case 'text':
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
          <text x="8" y="17" fontSize="13" fontWeight="700" fill="currentColor" stroke="none" fontFamily="inherit">
            A
          </text>
        </svg>
      );
  }
}

function TrashGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

const TOOLS: { id: ToolId; label: string; tip: string }[] = [
  { id: 'select', label: '选择', tip: '单击选中、拖动移动、拖角改大小；双击文字可编辑；右键打开菜单' },
  { id: 'rect', label: '矩形', tip: '拖拽画实线矩形（整车部件）' },
  { id: 'dashedRect', label: '虚线矩形', tip: '拖拽画虚线框（边界 / 安全域）' },
  { id: 'circle', label: '圆形', tip: '拖拽画圆 / 椭圆（服务、接口）' },
  { id: 'arrowSingle', label: '单向箭头', tip: '点一个矩形，沿四向连接点拖向其它矩形连单向线；也可在空白处直接拖出' },
  { id: 'arrowDouble', label: '双向箭头', tip: '同单向箭头，生成两端都有箭头的双向线' },
  { id: 'text', label: '文字', tip: '点击画面任意位置输入标注文字' },
];

export default function Toolbox({ tool, onTool, onDelete, canDelete }: ToolboxProps) {
  return (
    <div className="tb-rail" role="toolbar" aria-label="绘图工具">
      {TOOLS.map((t) => {
        const active = t.id === tool;
        return (
          <button
            key={t.id}
            type="button"
            className={`tb-btn${active ? ' tb-btn--active' : ''}`}
            title={`${t.label} — ${t.tip}`}
            aria-label={t.label}
            aria-pressed={active}
            onClick={() => onTool(t.id)}
          >
            <Glyph kind={t.id} />
          </button>
        );
      })}
      {onDelete && (
        <>
          <span className="tb-sep" />
          <button
            type="button"
            className="tb-btn tb-btn--del"
            title="删除选中图形 (Delete)"
            aria-label="删除选中"
            disabled={!canDelete}
            onClick={() => onDelete()}
          >
            <TrashGlyph />
          </button>
        </>
      )}
    </div>
  );
}
