/**
 * Free vector-board shape model for the Step-0 drawing canvas.
 *
 * The drawing is an array of `DrawShape`s — plain vector primitives with real
 * coordinates. Every element (including content produced by the AI generator)
 * is turned into ordinary shapes, so the user can select, drag, resize and edit
 * them exactly like hand-drawn objects. This file contains the model, geometry /
 * hit-test helpers, and the flattening routine ArchModel → DrawShape[].
 *
 * Geometry convention (model units, origin at top-left of the board):
 *   rect / dashedRect / text  →  bbox x,y,w,h
 *   circle                   →  bbox x,y,w,h (ellipse inscribed; use equal w/h for a circle)
 *   arrow                    →  endpoints x1,y1 → x2,y2
 */

import { layoutModel } from './layout';
import { measureText } from './text';
import {
  BOUNDARY_STYLE,
  CATEGORY_STYLE,
  FLOW_COLOR,
  FONT_STACK,
  ITEM_STYLE,
  SERVICE_FILL,
} from './colors';
import type { ArchModel } from './types';

export type ToolId = 'select' | 'rect' | 'dashedRect' | 'circle' | 'arrowSingle' | 'arrowDouble' | 'text';
export type ShapeKind = 'rect' | 'dashedRect' | 'circle' | 'arrow' | 'text';
export type ArrowDir = 'single' | 'double';
export type HandleId =
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  | 'a' | 'b';

export interface DrawShape {
  id: string;
  kind: ShapeKind;
  /** bbox (model units); meaningful for all kinds except `arrow` */
  x: number;
  y: number;
  w: number;
  h: number;
  /** arrow endpoints (only used when kind === 'arrow') */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** appearance */
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashed: boolean;
  /** arrow direction (kind === 'arrow') */
  arrowDir: ArrowDir;
  /**
   * Attached anchors (only used when kind === 'arrow'): the id of the box /
   * circle each endpoint sticks to (null = free end). When an anchor is set,
   * the endpoint coordinates are re-derived from the anchor shape every time
   * anything moves/resizes, so attached arrows follow their shapes.
   */
  ca: string | null;
  cb: string | null;
  /** textual content */
  text: string;
  fontSize: number;
  color: string;
  /** when set and kind === 'rect': draw a header band and render `text` there */
  headerFill: string | null;
  /** draw a light backdrop behind text (arrow / free labels) */
  labelBg: boolean;
}

/* ---------------------------------------------------------------- */
/* Default styles for the toolbox tools                              */
/* ---------------------------------------------------------------- */

export const STROKE_DEF = '#334155';
export const BORDER_GRAY = '#64748b';
export const TEXT_DEF = '#1e293b';
export const FLOW_GRAY = FLOW_COLOR;

export interface ToolStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashed: boolean;
  fontSize: number;
  color: string;
  headerFill: string | null;
  labelBg: boolean;
}

export const TOOL_STYLE: Record<Exclude<ToolId, 'select' | 'text'>, ToolStyle> = {
  rect:        { fill: '#ffffff', stroke: STROKE_DEF, strokeWidth: 1.8, dashed: false, fontSize: 13, color: '#1e293b', headerFill: null, labelBg: false },
  dashedRect:  { fill: 'rgba(248,250,252,0.6)', stroke: BORDER_GRAY, strokeWidth: 1.6, dashed: true, fontSize: 13, color: '#475569', headerFill: null, labelBg: false },
  circle:      { fill: '#ffffff', stroke: STROKE_DEF, strokeWidth: 1.8, dashed: false, fontSize: 12, color: '#1e293b', headerFill: null, labelBg: false },
  arrowSingle: { fill: 'none', stroke: FLOW_GRAY, strokeWidth: 1.8, dashed: false, fontSize: 12, color: FLOW_GRAY, headerFill: null, labelBg: false },
  arrowDouble: { fill: 'none', stroke: FLOW_GRAY, strokeWidth: 1.8, dashed: false, fontSize: 12, color: FLOW_GRAY, headerFill: null, labelBg: false },
};

export const DEFAULT_FONT = 14;

