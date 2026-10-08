/**
 * Deterministic auto-layout for the ISO/SAE 21434 architecture image.
 *
 * The semantic ArchModel carries no coordinates; this module derives, for every
 * element, a geometry the SVG renderer (`render.tsx`) consumes directly:
 *
 *  - components  -> solid rounded rectangles; hosted services render as a row of
 *                   small circles ("chips") inside the body. Each circle is the
 *                   service port that data-flows attach to.
 *  - boundaries  -> dashed rectangles wrapping their member components
 *  - the item    -> the outer dashed frame, title band at top
 *  - external components -> laid out BELOW the item frame (outside the boundary)
 *  - flows       -> straight arrows between endpoints; endpoints may be a service
 *                   circle or a component border (service<->service,
 *                   service<->component, component<->component all allowed)
 *
 * Rendering order places lines ABOVE the pale component fills but BELOW the
 * chips/labels so straight-line routing stays legible for this version.
 */
import type {
  ArchModel,
  BoundaryBox,
  Component,
  ComponentBox,
  EndpointRef,
  Flow,
  FlowGeom,
  LayoutResult,
  Rect,
  Service,
  ServiceAnchor,
} from './types';
import { measureText, truncateToWidth } from './text';

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

const NAME_FONT = 14;
const SVC_FONT = 12;

const MARGIN = 28; // blank border around the whole drawing
const PAD = 26; // padding between item frame border and its content
const ITEM_TITLE_H = 36; // item title band height (inside the item frame, top)
const GAP_X = 46; // horizontal gap between level columns
const GAP_Y = 20; // vertical gap between stacked members/units
const B_PAD = 16; // boundary padding around its member stack
const B_HEADER_H = 24; // boundary title band height (inside the boundary frame)
const EXT_GAP = 40; // vertical gap between item frame bottom and the external band
const EXT_ROW_GAP = 30; // vertical gap between external rows

const HEADER_H = 30; // component name band
const BODY_PAD_X = 12;
const BODY_PAD_TOP = 10;
const BODY_PAD_BOTTOM = 12;
const DOT_R = 7; // service circle radius
const TEXT_GAP = 5; // gap between service circle and its label
const ROW_H = 22;
const ROW_GAP = 6;
const CHIP_TEXT_CAP = 120; // px cap for a single service label estimate

const MIN_COMP_W = 150;
const MAX_COMP_W = 320;
const MIN_ITEM_W = 460;

interface Pt {
  x: number;
  y: number;
}

