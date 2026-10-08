/**
 * Semantic model for the ISO/SAE 21434 architecture image module.
 *
 * This single model doubles as the LLM output contract, the backend-normalized
 * payload, the frontend state and the JSON export format. It contains NO
 * coordinates: the frontend auto-layout (`layout.ts`) derives geometry from it.
 */

export type ComponentCategory = 'hardware' | 'software' | 'network' | 'external' | 'control';
export type BoundaryKind = 'security_domain' | 'trust_boundary';
export type EndpointKind = 'component' | 'service';
export type ArrowKind = 'single' | 'double';

export interface ArchItem {
  id: string;
  name: string;
  description?: string;
}

export interface Boundary {
  id: string;
  name: string;
  kind: BoundaryKind;
  description?: string;
}

export interface Component {
  id: string;
  name: string;
  kind?: string;
  category: ComponentCategory;
  isExternal: boolean;
  boundaryId: string | null;
  description?: string;
}

export interface Service {
  id: string;
  name: string;
  componentId: string;
  kind?: string;
  description?: string;
}

export interface EndpointRef {
  kind: EndpointKind;
  id: string;
}

export interface Flow {
  id: string;
  label?: string;
  source: EndpointRef;
  target: EndpointRef;
  arrow: ArrowKind;
  reason?: string;
}

export interface ArchModel {
  schemaVersion: 1;
  item: ArchItem;
  components: Component[];
  services: Service[];
  boundaries: Boundary[];
  flows: Flow[];
}

export type SelectableType = 'component' | 'service' | 'boundary' | 'flow' | 'item';
export interface Selection {
  type: SelectableType;
  id: string;
}

/* ------------------------------------------------------------------ */
/* Layout geometry (computed by layout.ts, consumed by render.tsx)     */
/* ------------------------------------------------------------------ */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ComponentBox extends Rect {
  id: string;
  category: ComponentCategory;
  isExternal: boolean;
  name: string;
}

export interface BoundaryBox extends Rect {
  id: string;
  name: string;
  kind: BoundaryKind;
  members: string[]; // component ids inside this boundary (informational)
}

export interface ServiceAnchor {
  id: string;
  componentId: string;
  cx: number;
  cy: number;
  r: number;
  /** label anchor relative to the circle */
  label: {
    x: number;
    y: number;
    anchor: 'start' | 'middle' | 'end';
    text: string;
  };
}

export interface FlowGeom {
  id: string;
  label?: string;
  /** SVG path "d" */
  path: string;
  /** resolved endpoints (already trimmed to the boundary/rim) */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  arrow: ArrowKind;
  /** label text point (label is drawn here with a backdrop) */
  labelPoint?: { x: number; y: number };
  selected: boolean;
}

export interface LayoutResult {
  width: number;
  height: number;
  /** outer Item frame */
  item: BoundaryBox;
  boundaries: BoundaryBox[];
  components: ComponentBox[];
  services: ServiceAnchor[];
  flows: FlowGeom[];
  warnings: string[];
}

export type ModelChanges = {
  addedComponents: string[];
  removedComponents: string[];
  addedServices: string[];
  removedServices: string[];
  addedBoundaries: string[];
  removedBoundaries: string[];
  addedFlows: string[];
  removedFlows: string[];
  modifiedNames: { id: string; before: string; after: string }[];
};

export interface DiagramCounts {
  components: number;
  services: number;
  boundaries: number;
  flows: number;
  totalElements: number;
}

/* ------------------------------------------------------------------ */
/* Sanitizer: best-effort coercion for JSON import / localStorage      */
/* ------------------------------------------------------------------ */

const VALID_CATEGORIES: ComponentCategory[] = ['hardware', 'software', 'network', 'external', 'control'];
const VALID_ARROWS: ArrowKind[] = ['single', 'double'];

function cleanStr(v: unknown, limit = 200): string {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, limit);
}

