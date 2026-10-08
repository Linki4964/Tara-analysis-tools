/**
 * Step 0 · 结构图 — 矢量画板。
 *
 * 页面本身是一个自由矢量画板：右侧工具栏选图元（实线矩形 / 虚线矩形 /
 * 圆形 / 单向箭头 / 双向箭头 / 文字），直接在画布上按住拖拽绘制，之后可
 * 选中、拖动、改大小、双击编辑文字。所有内容（含底部 AI 生成图）都会变成
 * 普通可编辑的矢量对象，坐标由绘图者决定，不再做语义模型 + 自动排版。
 *
 * 保留的外围功能不变：顶部导航（返回 / 撤销重做 / 缩放 / 导出 / 下一步）、
 * 左侧运行记录、底部 AI 输入、localStorage 持久化（key `tara-arch:*`）。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Download,
  FileJson,
  Loader2,
  Menu,
  MessageSquare,
  Minus,
  Plus,
  Redo2,
  Scan,
  Send,
  Share2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import DrawCanvas, { type ContextOpen } from '../diagram/canvas';
import Toolbox from '../diagram/toolbox';
import {
  contentBounds,
  flattenArchModel,
  makeShapeIdFactory,
  resolveConnectors,
  sanitizeShapes,
} from '../diagram/shapes';
import type { DrawShape, ShapeKind, ToolId } from '../diagram/shapes';
import { sanitizeModel } from '../diagram/types';
import { exportJson, exportPngFile, exportSvgFile } from '../diagram/export';
import { taraApi } from '../api/taraApi';

export interface DiagramEmbedProps {
  runId?: string | null;
  notify?: (msg: string) => void;
  onStats?: (count: number) => void;
  onBack?: () => void;
  onNext?: () => void;
}

const DEFAULT_NAME = '系统架构画板';

const CHIP_EXAMPLES = [
  'TBOX 通过整车 CAN 总线连接 VCU 与中央网关；手机 APP 经 TSP 云端远程下发控制指令；攻击者可能经蓝牙或 OBD 进入，网关处有防火墙。',
  '为网关增加入侵检测（IDS）服务，并把 OBD 诊断口划入独立信任边界。',
];

const SUGGEST = '描述整车系统构成，让 AI 画一版架构草图（可继续手动修改）…';

type LogLine = { kind: 'step' | 'ok' | 'err' | 'think'; text: string };

interface BoardDoc {
  name: string;
  shapes: DrawShape[];
}

/* ------------------------------------------------------------------ */
/* Storage (with migration from the old semantic model format)         */
/* ------------------------------------------------------------------ */

function storageKey(runId?: string | null): string {
  return runId ? `tara-arch:${runId}` : 'tara-arch:pending';
}

function emptyDoc(): BoardDoc {
  return { name: DEFAULT_NAME, shapes: [] };
}

/** Coerce parsed localStorage / import payload into a BoardDoc. */
function coerceDoc(parsed: unknown): BoardDoc {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    // new vector format
    if (Array.isArray(o.shapes)) {
      return { name: typeof o.name === 'string' ? o.name : DEFAULT_NAME, shapes: sanitizeShapes(o.shapes) };
    }
    // legacy semantic format → flatten into editable shapes once
    if (o.components || o.schemaVersion) {
      const model = sanitizeModel(parsed);
      return { name: model.item.name || DEFAULT_NAME, shapes: flattenArchModel(model) };
    }
    return emptyDoc();
  }
  if (Array.isArray(parsed)) return { name: DEFAULT_NAME, shapes: sanitizeShapes(parsed) };
  return emptyDoc();
}

function loadStored(key: string): BoardDoc {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptyDoc();
    return coerceDoc(JSON.parse(raw) as unknown);
  } catch {
    return emptyDoc();
  }
}