interface LayoutUnit {
  key: string;
  kind: 'root' | 'boundary' | 'external';
  boundaryId?: string;
  name: string;
  members: string[]; // component ids
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ------------------------------------------------------------------ */
/* Text & chip measurement                                             */
/* ------------------------------------------------------------------ */

function chipWidthFor(name: string): number {
  return DOT_R * 2 + TEXT_GAP + Math.min(measureText(name, SVC_FONT), CHIP_TEXT_CAP);
}

/** Group services into rows that fit inside `compW`, return the rows. */
function chipRows(services: Service[], compW: number): Service[][] {
  const inner = Math.max(compW - 2 * BODY_PAD_X, 40);
  const rows: Service[][] = [];
  let cur: Service[] = [];
  let used = 0;
  for (const s of services) {
    const cw = chipWidthFor(s.name);
    const sep = used > 0 ? 8 : 0;
    if (used > 0 && used + sep + cw > inner) {
      if (cur.length) rows.push(cur);
      cur = [s];
      used = cw;
    } else {
      if (used > 0) used += sep;
      used += cw;
      cur.push(s);
    }
  }
  if (cur.length) rows.push(cur);
  if (!rows.length) rows.push([]);
  return rows;
}

function measureComponent(services: Service[], name: string): { w: number; h: number } {
  const nameW = measureText(name, NAME_FONT);
  let maxSvcW = 0;
  for (const s of services) maxSvcW = Math.max(maxSvcW, chipWidthFor(s.name));
  const desired = clamp(Math.max(nameW + 24, maxSvcW + 8, MIN_COMP_W), MIN_COMP_W, MAX_COMP_W);
  const rows = chipRows(services, desired).length;
  const h = HEADER_H + BODY_PAD_TOP + rows * ROW_H + (rows - 1) * ROW_GAP + BODY_PAD_BOTTOM;
  return { w: desired, h: Math.round(h) };
}

/** Absolute chip positions inside an already placed component box. */
function placeChips(services: Service[], box: Rect): ServiceAnchor[] {
  const rows = chipRows(services, box.w);
  const chips: ServiceAnchor[] = [];
  let y = box.y + HEADER_H + BODY_PAD_TOP + ROW_H / 2;
  const inner = Math.max(box.w - 2 * BODY_PAD_X, 40);
  for (const row of rows) {
    let x = box.x + BODY_PAD_X + DOT_R;
    for (const s of row) {
      const cx = x;
      chips.push({
        id: s.id,
        componentId: s.componentId,
        cx,
        cy: y,
        r: DOT_R,
        label: {
          x: cx + DOT_R + TEXT_GAP,
          y: y + SVC_FONT * 0.36,
          anchor: 'start',
          text: truncateToWidth(s.name, inner - DOT_R * 2 - TEXT_GAP, SVC_FONT),
        },
      });
      x += chipWidthFor(s.name) + 8;
    }
    y += ROW_H + ROW_GAP;
  }
  return chips;
}

/* ------------------------------------------------------------------ */
/* Longest-path layering over the directed unit graph                  */
/* ------------------------------------------------------------------ */

function unitLevels(unitKeys: string[], edges: Array<[string, string]>): Map<string, number> {
  const stable = new Map<string, number>(unitKeys.map((k, i) => [k, i]));
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const k of unitKeys) {
    adj.set(k, []);
    indeg.set(k, 0);
  }
  for (const [a, b] of edges) {
    if (a === b) continue;
    if (!adj.has(a) || !adj.has(b)) continue;
    adj.get(a)!.push(b);
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
  }
  const ready = unitKeys
    .filter((k) => (indeg.get(k) ?? 0) === 0)
    .sort((a, b) => stable.get(a)! - stable.get(b)!);
  const topo: string[] = [];
  let head = 0;
  while (head < ready.length) {
    const u = ready[head++];
    topo.push(u);
    for (const v of adj.get(u)!) {
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if (indeg.get(v) === 0) ready.push(v);
    }
  }
  const seen = new Set(topo);
  for (const k of unitKeys) if (!seen.has(k)) topo.push(k); // cyclic leftovers, stable order