/* ---------------------------------------------------------------- */
/* Id helpers                                                        */
/* ---------------------------------------------------------------- */

/** Stable, collision-free id factory inside a list of shapes. */
export function makeShapeIdFactory(shapes: DrawShape[]) {
  const used = new Set(shapes.map((s) => s.id));
  const counters = new Map<string, number>();
  return (prefix = 'sh'): string => {
    for (let i = (counters.get(prefix) ?? 0) + 1; ; i++) {
      counters.set(prefix, i);
      const id = `${prefix}-${i}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };
}

/* ---------------------------------------------------------------- */
/* Geometry helpers                                                  */
/* ---------------------------------------------------------------- */

function blankShape(kind: ShapeKind): DrawShape {
  return {
    id: '',
    kind,
    x: 0, y: 0, w: 0, h: 0,
    x1: 0, y1: 0, x2: 0, y2: 0,
    fill: '#ffffff', stroke: '#334155', strokeWidth: 1.8, dashed: false,
    arrowDir: 'single', ca: null, cb: null, text: '', fontSize: DEFAULT_FONT, color: TEXT_DEF,
    headerFill: null, labelBg: false,
  };
}

/** Canonical bbox for any shape (arrows derive it from their endpoints). */
export function rectOf(s: DrawShape): { x: number; y: number; w: number; h: number } {
  if (s.kind === 'arrow') {
    const x = Math.min(s.x1, s.x2);
    const y = Math.min(s.y1, s.y2);
    return { x, y, w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
  }
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}

export function boundsOf(s: DrawShape): { x: number; y: number; w: number; h: number } {
  const r = rectOf(s);
  if (s.kind === 'text') {
    // measured size is authoritative; pad slightly for hit target
    return { x: r.x, y: r.y, w: Math.max(r.w, 12), h: Math.max(r.h, 14) };
  }
  return r;
}

export function setRect(s: DrawShape, x: number, y: number, w: number, h: number): DrawShape {
  return { ...s, x, y, w, h };
}

/** Move a shape by (dx,dy) in model units. */
export function moveShape(s: DrawShape, dx: number, dy: number): DrawShape {
  const g = { ...s };
  if (g.kind === 'arrow') {
    g.x1 += dx; g.y1 += dy; g.x2 += dx; g.y2 += dy;
  } else {
    g.x += dx; g.y += dy;
  }
  return g;
}

/** Minimum on-screen dimension we keep when resizing boxes. */
const MIN_SIDE = 8;

export function clampRect(cx: number, cy: number, cw: number, ch: number) {
  const w = Math.max(MIN_SIDE, Math.abs(cw));
  const h = Math.max(MIN_SIDE, Math.abs(ch));
  const x = cw < 0 ? cx - w : cx;
  const y = ch < 0 ? cy - h : cy;
  return { x, y, w, h };
}

/** Turn two opposite corner points (from a drag) into a canonical rect. */
export function rectFromCorners(ax: number, ay: number, bx: number, by: number) {
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  return { x, y, w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Do two axis-aligned rects overlap (edge-touching counts)? */
export function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** Does a shape's hit box (boundsOf: text gets a minimum size) touch `r`? */
export function overlapsRect(s: DrawShape, r: { x: number; y: number; w: number; h: number }): boolean {
  return rectsOverlap(boundsOf(s), r);
}

/**
 * Resize a shape through one of its selection handles. `key` is a HandleId;
 * `px/py` is the new pointer position in model units. Boxes keep their
 * opposite corner fixed (drag can flip, then we normalise back out).
 */
export function resizeWithHandle(s: DrawShape, key: HandleId, px: number, py: number): DrawShape {
  if (s.kind === 'arrow') {
    if (key === 'a') return { ...s, x1: px, y1: py };
    if (key === 'b') return { ...s, x2: px, y2: py };
    return s;
  }
  // rect / dashedRect / circle / text share bbox-resize behaviour.
  const r = rectOf(s);
  let left = r.x; let top = r.y; let right = r.x + r.w; let bottom = r.y + r.h;
  if (key.includes('w')) left = px;
  if (key.includes('e')) right = px;
  if (key.includes('n')) top = py;
  if (key.includes('s')) bottom = py;
  // keep a minimum size anchored to the opposite corner when flipped
  const x = Math.min(left, right);
  const y = Math.min(top, bottom);
  const w = Math.max(MIN_SIDE, Math.abs(right - left));
  const h = Math.max(MIN_SIDE, Math.abs(bottom - top));
  return setRect({ ...s }, x, y, w, h);
}

/** Selection handles (model coords). Boxes → 8; arrows → 2 endpoints; text → none. */
export function handlesOf(s: DrawShape): { key: HandleId; x: number; y: number }[] {
  if (s.kind === 'text') return [];
  if (s.kind === 'arrow') {
    return [
      { key: 'a', x: s.x1, y: s.y1 },
      { key: 'b', x: s.x2, y: s.y2 },
    ];
  }
  const r = rectOf(s);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return [
    { key: 'nw', x: r.x, y: r.y },
    { key: 'n', x: cx, y: r.y },
    { key: 'ne', x: r.x + r.w, y: r.y },
    { key: 'e', x: r.x + r.w, y: cy },
    { key: 'se', x: r.x + r.w, y: r.y + r.h },
    { key: 's', x: cx, y: r.y + r.h },
    { key: 'sw', x: r.x, y: r.y + r.h },
    { key: 'w', x: r.x, y: cy },
  ];
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Does `px,py` hit this shape (within `tol` model units)? */
export function hitsShape(s: DrawShape, px: number, py: number, tol: number): boolean {
  const t = tol;
  if (s.kind === 'arrow') {
    return distToSeg(px, py, s.x1, s.y1, s.x2, s.y2) <= Math.max(t, s.strokeWidth);
  }
  if (s.kind === 'circle') {
    const r = rectOf(s);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const rx = Math.max(1, r.w / 2 + t);
    const ry = Math.max(1, r.h / 2 + t);
    return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
  }
  const b = boundsOf(s);
  return px >= b.x - t && px <= b.x + b.w + t && py >= b.y - t && py <= b.y + b.h + t;
}

/** Text geometry: re-measure w/h from current content. */
export function refreshTextSize(s: DrawShape): DrawShape {
  if (s.kind !== 'text') return s;
  const lines = (s.text || '').split('\n');
  const font = s.fontSize || DEFAULT_FONT;
  const w = Math.max(12, ...lines.map((l) => measureText(l, font)));
  const h = Math.max(font * 1.3, lines.length * font * 1.3);
  return { ...s, w, h };
}

export function textWidth(text: string, font: number): number {
  if (!text) return 0;
  return Math.max(...text.split('\n').map((l) => measureText(l, font)));
}

/* ---------------------------------------------------------------- */
/* Connector geometry (attached arrows)                              */
/* ---------------------------------------------------------------- */

export type SideId = 'n' | 'e' | 's' | 'w';

export interface SidePoint {
  side: SideId;
  x: number;
  y: number;
  /** outward unit direction from that edge */
  dx: number;
  dy: number;
}

/** Centre of a shape's bbox. */
export function shapeCenter(s: DrawShape): { x: number; y: number } {
  const r = rectOf(s);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** The four mid-edge points (used to draw the arrow-connect ports). */
export function sidePointsOf(s: DrawShape): SidePoint[] {
  const r = rectOf(s);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return [
    { side: 'n', x: cx, y: r.y, dx: 0, dy: -1 },
    { side: 'e', x: r.x + r.w, y: cy, dx: 1, dy: 0 },
    { side: 's', x: cx, y: r.y + r.h, dx: 0, dy: 1 },
    { side: 'w', x: r.x, y: cy, dx: -1, dy: 0 },
  ];
}

/**
 * Point where the segment from an outside point `(fx,fy)` enters `s`'s
 * boundary — rectangle edges, or the ellipse perimeter for circles. Attached
 * arrow endpoints sit here so the line clips neatly to its shape.
 */
export function clipToShape(s: DrawShape, fx: number, fy: number): { x: number; y: number } {
  const c = shapeCenter(s);
  let dx = fx - c.x;
  let dy = fy - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return c;
  dx /= len;
  dy /= len;
  if (s.kind === 'circle') {
    const r = rectOf(s);
    const rx = Math.max(0.5, r.w / 2);
    const ry = Math.max(0.5, r.h / 2);
    const t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  // axis-aligned box — slab clip along the ray centre→outside point
  const r = rectOf(s);
  let sx = Infinity;
  let sy = Infinity;
  if (dx > 1e-9) sx = (r.x + r.w - c.x) / dx;
  else if (dx < -1e-9) sx = (r.x - c.x) / dx;
  if (dy > 1e-9) sy = (r.y + r.h - c.y) / dy;
  else if (dy < -1e-9) sy = (r.y - c.y) / dy;
  const tt = Math.min(sx, sy);
  const t = Number.isFinite(tt) ? tt : 0;
  return { x: c.x + dx * Math.max(0, t), y: c.y + dy * Math.max(0, t) };
}

function anchorOf(s: DrawShape | undefined): DrawShape | null {
  if (!s) return null;
  if (s.kind === 'arrow' || s.kind === 'text') return null;
  return s;
}

/**
 * Re-derive the endpoints of every attached arrow from its anchors, and drop
 * anchors that point at a shape that no longer exists (end becomes free). Pure
 * & idempotent — freehand arrows pass through untouched.
 */
export function resolveConnectors(shapes: DrawShape[]): DrawShape[] {
  const byId = new Map<string, DrawShape>();
  for (const s of shapes) byId.set(s.id, s);
  return shapes.map((s) => {
    if (s.kind !== 'arrow') return s;
    const a = s.ca ? anchorOf(byId.get(s.ca)) : null;
    const b = s.cb ? anchorOf(byId.get(s.cb)) : null;
    const farA = b ? shapeCenter(b) : { x: s.x2, y: s.y2 };
    const farB = a ? shapeCenter(a) : { x: s.x1, y: s.y1 };
    const pa = a ? clipToShape(a, farA.x, farA.y) : { x: s.x1, y: s.y1 };
    const pb = b ? clipToShape(b, farB.x, farB.y) : { x: s.x2, y: s.y2 };
    return {
      ...s,
      ca: a ? s.ca : null,
      cb: b ? s.cb : null,
      x1: pa.x, y1: pa.y,
      x2: pb.x, y2: pb.y,
    };
  });
}

/* ---------------------------------------------------------------- */
/* Content bounds (used to auto-size the board)                      */
/* ---------------------------------------------------------------- */

export function contentBounds(shapes: DrawShape[]): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const s of shapes) {
    const b = boundsOf(s);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (shapes.length === 0) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Default "paper" size shown while the board is empty. */
export const BOARD_MIN_W = 1000;
export const BOARD_MIN_H = 640;
export const BOARD_PAD = 64;

/** Whiteboard extents (model units): content bbox padded, never below the min. */
export function boardMetrics(shapes: DrawShape[]): { w: number; h: number } {
  const b = contentBounds(shapes);
  if (!b) return { w: BOARD_MIN_W, h: BOARD_MIN_H };
  return {
    w: Math.max(BOARD_MIN_W, Math.ceil(b.x + b.w + BOARD_PAD)),
    h: Math.max(BOARD_MIN_H, Math.ceil(b.y + b.h + BOARD_PAD)),
  };
}

/* ---------------------------------------------------------------- */
/* Creation helpers (drag → shape)                                   */
/* ---------------------------------------------------------------- */

export function makeRectShape(
  kind: 'rect' | 'dashedRect',
  id: string,
  ax: number, ay: number, bx: number, by: number,
  st: ToolStyle,
  overrides?: Partial<DrawShape>
): DrawShape {
  const { x, y, w, h } = rectFromCorners(ax, ay, bx, by);
  return {
    ...blankShape(kind), id, x, y, w, h,
    fill: st.fill, stroke: st.stroke, strokeWidth: st.strokeWidth, dashed: st.dashed,
    fontSize: st.fontSize, color: st.color, headerFill: st.headerFill, labelBg: st.labelBg,
    ...(overrides ?? {}),
  };
}

export function makeCircleShape(
  id: string,
  ax: number, ay: number, bx: number, by: number,
  st: ToolStyle
): DrawShape {
  const r = rectFromCorners(ax, ay, bx, by);
  return {
    ...blankShape('circle'), id,
    x: r.x, y: r.y, w: r.w, h: r.h,
    fill: st.fill, stroke: st.stroke, strokeWidth: st.strokeWidth,
    fontSize: st.fontSize, color: st.color, labelBg: st.labelBg,
  };
}

export function makeArrowShape(
  id: string,
  ax: number, ay: number, bx: number, by: number,
  dir: ArrowDir,
  st: ToolStyle
): DrawShape {
  return {
    ...blankShape('arrow'), id,
    x1: ax, y1: ay, x2: bx, y2: by,
    stroke: st.stroke, strokeWidth: st.strokeWidth, arrowDir: dir,
    labelBg: st.labelBg,
  };
}

export function makeTextShape(id: string, x: number, y: number, text: string, font: number): DrawShape {
  const s: DrawShape = {
    ...blankShape('text'), id, x, y, text, fontSize: font,
    color: TEXT_DEF, fill: 'none', stroke: 'none',
  };
  return refreshTextSize(s);
}

/* ---------------------------------------------------------------- */
/* Sanitizer: best-effort coercion for localStorage / JSON import    */
/* ---------------------------------------------------------------- */

const SHAPE_KINDS: ShapeKind[] = ['rect', 'dashedRect', 'circle', 'arrow', 'text'];

const numOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const strOr = (v: unknown, d: string): string => (typeof v === 'string' ? v.slice(0, 400) : d);
const boolOr = (v: unknown): boolean => v === true;

/** Coerce arbitrary parsed data into a canonical DrawShape list (never throws). */
export function sanitizeShapes(input: unknown): DrawShape[] {
  if (!Array.isArray(input)) return [];
  const used = new Set<string>();
  const counters = new Map<string, number>();
  const ensureId = (raw: unknown, prefix: string): string => {
    const proposed = strOr(raw, '').replace(/\s+/g, '-');
    if (/^[A-Za-z0-9_-]{1,64}$/.test(proposed) && !used.has(proposed)) {
      used.add(proposed);
      return proposed;
    }
    for (let i = (counters.get(prefix) ?? 0) + 1; ; i++) {
      counters.set(prefix, i);
      const id = `${prefix}-${i}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };

  const out: DrawShape[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const kind = o.kind as ShapeKind;
    if (!SHAPE_KINDS.includes(kind)) continue;

    const base = blankShape(kind);
    const s: DrawShape = {
      ...base,
      id: ensureId(o.id, kind === 'rect' ? 'r' : kind === 'arrow' ? 'a' : kind === 'circle' ? 'o' : 't'),
      x: numOr(o.x, 0),
      y: numOr(o.y, 0),
      w: Math.max(0, numOr(o.w, 100)),
      h: Math.max(0, numOr(o.h, 60)),
      x1: numOr(o.x1, 0),
      y1: numOr(o.y1, 0),
      x2: numOr(o.x2, 0),
      y2: numOr(o.y2, 0),
      fill: strOr(o.fill, '#ffffff'),
      stroke: strOr(o.stroke, '#334155'),
      strokeWidth: Math.max(0.5, numOr(o.strokeWidth, 1.6)),
      dashed: boolOr(o.dashed),
      arrowDir: o.arrowDir === 'double' ? 'double' : 'single',
      ca: typeof o.ca === 'string' && o.ca ? o.ca : null,
      cb: typeof o.cb === 'string' && o.cb ? o.cb : null,
      text: strOr(o.text, ''),
      fontSize: Math.max(6, numOr(o.fontSize, 13)),
      color: strOr(o.color, '#1e293b'),
      headerFill: o.headerFill ? strOr(o.headerFill, '') : null,
      labelBg: boolOr(o.labelBg),
    };
    out.push(s.kind === 'text' ? refreshTextSize(s) : s);
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Flatten an ArchModel (AI result) into editable shapes             */
/* ---------------------------------------------------------------- */

const HEADER_TEXT_H = 24; // component caption band

function flattenLabel(
  out: DrawShape[],
  id: string,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  color: string,
  align: 'start' | 'middle' | 'end',
  bg = false
) {
  if (!text) return;
  const w = textWidth(text, fontSize);
  let px = x;
  if (align === 'middle') px = x - w / 2;
  else if (align === 'end') px = x - w;
  const s = makeTextShape(id, Math.round(px), Math.round(y - fontSize * 0.95), text, fontSize);
  s.color = color;
  s.labelBg = bg;
  out.push(s);
}

/**
 * Lay the semantic model out and emit ordinary, editable shapes for it.
 * Component names stay glued to their box (header band); everything else is
 * emitted as independent shapes the user can freely rearrange afterwards.
 */
export function flattenArchModel(model: ArchModel): DrawShape[] {
  const result = layoutModel(model);
  const out: DrawShape[] = [];

  /* ---- item outer frame ---- */
  const item = result.item;
  out.push({
    ...blankShape('dashedRect'),
    id: `frame-${model.item.id || 'item'}`,
    x: item.x, y: item.y, w: item.w, h: item.h,
    fill: ITEM_STYLE.fill, stroke: ITEM_STYLE.stroke, strokeWidth: 1.5, dashed: true,
    fontSize: 13, color: ITEM_STYLE.text, labelBg: false,
  });
  flattenLabel(out, `frame-title-item`, item.x + 12, item.y + 26, model.item.name, 16, ITEM_STYLE.text, 'start');

  /* ---- boundaries (dashed rect + title) ---- */
  for (const b of result.boundaries) {
    out.push({
      ...blankShape('dashedRect'),
      id: `frame-${b.id}`,
      x: b.x, y: b.y, w: b.w, h: b.h,
      fill: BOUNDARY_STYLE.fill, stroke: BOUNDARY_STYLE.stroke, strokeWidth: 1.5, dashed: true,
      fontSize: 13, color: BOUNDARY_STYLE.text,
    });
    flattenLabel(out, `frame-title-${b.id}`, b.x + 12, b.y + 15, b.name, 13, BOUNDARY_STYLE.text, 'start');
  }

  /* ---- component boxes (solid rect + glued header name) ---- */
  for (const c of result.components) {
    const style = CATEGORY_STYLE[c.category];
    out.push({
      ...blankShape('rect'),
      id: `box-${c.id}`,
      x: c.x, y: c.y, w: c.w, h: c.h,
      fill: style.fill, stroke: style.stroke, strokeWidth: 1.6, dashed: false,
      text: c.name, fontSize: 13, color: style.text, headerFill: style.headerFill,
    });
  }

  /* ---- service circles + free labels ---- */
  for (const a of result.services) {
    const host = result.components.find((cc) => cc.id === a.componentId);
    const ring = host ? CATEGORY_STYLE[host.category].stroke : CATEGORY_STYLE.hardware.stroke;
    const r = a.r || 7;
    out.push({
      ...blankShape('circle'),
      id: `dot-${a.id}`,
      x: a.cx - r, y: a.cy - r, w: r * 2, h: r * 2,
      fill: SERVICE_FILL, stroke: ring, strokeWidth: 1.5,
    });
    flattenLabel(out, `dot-label-${a.id}`, a.label.x, a.label.y, a.label.text, 12, '#334155', a.label.anchor);
  }

  /* ---- flows (arrow + optional label pill) ---- */
  for (const f of result.flows) {
    out.push({
      ...blankShape('arrow'),
      id: `flow-${f.id}`,
      x1: f.x0, y1: f.y0, x2: f.x1, y2: f.y1,
      stroke: FLOW_COLOR, strokeWidth: 1.7, arrowDir: f.arrow,
    });
    if (f.label) {
      flattenLabel(
        out,
        `flow-label-${f.id}`,
        f.labelPoint?.x ?? (f.x0 + f.x1) / 2,
        f.labelPoint?.y ?? (f.y0 + f.y1) / 2,
        f.label,
        12,
        FLOW_COLOR,
        'middle',
        true
      );
    }
  }

  return out;
}

/** Font stack reused at render time (export-safe system fonts). */
export const FONT_FAMILY = FONT_STACK;
export { HEADER_TEXT_H };
