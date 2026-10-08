/**
 * Interactive vector whiteboard for the Step-0 architecture diagram.
 *
 * The board content is a list of `DrawShape`s. Depending on the active tool a
 * pointer drag creates a primitive (solid/dashed rect, ellipse/circle, arrow) or
 * a click drops a text label; the select tool moves / resizes / edits objects.
 *
 * Arrow tools have a "port" mode: clicking a box/circle reveals four outward
 * arrow ports on its edges. Dragging from a port to another shape creates a
 * smart connector (each end sticks to a shape via `ca`/`cb`); the board keeps
 * attached endpoints re-derived (`resolveConnectors`) so lines follow their
 * shapes when anything moves or resizes. Dragging from empty space still draws
 * a plain freehand arrow.
 *
 * Infinite canvas. The world has no bounds: shapes live in unbounded model
 * coordinates (they may be negative) and a *camera* — a `pan` + `zoom` prop —
 * maps model → screen (`x*zoom + pan`). The interaction `<svg>` (`.dc-overlay`)
 * spans the whole viewport and everything inside it (shapes, selection chrome,
 * drag preview, arrow ports) is drawn in one `<g transform="translate(pan)
 * scale(zoom)">` group, so pointer math is a simple inverse mapping.
 *
 * A hidden, camera-free `.dc-content` mirror holds the same shapes at their real
 * model bounds (with a white backdrop). That node is what PNG/SVG export reads,
 * so exported files are tightly cropped to the content and never include chrome.
 *
 * The canvas keeps a *working copy* of the shapes while a gesture runs and only
 * reports the finished result through `onCommit` (one history entry per gesture),
 * so drags never spam the undo stack. Only the left mouse button draws; middle
 * button panning is handled by the parent (Diagram) via the `pan` prop.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { ArrowDir, DrawShape, HandleId, SideId, ShapeKind, ToolId, ToolStyle } from './shapes';
import {
  TOOL_STYLE,
  FONT_FAMILY,
  clipToShape,
  contentBounds,
  handlesOf,
  hitsShape,
  makeArrowShape,
  makeCircleShape,
  makeRectShape,
  makeShapeIdFactory,
  makeTextShape,
  moveShape,
  overlapsRect,
  rectFromCorners,
  rectOf,
  refreshTextSize,
  resizeWithHandle,
  resolveConnectors,
  sidePointsOf,
} from './shapes';

/* ---------------------------------------------------------------- */
/* Small SVG glyphs                                                  */
/* ---------------------------------------------------------------- */

const HDR_H = 26; // component caption band height
const ARROW_LEN = 10; // arrowhead size in model units
const ARROW_HALF = 4.6;
const SEL = '#2563eb';
const GREEN = '#16a34a';
const HANDLE = 6; // selection handle side length

function arrowHeadPts(x: number, y: number, dx: number, dy: number): string {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x - ux * ARROW_LEN;
  const by = y - uy * ARROW_LEN;
  const px = -uy * ARROW_HALF;
  const py = ux * ARROW_HALF;
  const r = (v: number) => Math.round(v * 100) / 100;
  return `${r(x)},${r(y)} ${r(bx + px)},${r(by + py)} ${r(bx - px)},${r(by - py)}`;
}