  const dist = new Map<string, number>(unitKeys.map((k) => [k, 0]));
  for (const u of topo) {
    const du = dist.get(u) ?? 0;
    for (const v of adj.get(u)!) dist.set(v, Math.max(dist.get(v) ?? 0, du + 1));
  }
  return dist;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** First point of `rect` border hit when moving from `center` toward `from`. */
function borderPoint(rect: Rect, center: Pt, from: Pt): Pt {
  const dx = from.x - center.x;
  const dy = from.y - center.y;
  if (dx === 0 && dy === 0) return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  let t = Number.POSITIVE_INFINITY;
  if (dx > 0) t = Math.min(t, (rect.x + rect.w - center.x) / dx);
  else if (dx < 0) t = Math.min(t, (rect.x - center.x) / dx);
  if (dy > 0) t = Math.min(t, (rect.y + rect.h - center.y) / dy);
  else if (dy < 0) t = Math.min(t, (rect.y - center.y) / dy);
  if (!Number.isFinite(t)) return center;
  return { x: center.x + t * dx, y: center.y + t * dy };
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

function norm(from: Pt, to: Pt): { ux: number; uy: number; len: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len, len };
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

export function layoutModel(model: ArchModel): LayoutResult {
  const warnings: string[] = [];
  const compById = new Map(model.components.map((c) => [c.id, c]));
  const svcByComp = new Map<string, Service[]>();
  for (const s of model.services) {
    const arr = svcByComp.get(s.componentId) ?? [];
    arr.push(s);
    svcByComp.set(s.componentId, arr);
  }

  const compSize = new Map<string, { w: number; h: number }>();
  for (const c of model.components) {
    compSize.set(c.id, measureComponent(svcByComp.get(c.id) ?? [], c.name));
  }

  /* ---- build layout units ---------------------------------------- */
  const byBoundary = new Map<string, LayoutUnit>();
  const unitOf = new Map<string, string>();
  const units: LayoutUnit[] = [];
  const rootUnit: LayoutUnit = { key: 'root', kind: 'root', name: '', members: [] };

  for (const b of model.boundaries) {
    const u: LayoutUnit = { key: b.id, kind: 'boundary', boundaryId: b.id, name: b.name, members: [] };
    units.push(u);
    byBoundary.set(b.id, u);
  }
  for (const c of model.components) {
    let u: LayoutUnit;
    if (c.isExternal) {
      u = { key: `ext-${c.id}`, kind: 'external', name: c.name, members: [c.id] };
      units.push(u);
    } else if (c.boundaryId && byBoundary.has(c.boundaryId)) {
      u = byBoundary.get(c.boundaryId)!;
    } else {
      u = rootUnit;
    }
    u.members.push(c.id);
    unitOf.set(c.id, u.key);
  }
  if (rootUnit.members.length > 0) units.push(rootUnit);

  const internalUnits = units.filter((u) => u.kind !== 'external');
  const extUnits = units.filter((u) => u.kind === 'external');

  // flow edges between distinct units
  const edges: Array<[string, string]> = [];
  for (const f of model.flows) {
    const a = unitOf.get(hostOf(f.source, model));
    const b = unitOf.get(hostOf(f.target, model));
    if (a && b && a !== b) edges.push([a, b]);
  }

  /* ---- place internal units in left→right level columns ---------- */
  const levels = unitLevels(internalUnits.map((u) => u.key), edges);
  const byLevel = new Map<number, LayoutUnit[]>();
  for (const u of internalUnits) {
    const lv = levels.get(u.key) ?? 0;
    const arr = byLevel.get(lv) ?? [];
    arr.push(u);
    byLevel.set(lv, arr);
  }
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);

  const compBoxes = new Map<string, Rect>(); // local coords (content origin)
  const boundaryFrames: Array<{ id: string; name: string; x: number; y: number; w: number; h: number }> = [];
  let curX = 0;
  let contentW = 0;
  let contentBottom = 0;

  for (const lv of sortedLevels) {
    const colUnits = (byLevel.get(lv) ?? []).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    let colW = 0;
    let yC = 0;
    let colBottom = 0;
    for (const u of colUnits) {
      const mem = u.members
        .map((id) => ({ id, comp: compById.get(id), size: compSize.get(id) }))
        .filter((m): m is { id: string; comp: Component; size: { w: number; h: number } } => !!m.comp && !!m.size);
      if (u.kind === 'boundary' && !mem.length) {
        // empty boundary placeholder
        const bw = 180;
        const bh = B_HEADER_H + B_PAD * 2;
        boundaryFrames.push({ id: u.boundaryId ?? u.key, name: u.name, x: curX, y: yC, w: bw, h: bh });
        colW = Math.max(colW, bw);
        colBottom = Math.max(colBottom, yC + bh);
        yC = colBottom + GAP_Y;
        continue;
      }
      if (!mem.length) continue;

      const memberTop = u.kind === 'boundary' ? B_HEADER_H + B_PAD : 0;
      let y = yC + memberTop;
      let maxW = 0;
      for (const m of mem) {
        compBoxes.set(m.id, { x: curX, y, w: m.size.w, h: m.size.h });
        maxW = Math.max(maxW, m.size.w);
        y += m.size.h + GAP_Y;
      }
      const contentH = Math.max(0, y - GAP_Y - (yC + memberTop));

      if (u.kind === 'boundary') {
        const bw = maxW + B_PAD * 2;
        const bh = memberTop + contentH + B_PAD;
        boundaryFrames.push({ id: u.boundaryId ?? u.key, name: u.name, x: curX - B_PAD, y: yC, w: bw, h: bh });
        maxW = bw;
        colBottom = Math.max(colBottom, yC + bh);
      } else {
        colBottom = Math.max(colBottom, yC + memberTop + contentH);
      }
      colW = Math.max(colW, maxW);
      yC = colBottom + GAP_Y * 1.5;
    }
    contentW = Math.max(contentW, curX + colW);
    contentBottom = Math.max(contentBottom, colBottom);
    curX += colW + GAP_X;
  }

  /* ---- place external components below the item frame ------------- */
  let extBottom = 0;
  if (extUnits.length) {
    const boxes = extUnits
      .map((u) => ({ id: u.members[0], size: compSize.get(u.members[0]) }))
      .filter((b): b is { id: string; size: { w: number; h: number } } => !!b.size);
    if (boxes.length) {
      const maxW = Math.max(...boxes.map((b) => b.size.w));
      const cols = Math.max(2, Math.min(6, boxes.length));
      const rowTarget = cols * maxW + (cols - 1) * GAP_X;
      let x = 0;
      let y = contentBottom + EXT_GAP;
      let rowW = 0;
      let rowMaxH = 0;
      for (const b of boxes) {
        const need = b.size.w + (rowW > 0 ? GAP_X : 0);
        if (rowW > 0 && rowW + need > rowTarget) {
          x = 0;
          y += rowMaxH + EXT_ROW_GAP;
          rowW = 0;
          rowMaxH = 0;
        }
        compBoxes.set(b.id, { x, y, w: b.size.w, h: b.size.h });
        x += b.size.w + GAP_X;
        rowW += need;
        rowMaxH = Math.max(rowMaxH, b.size.h);
      }
      extBottom = y + rowMaxH;
    }
  }

  /* ---- assemble absolute coordinates + item frame ----------------- */
  const originX = MARGIN + PAD;
  const originY = MARGIN + ITEM_TITLE_H + PAD;

  const components: ComponentBox[] = model.components
    .map((c) => {
      const r = compBoxes.get(c.id);
      return r
        ? { x: r.x + originX, y: r.y + originY, w: r.w, h: r.h, id: c.id, category: c.category, isExternal: c.isExternal, name: c.name }
        : null;
    })
    .filter((b): b is ComponentBox => b !== null);

  const boundaries: BoundaryBox[] = boundaryFrames.map((b) => ({
    x: b.x + originX,
    y: b.y + originY,
    w: b.w,
    h: b.h,
    id: b.id,
    name: b.name,
    kind: (model.boundaries.find((mb) => mb.id === b.id)?.kind ?? 'security_domain') as BoundaryBox['kind'],
    members: [],
  }));

  const internal = components.filter((c) => !c.isExternal);
  let itemRegion: Rect;
  if (internal.length || boundaries.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of internal) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.w);
      maxY = Math.max(maxY, c.y + c.h);
    }
    for (const b of boundaries) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    itemRegion = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  } else {
    itemRegion = { x: originX, y: originY, w: Math.max(contentW, 0), h: 0 };
  }

  const item: BoundaryBox = {
    id: model.item.id,
    name: model.item.name,
    kind: 'security_domain',
    members: internal.map((c) => c.id),
    x: itemRegion.x - PAD,
    y: itemRegion.y - PAD - ITEM_TITLE_H,
    w: Math.max(itemRegion.w + PAD * 2, MIN_ITEM_W),
    h: itemRegion.h + PAD * 2 + ITEM_TITLE_H,
  };

  // horizontally center content inside a widened item frame
  const shiftX = Math.max(0, (item.w - itemRegion.w) / 2 - (itemRegion.x - item.x - PAD));
  if (shiftX > 0.5) {
    for (const c of components) c.x += shiftX;
    for (const b of boundaries) b.x += shiftX;
  }

  /* ---- service anchors & flow geometry ---------------------------- */
  const services: ServiceAnchor[] = [];
  const chipPoint = new Map<string, Pt>();
  for (const c of components) {
    const anchors = placeChips(svcByComp.get(c.id) ?? [], c);
    services.push(...anchors);
    for (const a of anchors) chipPoint.set(a.id, { x: a.cx, y: a.cy });
  }

  const compRect = new Map<string, Rect>(components.map((c) => [c.id, c]));
  const flows = buildFlows(model.flows, compRect, chipPoint, warnings);

  /* ---- final canvas size ------------------------------------------ */
  const extComps = components.filter((c) => c.isExternal);
  const rightMost = Math.max(item.x + item.w, ...(extComps.length ? extComps.map((c) => c.x + c.w) : [-Infinity]));
  const bottomMost = Math.max(extComps.length ? Math.max(...extComps.map((c) => c.y + c.h)) : -Infinity, item.y + item.h);
  void extBottom;

  return {
    width: Math.max(Math.round(rightMost + MARGIN), 40),
    height: Math.max(Math.round(bottomMost + MARGIN), 40),
    item,
    boundaries,
    components,
    services,
    flows,
    warnings,
  };
}