function asDict(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Builds unique ids with a prefix + counter when the raw id is absent/invalid. */
function makeIds() {
  const used = new Set<string>();
  const counters = new Map<string, number>();
  const ensure = (prefix: string, raw: unknown): string => {
    const proposed = cleanStr(raw, 64).replace(/\s+/g, '-');
    const valid = /^[A-Za-z0-9_-]{1,64}$/.test(proposed) && !used.has(proposed);
    if (valid) {
      used.add(proposed);
      return proposed;
    }
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    const id = `${prefix}-gen-${n}`;
    used.add(id);
    return id;
  };
  return ensure;
}

/**
 * Coerce an arbitrary parsed object into a canonical ArchModel.
 * Drops entries that are unusable; never throws for data-shape issues.
 */
export function sanitizeModel(input: unknown): ArchModel {
  const src = asDict(input) ?? {};
  const ensureId = makeIds();

  const itemRaw = asDict(src.item) ?? {};
  const item: ArchItem = {
    id: ensureId('item', itemRaw.id),
    name: cleanStr(itemRaw.name) || '系统架构图',
    description: cleanStr(itemRaw.description),
  };

  const boundaries: Boundary[] = asArray(src.boundaries)
    .map((e) => asDict(e))
    .filter((e): e is Record<string, unknown> => e !== null)
    .map((e) => ({
      id: ensureId('b', e.id),
      name: cleanStr(e.name) || '安全域',
      kind: (cleanStr(e.kind) === 'trust_boundary' ? 'trust_boundary' : 'security_domain') as BoundaryKind,
      description: cleanStr(e.description),
    }));

  const components: Component[] = asArray(src.components)
    .map((e) => asDict(e))
    .filter((e): e is Record<string, unknown> => e !== null)
    .map((e) => {
      const isExternal = Boolean(e.isExternal);
      const catRaw = cleanStr(e.category) as ComponentCategory;
      const category: ComponentCategory = isExternal
        ? 'external'
        : VALID_CATEGORIES.includes(catRaw)
          ? catRaw
          : 'hardware';
      const boundaryRaw = cleanStr(e.boundaryId);
      return {
        id: ensureId('c', e.id),
        name: cleanStr(e.name) || '部件',
        kind: cleanStr(e.kind) || undefined,
        category,
        isExternal,
        boundaryId: isExternal || !boundaryRaw ? null : boundaryRaw,
        description: cleanStr(e.description),
      };
    });

  const compIds = new Set(components.map((c) => c.id));

  const services: Service[] = asArray(src.services)
    .map((e) => asDict(e))
    .filter((e): e is Record<string, unknown> => e !== null)
    .filter((e) => compIds.has(cleanStr(e.componentId)))
    .map((e) => ({
      id: ensureId('s', e.id),
      name: cleanStr(e.name) || '服务',
      componentId: cleanStr(e.componentId),
      kind: cleanStr(e.kind) || undefined,
      description: cleanStr(e.description),
    }));

  const svcIds = new Set(services.map((s) => s.id));

  const resolveEp = (v: unknown): EndpointRef | null => {
    const d = asDict(v);
    if (!d) return null;
    const kind = cleanStr(d.kind) === 'service' ? 'service' : 'component';
    const id = cleanStr(d.id);
    if (kind === 'service' && svcIds.has(id)) return { kind, id };
    if (kind === 'component' && compIds.has(id)) return { kind, id };
    return null;
  };

  const flows: Flow[] = [];
  for (const raw of asArray(src.flows)) {
    const e = asDict(raw);
    if (!e) continue;
    const source = resolveEp(e.source);
    const target = resolveEp(e.target);
    if (!source || !target) continue;
    const arrow = VALID_ARROWS.includes(cleanStr(e.arrow) as ArrowKind)
      ? (cleanStr(e.arrow) as ArrowKind)
      : 'single';
    flows.push({
      id: ensureId('f', e.id),
      label: cleanStr(e.label, 80) || undefined,
      source,
      target,
      arrow,
      reason: cleanStr(e.reason) || undefined,
    });
  }

  return {
    schemaVersion: 1,
    item,
    components,
    services,
    boundaries,
    flows,
  };
}

export function countModel(model: ArchModel): DiagramCounts {
  const components = model.components.length;
  const services = model.services.length;
  const boundaries = model.boundaries.length;
  const flows = model.flows.length;
  return {
    components,
    services,
    boundaries,
    flows,
    totalElements: components + services + boundaries + flows,
  };
}