function ShapeGlyph({ s }: { s: DrawShape }) {
  const { x, y, w, h } = rectOf(s);
  const text = s.text || '';

  /* --- text ------------------------------------------------------ */
  if (s.kind === 'text') {
    const lines = text.split('\n');
    return (
      <text x={x} y={y} fontFamily={FONT_FAMILY} fontSize={s.fontSize} fill={s.color}>
        {lines.map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? s.fontSize * 0.9 : s.fontSize * 1.25}>
            {line}
          </tspan>
        ))}
      </text>
    );
  }

  /* --- arrow ----------------------------------------------------- */
  if (s.kind === 'arrow') {
    return (
      <g>
        {/* white casing keeps the arrow readable over busy backgrounds */}
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#ffffff" strokeWidth={s.strokeWidth + 2.2} strokeLinecap="round" />
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.strokeWidth} strokeLinecap="round" />
        <polygon points={arrowHeadPts(s.x2, s.y2, s.x2 - s.x1, s.y2 - s.y1)} fill={s.stroke} />
        {s.arrowDir === 'double' && (
          <polygon points={arrowHeadPts(s.x1, s.y1, s.x1 - s.x2, s.y1 - s.y2)} fill={s.stroke} />
        )}
      </g>
    );
  }

  /* --- solid / dashed rectangle ---------------------------------- */
  const rx = 6;
  if (s.kind === 'rect' || s.kind === 'dashedRect') {
    const dashed = s.kind === 'dashedRect' || s.dashed;
    return (
      <g>
        <rect
          x={x} y={y} width={w} height={h} rx={rx}
          fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
          strokeDasharray={dashed ? '8 5' : undefined}
        />
        {s.headerFill && (
          <>
            <path
              d={`M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${rx} 0 0 1 ${x + w} ${y + rx} V ${y + HDR_H} H ${x} V ${y + rx} A ${rx} ${rx} 0 0 1 ${x + rx} ${y} Z`}
              fill={s.headerFill}
            />
            <text
              x={x + w / 2}
              y={y + HDR_H / 2 + (s.fontSize || 13) * 0.36}
              textAnchor="middle"
              fontFamily={FONT_FAMILY}
              fontSize={s.fontSize || 13}
              fontWeight={600}
              fill={s.color}
            >
              {text}
            </text>
          </>
        )}
      </g>
    );
  }

  /* --- circle / ellipse ------------------------------------------ */
  return (
    <ellipse
      cx={x + w / 2} cy={y + h / 2}
      rx={Math.max(0.5, w / 2)} ry={Math.max(0.5, h / 2)}
      fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
      strokeDasharray={s.dashed ? '8 5' : undefined}
    />
  );
}

/* ---------------------------------------------------------------- */
/* Component                                                         */
/* ---------------------------------------------------------------- */

export interface ContextOpen {
  clientX: number;
  clientY: number;
  modelX: number;
  modelY: number;
  hitId: string | null;
}

export interface DrawCanvasProps {
  shapes: DrawShape[];
  tool: ToolId;
  zoom: number;
  /** camera pan in screen px (model → screen: x*zoom + pan.x); optional so SSR stays simple */
  pan?: { x: number; y: number };
  /** currently selected ids (order preserved; may hold several after a marquee) */
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  /** report a finished change; parent records exactly one history step */
  onCommit: (next: DrawShape[]) => void;
  /** read access to the exportable content <svg> */
  contentRef?: React.Ref<SVGSVGElement>;
  /** right-click on the board (canvas already selected whatever was under it) */
  onContextOpen?: (info: ContextOpen) => void;
}

interface Editing {
  /** null → brand new text being typed */
  id: string | null;
  px: number; // model top-left
  py: number;
  fontSize: number;
  color: string;
  value: string;
  width: number; // css px
}

type Gesture =
  | { mode: 'create'; kind: ShapeKind; dashed?: boolean; dir?: ArrowDir; ax: number; ay: number }
  | { mode: 'connect'; srcId: string; ax: number; ay: number }
  | { mode: 'move'; ids: string[]; sx: number; sy: number; origs: Record<string, DrawShape> }
  | { mode: 'resize'; id: string; key: HandleId }
  | { mode: 'marquee'; ax: number; ay: number; additive: boolean }
  | null;

const MIN_DRAG = 3; // model units before a drag counts as a real draw

function editable(s: DrawShape): boolean {
  return s.kind === 'text' || (s.kind === 'rect' && !!s.headerFill);
}

const isHostable = (s: DrawShape | null | undefined): s is DrawShape =>
  !!s && (s.kind === 'rect' || s.kind === 'dashedRect' || s.kind === 'circle');