function DiagramInner({ runId, notify, onStats, onBack, onNext }: DiagramEmbedProps) {
  const keyRef = useRef(storageKey(runId));
  const [doc, setDoc] = useState<BoardDoc>(() => loadStored(keyRef.current));
  const shapes = doc.shapes;

  const [past, setPast] = useState<DrawShape[][]>([]);
  const [future, setFuture] = useState<DrawShape[][]>([]);

  const [chatText, setChatText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiLog, setAiLog] = useState<LogLine[]>([
    { kind: 'think', text: '无限矢量画板：画布没有大小限制，左侧日志/右侧工具/底部输入都悬浮在画布上。右侧选图元直接拖拽绘制；箭头工具点矩形会浮现四向连接点，拖向其它矩形即成智能连线。选中后右键可复制/删除/置顶置底；鼠标中键拖动平移，导航栏按钮调整缩放。也可在底部描述整车架构，让 AI 先画一版草图。' },
  ]);
  const [logOpen, setLogOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [opsOpen, setOpsOpen] = useState(false);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<ToolId>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const clipRef = useRef<DrawShape[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const persistTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  const nonText = useMemo(() => shapes.filter((s) => s.kind !== 'text').length, [shapes]);
  const hasContent = nonText > 0;
  const empty = shapes.length === 0;
  const view = useMemo(() => resolveConnectors(shapes), [shapes]);
  // Selected ids in drawing order (keeps z-order ops predictable) + quick count.
  const selectedShapes = useMemo(() => {
    const set = new Set(selectedIds);
    return shapes.filter((s) => set.has(s.id));
  }, [shapes, selectedIds]);
  const selCount = selectedShapes.length;

  /* ---------- persistence (debounced) ---------- */
  useEffect(() => {
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(keyRef.current, JSON.stringify({ name: doc.name, shapes }));
      } catch {
        /* storage full — ignore */
      }
    }, 250);
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  /* ---------- stats to parent ---------- */
  useEffect(() => {
    onStats?.(nonText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonText]);

  const showToast = useCallback((msg: string) => {
    notify?.(msg);
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }, [notify]);

  /* ---------- history ---------- */
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const commitShapes = useCallback(
    (next: DrawShape[], opts?: { record?: boolean }) => {
      const record = opts?.record !== false;
      if (JSON.stringify(next) === JSON.stringify(shapes)) return;
      if (record) {
        setPast((p) => {
          const arr = [...p, shapes];
          return arr.length > 50 ? arr.slice(arr.length - 50) : arr;
        });
        setFuture([]);
      }
      setDoc((d) => ({ ...d, shapes: next }));
    },
    [shapes]
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [...f, shapes]);
      setDoc((d) => ({ ...d, shapes: prev }));
      setSelectedIds([]);
      return p.slice(0, -1);
    });
  }, [shapes]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const nxt = f[f.length - 1];
      setPast((p) => [...p, shapes]);
      setDoc((d) => ({ ...d, shapes: nxt }));
      setSelectedIds([]);
      return f.slice(0, -1);
    });
  }, [shapes]);

  /* ---------- context menu / clipboard / z-order ---------- */
  const copySelection = useCallback(() => {
    if (!selCount) return;
    clipRef.current = selectedShapes;
    showToast(`已复制 ${selCount} 个对象`);
    setCtxMenu(null);
  }, [selCount, selectedShapes, showToast]);

  const cutSelection = useCallback(() => {
    if (!selCount) return;
    const gone = new Set(selectedIds);
    clipRef.current = selectedShapes;
    commitShapes(resolveConnectors(shapes.filter((s) => !gone.has(s.id))));
    setSelectedIds([]);
    setCtxMenu(null);
    showToast(`已剪切 ${selCount} 个对象`);
  }, [shapes, selectedIds, selectedShapes, selCount, commitShapes, showToast]);

  const pasteClipboard = useCallback(() => {
    const ones = clipRef.current;
    if (!ones.length) return;
    const factory = makeShapeIdFactory(shapes);
    const prefixFor = (k: ShapeKind) => (k === 'arrow' ? 'a' : k === 'circle' ? 'o' : k === 'text' ? 't' : 'r');
    const added = ones.map((s, i) => {
      const off = 20 + i * 24;
      const nid = factory(prefixFor(s.kind));
      if (s.kind === 'arrow') {
        // pasted lines become freehand so they don't bind to the original shapes
        return { ...s, id: nid, ca: null, cb: null, x1: s.x1 + off, y1: s.y1 + off, x2: s.x2 + off, y2: s.y2 + off };
      }
      return { ...s, id: nid, x: s.x + off, y: s.y + off };
    });
    commitShapes(resolveConnectors([...shapes, ...added]));
    setSelectedIds(added.map((a) => a.id));
    setCtxMenu(null);
    showToast(`已粘贴 ${added.length} 个对象`);
  }, [shapes, commitShapes, showToast]);

  const zMove = useCallback((toFront: boolean) => {
    if (!selCount) return;
    const picked = new Set(selectedIds);
    const keep = shapes.filter((s) => !picked.has(s.id));   // drawing order
    const chosen = shapes.filter((s) => picked.has(s.id));  // drawing order
    // The whole group jumps to the top (front) or bottom (back) of the stack;
    // relative order inside the group is preserved.
    commitShapes(toFront ? [...keep, ...chosen] : [...chosen, ...keep]);
    setCtxMenu(null);
  }, [shapes, selectedIds, selCount, commitShapes]);

  const openCtxMenu = useCallback((info: ContextOpen) => {
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    setCtxMenu({
      x: Math.max(8, Math.min(info.clientX - r.left, host.clientWidth - 180)),
      y: Math.max(8, info.clientY - r.top),
    });
  }, []);

  /* ---------- middle-button pan: move the camera (pan) instead of scrolling ---------- */
  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const st = stageRef.current;
    if (!st) return;
    st.setPointerCapture?.(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    st.classList.add('panning');
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      setPan({ x: start.px + (ev.clientX - start.x), y: start.py + (ev.clientY - start.y) });
    };
    const end = () => {
      st.classList.remove('panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        setCtxMenu(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === 'c') { e.preventDefault(); copySelection(); return; }
        if (k === 'x') { e.preventDefault(); cutSelection(); return; }
        if (k === 'v') { e.preventDefault(); pasteClipboard(); return; }
      }
      if (tool === 'select' && selectedIds.length > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        const gone = new Set(selectedIds);
        commitShapes(resolveConnectors(shapes.filter((s) => !gone.has(s.id))));
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, tool, selectedIds, shapes, commitShapes, copySelection, cutSelection, pasteClipboard]);

  /* ---------- helpers ---------- */
  const logLine = useCallback((kind: LogLine['kind'], text: string) => {
    setAiLog((lines) => {
      const next = [...lines, { kind, text }];
      return next.length > 120 ? next.slice(next.length - 120) : next;
    });
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    });
  }, []);

  const pushStatus = (text: string) => logLine('ok', text);

  /* ---------- AI：按描述绘制一版草图（转成可编辑对象） ---------- */
  const handleChatSend = useCallback(async () => {
    const desc = chatText.trim();
    if (!desc || sending) return;
    setSending(true);
    const wasEmpty = empty;
    logLine('step', `AI 按描述绘制架构草图… ${desc.slice(0, 60)}`);
    try {
      const res = await taraApi.generateDiagram({
        runId: runId || undefined,
        description: desc,
        mode: 'create',
        currentModel: null,
      });
      if (!res.success) throw new Error('后端返回失败');
      if (res.plan) logLine('think', `计划：${res.plan}`);
      if (res.summary) pushStatus(`完成：${res.summary}`);
      if (!wasEmpty) logLine('think', '原有内容会保留在“撤销”历史中，可一步恢复。');
      for (const w of res.warnings ?? []) logLine('think', `提示：${w}`);
      const model = sanitizeModel(res.model);
      const nextShapes = flattenArchModel(model);
      commitShapes(nextShapes);
      setSelectedIds([]);
      setChatText('');
      setSending(false);
      showToast(nextShapes.length ? 'AI 草图已生成，可手动修改' : '模型为空，请补充描述');
      requestAnimationFrame(() => fitView());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLine('err', `生成失败：${msg}`);
      showToast('AI 生成失败，请稍后重试');
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatText, sending, empty, runId, commitShapes]);

  /* ---------- view / zoom (camera) ---------- */
  const clampZ = (z: number) => Math.max(0.1, Math.min(3, z));

  /** zoom to `nextZoom`, keeping the model point under the viewport centre fixed. */
  const zoomAtCenter = useCallback(
    (nextZoom: number) => {
      const st = stageRef.current;
      if (!st) return;
      const nz = clampZ(nextZoom);
      const cx = st.clientWidth / 2;
      const cy = st.clientHeight / 2;
      setPan((p) => ({ x: cx - ((cx - p.x) / zoom) * nz, y: cy - ((cy - p.y) / zoom) * nz }));
      setZoom(nz);
    },
    [zoom]
  );

  const zoomBy = (factor: number) => zoomAtCenter(zoom * factor);

  /** centre the drawing (or, when empty, the model origin) in the viewport. */
  const fitView = useCallback(() => {
    const st = stageRef.current;
    if (!st) return;
    const W = st.clientWidth;
    const H = st.clientHeight;
    if (W <= 0 || H <= 0) return;
    const b = contentBounds(shapes);
    if (!b) {
      setZoom(clampZ(0.9));
      setPan({ x: W / 2, y: H / 2 });
      return;
    }
    const m = 56;
    if (W <= m * 2 || H <= m * 2) return;
    const z = clampZ(Math.min((W - m * 2) / b.w, (H - m * 2) / b.h, 1.4));
    setZoom(z);
    setPan({ x: W / 2 - (b.x + b.w / 2) * z, y: H / 2 - (b.y + b.h / 2) * z });
  }, [shapes]);

  /* auto-fit on mount and whenever the board toggles between empty / non-empty */
  useEffect(() => {
    const t = window.setTimeout(() => fitView(), 40);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty]);

  /* ---------- export ---------- */
  const baseName = doc.name || 'architecture';

  const handleExportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    exportPngFile(svg, baseName)
      .then(() => showToast('PNG 已导出'))
      .catch((e) => {
        logLine('err', String(e instanceof Error ? e.message : e));
        showToast('PNG 导出失败');
      });
  };
  const handleExportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    exportSvgFile(svg, baseName);
    showToast('SVG 已导出');
  };
  const handleExportJson = () => {
    exportJson({ name: doc.name, shapes }, baseName);
    showToast('矢量 JSON 已导出');
  };

  /* ---------- actions ---------- */
  const handleClear = () => {
    setPast((p) => [...p, shapes].slice(-50));
    setFuture([]);
    setDoc({ name: doc.name, shapes: [] });
    setSelectedIds([]);
    showToast('已清空画布（可撤销）');
  };

  const deleteSelected = useCallback(() => {
    if (!selCount) return;
    const gone = new Set(selectedIds);
    commitShapes(resolveConnectors(shapes.filter((s) => !gone.has(s.id))));
    setSelectedIds([]);
    setCtxMenu(null);
  }, [shapes, selectedIds, selCount, commitShapes]);

  const toggleOps = () => setOpsOpen((v) => !v);

  return (
    <div className="diagram-canvas">
      {/* ------------------- infinite canvas stage (panels float above) ------------------- */}
      <div className="arch-stage" ref={stageRef} onPointerDown={onStagePointerDown}>
        <div className="arch-canvas-host" ref={hostRef}>
          <DrawCanvas
            shapes={view}
            tool={tool}
            zoom={zoom}
            pan={pan}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            onCommit={(next) => commitShapes(next)}
            contentRef={svgRef}
            onContextOpen={openCtxMenu}
          />
            {empty && tool === 'select' && (
              <div className="dc-welcome">
                <Share2 size={34} />
                <p>在右侧选择图元，直接在画布上绘制整车架构</p>
                <p className="dc-welcome-sub">▢ 矩形 · ┅ 虚线框 · ● 圆形 · → 单/双箭头 · A 文字 · 中键拖动平移 · 右键菜单</p>
              </div>
            )}
            {ctxMenu && (
              <>
                <div className="ctx-backdrop" onClick={() => setCtxMenu(null)} />
                <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} role="menu" aria-label="画板右键菜单">
                  <button type="button" className="ctx-item" disabled={!selCount} onClick={cutSelection} onMouseDown={(e) => e.preventDefault()}>
                    剪切
                  </button>
                  <button type="button" className="ctx-item" disabled={!selCount} onClick={copySelection} onMouseDown={(e) => e.preventDefault()}>
                    复制
                  </button>
                  <button type="button" className="ctx-item" disabled={clipRef.current.length === 0} onClick={pasteClipboard} onMouseDown={(e) => e.preventDefault()}>
                    粘贴
                  </button>
                  <div className="ctx-sep" />
                  <button type="button" className="ctx-item ctx-item--danger" disabled={!selCount} onClick={deleteSelected} onMouseDown={(e) => e.preventDefault()}>
                    删除
                  </button>
                  <div className="ctx-sep" />
                  <button type="button" className="ctx-item" disabled={!selCount} onClick={() => zMove(true)} onMouseDown={(e) => e.preventDefault()}>
                    置于顶层
                  </button>
                  <button type="button" className="ctx-item" disabled={!selCount} onClick={() => zMove(false)} onMouseDown={(e) => e.preventDefault()}>
                    置于底层
                  </button>
                </div>
              </>
            )}
        </div>
      </div>

      {/* ------------------------ navbar ------------------------ */}
      <header className="diagram-navbar">
        <div className="diagram-navbar-left">
          <div className="diagram-navbar-menu">
            <button type="button" className="diagram-navbar-iconbtn" onClick={toggleOps} title="菜单">
              <Menu size={18} />
            </button>
            {opsOpen && (
              <>
                <div className="diagram-menu-backdrop" onClick={() => setOpsOpen(false)} />
                <div className="diagram-navbar-menu-drop" onClick={(e) => e.stopPropagation()}>
                  {onBack && (
                    <>
                      <button type="button" className="diagram-menu-item" onClick={() => { setOpsOpen(false); onBack(); }}>
                        <ArrowLeft size={14} /> 返回项目
                      </button>
                      <div className="diagram-menu-separator" />
                    </>
                  )}
                  <button type="button" className="diagram-menu-item" onClick={() => { setOpsOpen(false); handleExportPng(); }}>
                    <Download size={14} /> 导出 PNG 图片
                  </button>
                  <button type="button" className="diagram-menu-item" onClick={() => { setOpsOpen(false); handleExportSvg(); }}>
                    <Download size={14} /> 导出 SVG 矢量图
                  </button>
                  <button type="button" className="diagram-menu-item" onClick={() => { setOpsOpen(false); handleExportJson(); }}>
                    <FileJson size={14} /> 导出矢量 JSON
                  </button>
                  <div className="diagram-menu-separator" />
                  <button type="button" className="diagram-menu-item diagram-menu-item--danger" onClick={() => { setOpsOpen(false); handleClear(); }}>
                    <Trash2 size={14} /> 清空画布
                  </button>
                </div>
              </>
            )}
          </div>
          <span className="diagram-navbar-title">{doc.name}</span>
          {!empty && <span className="arch-count-pill">{shapes.length} 个对象</span>}
        </div>

        <div className="diagram-navbar-right">
          <button type="button" className="diagram-navbar-iconbtn" title="撤销 (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 size={17} />
          </button>
          <button type="button" className="diagram-navbar-iconbtn" title="重做 (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
            <Redo2 size={17} />
          </button>
          <button type="button" className="diagram-navbar-iconbtn" title="缩小" onClick={() => zoomBy(0.85)} disabled={zoom <= 0.1}>
            <Minus size={16} />
          </button>
          <button type="button" className="diagram-navbar-iconbtn" title="放大" onClick={() => zoomBy(1.18)} disabled={zoom >= 3}>
            <Plus size={16} />
          </button>
          <button type="button" className="diagram-navbar-iconbtn" title="100%" onClick={() => zoomAtCenter(1)}>
            <span className="arch-navzoom-pct">{Math.round(zoom * 100)}%</span>
          </button>
          <button type="button" className="diagram-navbar-iconbtn" title="适应视图" onClick={() => fitView()}>
            <Scan size={16} />
          </button>
          <button type="button" className="diagram-navbar-pill" onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? '收起' : '工具栏'}
          </button>
          {onNext && (
            <button type="button" className="diagram-navbar-next" onClick={onNext} disabled={!hasContent} title={hasContent ? '进入第 1 步' : '请先在画布上绘制架构图形'}>
              下一步 <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>

      {/* --------------------- agent log (left) --------------------- */}
      {logOpen ? (
        <aside className="diagram-agentlog" style={{ top: 68, left: 12 }}>
          <div className="diagram-agentlog-head" onDoubleClick={() => setLogOpen(false)} title="双击折叠">
            <div className="diagram-agentlog-dots">
              <i className="diagram-agentlog-dot-light diagram-agentlog-dot-light--red" />
              <i className="diagram-agentlog-dot-light diagram-agentlog-dot-light--yellow" />
              <i className="diagram-agentlog-dot-light diagram-agentlog-dot-light--green" />
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' }}>运行记录</span>
            <button type="button" className="diagram-agentlog-close" title="折叠" onClick={() => setLogOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="diagram-agentlog-body" ref={logRef}>
            {aiLog.map((line, i) => (
              <div className={`diagram-agentlog-line diagram-agentlog-line--${line.kind}`} key={i}>
                <span className="diagram-agentlog-dot">{line.kind === 'err' ? '✕' : line.kind === 'think' ? '✦' : '●'}</span>
                <span className="diagram-agentlog-text">{line.text}</span>
              </div>
            ))}
          </div>
          <button type="button" className="diagram-agentlog-foot" onClick={() => setLogOpen(false)}>
            <AlertTriangle size={14} />
            <span>运行记录（双击标题折叠）</span>
          </button>
        </aside>
      ) : (
        <button type="button" className="diagram-agentlog-reopen" title="显示运行记录" onClick={() => setLogOpen(true)}>
          <MessageSquare size={15} />
        </button>
      )}

      {/* ------------------- right toolbox ------------------- */}
      {panelOpen && (
        <aside className="diagram-panel arch-panel arch-panel--tools">
          <div className="diagram-panel-head">
            <span className="diagram-panel-title">绘图工具</span>
            <button type="button" className="diagram-agentlog-close" title="收起面板" onClick={() => setPanelOpen(false)}>
              <X size={15} />
            </button>
          </div>
          <div className="diagram-panel-body arch-panel-body">
            <Toolbox tool={tool} onTool={setTool} onDelete={deleteSelected} canDelete={selCount > 0 && tool === 'select'} />
          </div>
        </aside>
      )}

      {/* ------------------------ chat ------------------------ */}
      <div className="diagram-chat-wrap" style={{ bottom: 16 }}>
        <div className="diagram-chat-chips">
          {CHIP_EXAMPLES.map((chip) => (
            <button key={chip.slice(0, 8)} type="button" className="diagram-chat-chip" onClick={() => setChatText(chip)}>
              {chip.length > 22 ? `${chip.slice(0, 22)}…` : chip}
            </button>
          ))}
        </div>
        <div className="diagram-chat">
          <MessageSquare size={16} className="diagram-chat-icon" />
          <input
            className="diagram-chat-input"
            placeholder={SUGGEST}
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleChatSend();
              }
            }}
            disabled={sending}
          />
          <button type="button" className="diagram-chat-send" disabled={sending || !chatText.trim()} onClick={() => void handleChatSend()} title="让 AI 绘制架构草图">
            {sending ? <Loader2 size={16} className="diagram-chat-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {/* ------------------------ toast ------------------------ */}
      {!notify && toast && <div className="toast toast--visible">{toast}</div>}
    </div>
  );
}

export function DiagramEmbed(props: DiagramEmbedProps) {
  return <DiagramInner {...props} />;
}

/** Standalone full-screen page used by the `/diagram/:runId` route. */
export default function Diagram() {
  const { runId } = useParams<{ runId?: string }>();
  const navigate = useNavigate();
  const handleNext = useCallback(() => {
    // 进入 TARA 向导并在后续步骤继续：带 runId 跳 /workspace，落在第 1 步。
    if (runId) navigate('/workspace', { state: { loadRunId: runId, startAt: 1 } });
    else navigate('/workspace'); // 无 runId（直输 /diagram/）：回全新向导
  }, [navigate, runId]);
  return (
    <div className="diagram-page">
      <DiagramInner
        runId={runId}
        notify={undefined}
        onBack={() => navigate('/projects')}
        onNext={handleNext}
      />
    </div>
  );
}