function hostOf(ref: EndpointRef, model: ArchModel): string {
  if (ref.kind === 'component') return ref.id;
  const svc = model.services.find((s) => s.id === ref.id);
  return svc ? svc.componentId : '';
}

function endpointCenter(ref: EndpointRef, boxes: Map<string, Rect>, chipPoint: Map<string, Pt>): Pt | null {
  if (ref.kind === 'service') return chipPoint.get(ref.id) ?? null;
  const rect = boxes.get(ref.id);
  if (!rect) return null;
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * Resolve a flow endpoint to the point where the drawn line should begin/end:
 * a service-circle centre is nudged outward by its radius, a component endpoint
 * is pulled back to its border on the line toward the other side.
 */
function resolveEndpoint(
  ref: EndpointRef,
  other: Pt | null,
  boxes: Map<string, Rect>,
  chipPoint: Map<string, Pt>
): Pt | null {
  if (ref.kind === 'service') {
    const p = chipPoint.get(ref.id);
    if (!p) return null;
    if (!other) return p;
    const { ux, uy } = norm(p, other);
    return { x: p.x + ux * (DOT_R + 1), y: p.y + uy * (DOT_R + 1) };
  }
  const rect = boxes.get(ref.id);
  if (!rect) return null;
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  if (!other) return center;
  return borderPoint(rect, center, other);
}

function buildFlows(
  flows: Flow[],
  boxes: Map<string, Rect>,
  chipPoint: Map<string, Pt>,
  warnings: string[]
): FlowGeom[] {
  const out: FlowGeom[] = [];
  const pairCount = new Map<string, number>();

  for (const f of flows) {
    const a = endpointCenter(f.source, boxes, chipPoint);
    const b = endpointCenter(f.target, boxes, chipPoint);
    if (!a || !b) {
      warnings.push(`数据流「${f.label || f.id}」的端点无法定位，已跳过`);
      continue;
    }
    const src = resolveEndpoint(f.source, b, boxes, chipPoint);
    const dst = resolveEndpoint(f.target, a, boxes, chipPoint);
    if (!src || !dst) continue;

    const { ux, uy, len } = norm(src, dst);
    if (len < 2) continue;

    // nudge duplicated endpoint pairs apart so both labels/lines stay visible
    const key = `${f.source.id}->${f.target.id}`;
    const n = pairCount.get(key) ?? 0;
    pairCount.set(key, n + 1);
    const mx = (src.x + dst.x) / 2 + (n > 0 ? -uy * 12 * n : 0);
    const my = (src.y + dst.y) / 2 + (n > 0 ? ux * 12 * n : 0);

    out.push({
      id: f.id,
      label: f.label,
      arrow: f.arrow,
      path: `M ${round(src.x)} ${round(src.y)} L ${round(mx)} ${round(my)} L ${round(dst.x)} ${round(dst.y)}`,
      x0: round(src.x),
      y0: round(src.y),
      x1: round(dst.x),
      y1: round(dst.y),
      labelPoint: { x: mx, y: my },
      selected: false,
    });
  }
  return out;
}