const isArrowTool = (t: ToolId) => t === 'arrowSingle' || t === 'arrowDouble';

type DrawToolStyle = ToolStyle;

export default function DrawCanvas({
  shapes,
  tool,
  zoom,
  pan,
  selectedIds,
  onSelect,
  onCommit,
  contentRef,
  onContextOpen,
}: DrawCanvasProps) {
  // Camera: model → screen is `x*zoom + pan`; pan is screen px and may be
  // negative (the world is unbounded, content can live in any quadrant).
  const cam = pan ?? { x: 0, y: 0 };

  const [work, setWork] = useState<DrawShape[]>(shapes);
  const workRef = useRef<DrawShape[]>(shapes);
  const [draft, setDraft] = useState<DrawShape | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [portHost, setPortHost] = useState<string | null>(null);
  const [connectTo, setConnectTo] = useState<string | null>(null);
  // marquee: the rubber-band box being dragged + the ids it currently touches
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [marqueeHit, setMarqueeHit] = useState<string[]>([]);

  const gesture = useRef<Gesture>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const busyRef = useRef(false);
  const idGenRef = useRef<(prefix?: string) => string>(() => 'sh-0');
  // viewport (css px) that the interaction <svg> covers; measured from the root.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [viewSize, setViewSize] = useState({ w: 1200, h: 800 });

  // Sync when the parent model changes from the outside (undo / AI / load).
  useEffect(() => {
    workRef.current = shapes;
    setWork(shapes);
    setConnectTo(null);
  }, [shapes]);

  // Leaving the arrow tools clears the port host.
  useEffect(() => {
    if (!isArrowTool(tool)) setPortHost(null);
  }, [tool]);

  // Keep the interaction <svg> sized to whatever the viewport is right now, so
  // empty infinite space stays clickable everywhere.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r || r.width <= 0 || r.height <= 0) return;
      setViewSize((prev) => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    idGenRef.current = makeShapeIdFactory(workRef.current);
  }, [workRef.current.length, workRef]);

  // Endpoints of attached arrows are always re-derived from their anchors.
  const setWorkBoth = (next: DrawShape[]) => {
    const resolved = resolveConnectors(next);
    workRef.current = resolved;
    setWork(resolved);
  };

  const findShape = (id: string | null) => workRef.current.find((s) => s.id === id) ?? null;

  const toModel = (e: { clientX: number; clientY: number }) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return { x: (e.clientX - left - cam.x) / zoom, y: (e.clientY - top - cam.y) / zoom };
  };

  const styleFor = (t: 'rect' | 'dashedRect' | 'circle' | 'arrowSingle' | 'arrowDouble'): ToolStyle => TOOL_STYLE[t];

  const selectShapeAt = (px: number, py: number): DrawShape | null => {
    const arr = workRef.current;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (hitsShape(arr[i], px, py, 5 / zoom)) return arr[i];
    }
    return null;
  };

  /** Topmost connectable shape under a point (excludes arrows/text + itself). */
  const candidateAt = (px: number, py: number, exclude: string | null): DrawShape | null => {
    const arr = workRef.current;
    for (let i = arr.length - 1; i >= 0; i--) {
      const s = arr[i];
      if (s.id === exclude) continue;
      if (s.kind === 'arrow' || s.kind === 'text') continue;
      if (hitsShape(s, px, py, 8 / zoom)) return s;
    }
    return null;
  };

  const commitWork = (next: DrawShape[]) => {
    setWorkBoth(next);
    setDraft(null);
    setConnectTo(null);
    setMarquee(null);
    setMarqueeHit([]);
    gesture.current = null;
    busyRef.current = false;
    onCommit(workRef.current);
  };

  const cancelGesture = () => {
    setDraft(null);
    setConnectTo(null);
    setMarquee(null);
    setMarqueeHit([]);
    gesture.current = null;
    busyRef.current = false;
  };

  /* ------------------------- pointer handlers ------------------------- */
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; // only the left button draws (middle = pan)
    if (busyRef.current) return;
    (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
    const p = toModel(e);

    if (tool === 'select') {
      const additive = e.ctrlKey || e.metaKey;
      setPortHost(null);

      // Single selection: resize handles first (they sit just outside the box,
      // in empty space, so they must win over starting a marquee).
      if (!additive && selectedIds.length === 1) {
        const one = findShape(selectedIds[0]);
        if (one && one.kind !== 'text') {
          for (const hd of handlesOf(one)) {
            if (Math.abs(hd.x - p.x) <= 9 / zoom && Math.abs(hd.y - p.y) <= 9 / zoom) {
              gesture.current = { mode: 'resize', id: one.id, key: hd.key };
              busyRef.current = true;
              return;
            }
          }
        }
      }

      const hit = selectShapeAt(p.x, p.y);
      if (hit) {
        if (additive) {
          // Ctrl+click toggles this object into/out of the group, no drag
          onSelect(selSet.has(hit.id) ? selectedIds.filter((id) => id !== hit.id) : [...selectedIds, hit.id]);
          return;
        }
        // Drag a whole group when the pressed object is already selected,
        // otherwise select just this one and drag it alone.
        const ids = selSet.has(hit.id) ? [...selectedIds] : [hit.id];
        if (!selSet.has(hit.id)) onSelect([hit.id]);
        const origs: Record<string, DrawShape> = {};
        for (const id of ids) {
          const s = workRef.current.find((x) => x.id === id);
          if (s) origs[id] = s;
        }
        gesture.current = { mode: 'move', ids, sx: p.x, sy: p.y, origs };
        busyRef.current = true;
        return;
      }

      // Empty space: start a marquee. A plain click (no drag) clears instead.
      gesture.current = { mode: 'marquee', ax: p.x, ay: p.y, additive };
      busyRef.current = true;
      return;
    }

    if (tool === 'text') {
      gesture.current = { mode: 'create', kind: 'text', ax: p.x, ay: p.y };
      busyRef.current = true;
      return;
    }

    // Arrow tools: clicking a hostable shape selects it & shows its 4 ports;
    // drawing a line starts from a port. Empty space still draws freehand.
    if (isArrowTool(tool)) {
      const hit = selectShapeAt(p.x, p.y);
      setPortHost(null);
      if (hit) {
        onSelect([hit.id]);
        if (isHostable(hit)) setPortHost(hit.id);
        return;
      }
    }

    const kind: ShapeKind = tool === 'circle' ? 'circle' : tool === 'rect' || tool === 'dashedRect' ? 'rect' : 'arrow';
    gesture.current = {
      mode: 'create',
      kind,
      dashed: tool === 'dashedRect',
      dir: tool === 'arrowDouble' ? 'double' : tool === 'arrowSingle' ? 'single' : undefined,
      ax: p.x,
      ay: p.y,
    };
    busyRef.current = true;
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = toModel(e);

    if (g.mode === 'connect') {
      const src = findShape(g.srcId);
      if (!src) {
        cancelGesture();
        return;
      }
      const from = clipToShape(src, p.x, p.y);
      const dir: ArrowDir = tool === 'arrowDouble' ? 'double' : 'single';
      setDraft(makeArrowShape('__draft', from.x, from.y, p.x, p.y, dir, styleFor(dir === 'double' ? 'arrowDouble' : 'arrowSingle')));
      const t = candidateAt(p.x, p.y, g.srcId);
      setConnectTo(t ? t.id : null);
      return;
    }

    if (g.mode === 'create') {
      const dist = Math.hypot(p.x - g.ax, p.y - g.ay);
      if (g.kind === 'text') return;
      if (dist < MIN_DRAG && !draft) return;
      let prev: DrawShape;
      if (g.kind === 'rect') {
        prev = makeRectShape(g.dashed ? 'dashedRect' : 'rect', '__draft', g.ax, g.ay, p.x, p.y, styleFor(g.dashed ? 'dashedRect' : 'rect'));
      } else if (g.kind === 'circle') {
        prev = makeCircleShape('__draft', g.ax, g.ay, p.x, p.y, styleFor('circle'));
      } else {
        prev = makeArrowShape('__draft', g.ax, g.ay, p.x, p.y, g.dir ?? 'single', styleFor(g.dir === 'double' ? 'arrowDouble' : 'arrowSingle'));
      }
      setDraft(prev);
      return;
    }
    if (g.mode === 'marquee') {
      const r = rectFromCorners(g.ax, g.ay, p.x, p.y);
      setMarquee(r);
      const matched = workRef.current.filter((s) => overlapsRect(s, r)).map((s) => s.id);
      // additive = preview the union with the existing selection
      setMarqueeHit(g.additive ? Array.from(new Set([...selectedIds, ...matched])) : matched);
      return;
    }
    if (g.mode === 'move') {
      const dx = p.x - g.sx;
      const dy = p.y - g.sy;
      const moving = new Set(g.ids);
      const next = workRef.current.map((s) => (moving.has(s.id) ? moveShape(g.origs[s.id] ?? s, dx, dy) : s));
      setWorkBoth(next);
      return;
    }
    if (g.mode === 'resize') {
      const s = findShape(g.id);
      if (!s) return;
      const next = workRef.current.map((sh) => (sh.id === g.id ? resizeWithHandle(s, g.key, p.x, p.y) : sh));
      setWorkBoth(next);
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = toModel(e);

    if (g.mode === 'connect') {
      const dist = Math.hypot(p.x - g.ax, p.y - g.ay);
      const src = findShape(g.srcId);
      if (dist < MIN_DRAG || !src) {
        // a mere click on a port → keep the ports open for another try
        gesture.current = null;
        busyRef.current = false;
        setDraft(null);
        setConnectTo(null);
        return;
      }
      const dir: ArrowDir = tool === 'arrowDouble' ? 'double' : 'single';
      const target = candidateAt(p.x, p.y, g.srcId);
      const shape = makeArrowShape(
        idGenRef.current('a'),
        0, 0, 0, 0,
        dir,
        styleFor(dir === 'double' ? 'arrowDouble' : 'arrowSingle')
      );
      const attached: DrawShape = { ...shape, ca: g.srcId, cb: target ? target.id : null };
      setPortHost(null);
      setConnectTo(null);
      commitWork([...workRef.current, attached]);
      return;
    }

    if (g.mode === 'create') {
      const dist = Math.hypot(p.x - g.ax, p.y - g.ay);
      if (g.kind === 'text') {
        setEditing({ id: null, px: g.ax, py: g.ay, fontSize: 14, color: '#1e293b', value: '', width: 180 });
        gesture.current = null;
        return; // busy stays set until editing closes
      }
      let shape: DrawShape;
      if (g.kind === 'rect') {
        shape = makeRectShape(g.dashed ? 'dashedRect' : 'rect', idGenRef.current('r'), g.ax, g.ay, dist < MIN_DRAG ? g.ax + 150 : p.x, dist < MIN_DRAG ? g.ay + 96 : p.y, styleFor(g.dashed ? 'dashedRect' : 'rect'));
      } else if (g.kind === 'circle') {
        const isClick = dist < MIN_DRAG;
        shape = makeCircleShape(
          idGenRef.current('o'),
          isClick ? g.ax - 45 : Math.min(g.ax, p.x),
          isClick ? g.ay - 45 : Math.min(g.ay, p.y),
          isClick ? g.ax + 45 : Math.max(g.ax, p.x),
          isClick ? g.ay + 45 : Math.max(g.ay, p.y),
          styleFor('circle')
        );
      } else {
        shape = makeArrowShape(idGenRef.current('a'), g.ax, g.ay, dist < MIN_DRAG ? g.ax + 140 : p.x, p.y, g.dir ?? 'single', styleFor(g.dir === 'double' ? 'arrowDouble' : 'arrowSingle'));
      }
      commitWork([...workRef.current, shape]);
      return;
    }

    if (g.mode === 'marquee') {
      const dist = Math.hypot(p.x - g.ax, p.y - g.ay);
      gesture.current = null;
      busyRef.current = false;
      setMarquee(null);
      setMarqueeHit([]);
      if (dist < MIN_DRAG) {
        // a mere click on empty space clears (Ctrl+click keeps the selection)
        if (!g.additive) onSelect([]);
        return;
      }
      const r = rectFromCorners(g.ax, g.ay, p.x, p.y);
      const matched = workRef.current.filter((s) => overlapsRect(s, r)).map((s) => s.id);
      if (g.additive) {
        onSelect(Array.from(new Set([...selectedIds, ...matched])));
      } else {
        onSelect(matched);
      }
      return;
    }
    if (g.mode === 'move') {
      const moving = new Set(g.ids);
      let changed = false;
      for (const id of g.ids) {
        const c = workRef.current.find((s) => s.id === id);
        const o = g.origs[id];
        if (!c || !o) continue;
        if (c.x !== o.x || c.y !== o.y || c.w !== o.w || c.h !== o.h ||
            c.x1 !== o.x1 || c.y1 !== o.y1 || c.x2 !== o.x2 || c.y2 !== o.y2) {
          changed = true;
          break;
        }
      }
      gesture.current = null;
      busyRef.current = false;
      if (changed) onCommit(workRef.current);
      return;
    }
    if (g.mode === 'resize') {
      gesture.current = null;
      busyRef.current = false;
      if (findShape(g.id)) onCommit(workRef.current);
      return;
    }

    gesture.current = null;
  };

  /* ------------------- connect port drag ------------------- */
  const onPortDown = (e: RPointerEvent<SVGGElement>, _side: SideId) => {
    if (busyRef.current) return;
    if (!portHost) return;
    e.stopPropagation();
    e.preventDefault();
    const p = toModel(e);
    (e.currentTarget as SVGGElement).setPointerCapture?.(e.pointerId);
    gesture.current = { mode: 'connect', srcId: portHost, ax: p.x, ay: p.y };
    busyRef.current = true;
  };

  /* ------------------- text editing ------------------- */
  const onDoubleClick = (e: RPointerEvent<SVGSVGElement>) => {
    if (tool !== 'select' || busyRef.current) return;
    const p = toModel(e);
    const hit = selectShapeAt(p.x, p.y);
    if (!hit || !editable(hit)) return;
    // editing is single-object: make the double-clicked object the sole selection
    if (selectedIds.length !== 1 || selectedIds[0] !== hit.id) onSelect([hit.id]);
    const r = rectOf(hit);
    setEditing({
      id: hit.id,
      px: r.x,
      py: hit.kind === 'rect' ? r.y + HDR_H / 2 - (hit.fontSize || 13) * 0.7 : r.y,
      fontSize: hit.fontSize || 13,
      color: hit.color || '#1e293b',
      value: hit.text || '',
      width: Math.max(160, (hit.kind === 'rect' ? r.w : 200) * zoom),
    });
    busyRef.current = true;
  };

  const cancelTextRef = useRef(false);

  const closeEditing = (commit: boolean) => {
    const ed = editing;
    if (!ed) {
      busyRef.current = false;
      return;
    }
    const discard = cancelTextRef.current;
    cancelTextRef.current = false;
    const value = ed.value.trim();
    if (commit && !discard && value) {
      if (ed.id) {
        const next = workRef.current.map((s) => (s.id === ed.id ? refreshTextSize({ ...s, text: value }) : s));
        commitWork(next);
      } else {
        const nextShape = makeTextShape(idGenRef.current('t'), ed.px, ed.py, value, ed.fontSize);
        nextShape.color = ed.color;
        commitWork([...workRef.current, nextShape]);
      }
    }
    setEditing(null);
    busyRef.current = false;
  };

  // Selection: live shapes from the working copy + an O(1) membership set.
  const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selShapes = useMemo(
    () => selectedIds.map((id) => work.find((s) => s.id === id)).filter((s): s is DrawShape => Boolean(s)),
    [selectedIds, work]
  );
  const isDrawing = tool !== 'select' && tool !== 'text';
  const arrowTool = isArrowTool(tool);
  const host = portHost ? findShape(portHost) : null;
  const hostShown = arrowTool && isHostable(host) ? host : null;

  // Export frame: the shapes' real bounds (maybe negative) plus a little air,
  // independent of the current camera.
  const eb = contentBounds(work);
  const PAD = 40;
  const ex = eb ? { x: eb.x - PAD, y: eb.y - PAD, w: eb.w + PAD * 2, h: eb.h + PAD * 2 } : { x: 0, y: 0, w: 1200, h: 800 };
  const vw = Math.max(1, Math.round(viewSize.w));
  const vh = Math.max(1, Math.round(viewSize.h));

  return (
    <div className="dc-root" ref={rootRef}>
      {/* hidden export mirror: shapes at their real model bounds (white bg, no UI chrome) */}
      <svg
        ref={contentRef}
        className="dc-content"
        xmlns="http://www.w3.org/2000/svg"
        width={ex.w}
        height={ex.h}
        viewBox={`${ex.x} ${ex.y} ${ex.w} ${ex.h}`}
        aria-hidden
        style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
      >
        <rect x={ex.x} y={ex.y} width={ex.w} height={ex.h} fill="#ffffff" />
        {work.map((s) => (
          <ShapeGlyph key={s.id} s={s} />
        ))}
      </svg>

      {/* interaction overlay: covers the whole viewport; the camera group maps model → screen */}
      <svg
        ref={overlayRef}
        className="dc-overlay"
        width={vw}
        height={vh}
        viewBox={`0 0 ${vw} ${vh}`}
        style={{
          cursor: arrowTool ? 'default' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          if (!onContextOpen) return;
          e.preventDefault();
          if (busyRef.current) return;
          const p = toModel(e);
          const hit = selectShapeAt(p.x, p.y);
          // right-click on an already-selected object keeps the whole group
          if (hit && !selSet.has(hit.id)) onSelect([hit.id]);
          onContextOpen({ clientX: e.clientX, clientY: e.clientY, modelX: p.x, modelY: p.y, hitId: hit ? hit.id : null });
        }}
      >
        <g transform={`translate(${cam.x}, ${cam.y}) scale(${zoom})`}>
        {work.map((s) => (
          <ShapeGlyph key={s.id} s={s} />
        ))}
        {draft && (
          <ShapeGlyph
            s={{
              ...draft,
              stroke: SEL,
              strokeWidth: 1.4,
              fill: 'none',
              headerFill: null,
            }}
          />
        )}
        {/* selection chrome: a single object gets handles, several get a frame each */}
        {!marquee && selShapes.map((s) => (
          <SelectionFrame key={s.id} shape={s} showHandles={selectedIds.length === 1} />
        ))}

        {/* marquee rubber-band + the objects it currently touches */}
        {marquee && (
          <g>
            <rect
              x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
              fill="rgba(37,99,235,0.10)" stroke={SEL} strokeWidth={1.1} strokeDasharray="4 3"
            />
            {marqueeHit.map((id) => {
              const s = work.find((x) => x.id === id);
              return s ? <SelectionFrame key={id} shape={s} showHandles={false} /> : null;
            })}
          </g>
        )}

        {/* potential drop target while dragging a connector */}
        {connectTo && (() => {
          const t = findShape(connectTo);
          if (!t) return null;
          const r = rectOf(t);
          return (
            <rect
              x={r.x - 3} y={r.y - 3} width={r.w + 6} height={r.h + 6}
              fill="none" stroke={GREEN} strokeWidth={1.6} rx={r.h >= 14 ? 8 : 0}
              strokeDasharray="5 4"
            />
          );
        })()}

        {/* arrow-connect ports on the selected box */}
        {hostShown && (
          <g>
            <rect
              x={hostShown.x - 3} y={hostShown.y - 3}
              width={hostShown.w + 6} height={hostShown.h + 6}
              fill="none" stroke={SEL} strokeWidth={1.2} rx={8}
            />
            {sidePointsOf(hostShown).map((pt) => (
              <g
                key={pt.side}
                onPointerDown={(ev) => onPortDown(ev, pt.side)}
                style={{ cursor: 'crosshair' }}
              >
                <circle cx={pt.x} cy={pt.y} r={12} fill="transparent" />
                <circle cx={pt.x} cy={pt.y} r={5.5} fill="#ffffff" stroke={SEL} strokeWidth={1.5} />
                <line
                  x1={pt.x} y1={pt.y}
                  x2={pt.x + pt.dx * 12} y2={pt.y + pt.dy * 12}
                  stroke={SEL} strokeWidth={1.6} strokeLinecap="round"
                />
                <polygon
                  points={arrowHeadPts(pt.x + pt.dx * 13, pt.y + pt.dy * 13, pt.dx, pt.dy)}
                  fill={SEL}
                />
              </g>
            ))}
          </g>
        )}
        </g>
      </svg>

      {/* text editing */}
      {editing && (
        <textarea
          autoFocus
          className="dc-textarea"
          value={editing.value}
          style={{
            left: editing.px * zoom + cam.x,
            top: editing.py * zoom + cam.y - 12,
            width: editing.width,
            fontSize: editing.fontSize * zoom,
            color: editing.color,
            fontFamily: FONT_FAMILY,
          }}
          onChange={(e) => setEditing((ed) => (ed ? { ...ed, value: e.target.value } : ed))}
          onBlur={() => closeEditing(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // cancel current edit
              e.preventDefault();
              cancelTextRef.current = true;
              (e.currentTarget as HTMLTextAreaElement).blur();
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              // plain Enter commits through blur; Shift+Enter inserts a newline
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).blur();
            }
          }}
          placeholder="输入文字…"
        />
      )}

      {isDrawing && work.length === 0 && (
        <div className="dc-tip">在画板上按住拖拽即可绘制所选图形</div>
      )}
    </div>
  );
}

/**
 * Selection highlight for one shape. A lone selectable object (box / circle /
 * arrow) gets the full chrome — dashed frame + resize handles; everything else
 * (text, or any member of a multi-selection) only gets a dashed frame.
 */
function SelectionFrame({ shape, showHandles }: { shape: DrawShape; showHandles: boolean }) {
  if (showHandles && shape.kind !== 'text') return <SelectionChrome shape={shape} />;
  const r = rectOf(shape);
  const pad = 3;
  const x = r.x - pad;
  const y = r.y - pad;
  const w = Math.max(r.w, 4) + pad * 2;
  const h = Math.max(r.h, 4) + pad * 2;
  const rx = shape.kind === 'arrow' ? 0 : shape.kind === 'circle' ? 12 : shape.kind === 'text' ? 4 : 6;
  return (
    <rect
      x={x} y={y} width={w} height={h}
      rx={Math.min(rx, Math.min(w, h) / 2)}
      fill="none" stroke={SEL} strokeWidth={1.1} strokeDasharray="4 3"
    />
  );
}

function SelectionChrome({ shape }: { shape: DrawShape }) {
  const r = rectOf(shape);
  return (
    <g>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={SEL} strokeWidth={1.1} strokeDasharray="4 3" />
      {handlesOf(shape).map((h) => (
        <rect
          key={h.key}
          x={h.x - HANDLE / 2}
          y={h.y - HANDLE / 2}
          width={HANDLE}
          height={HANDLE}
          fill="#ffffff"
          stroke={SEL}
          strokeWidth={1.4}
          style={{ cursor: h.key === 'a' || h.key === 'b' ? 'crosshair' : 'nwse-resize' }}
        />
      ))}
    </g>
  );
}

export type { DrawToolStyle };
