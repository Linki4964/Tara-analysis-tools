/**
 * SSR smoke for the drawboard pipeline (pure functions + static render).
 *   node_modules/.bin/esbuild scripts/board-fixture.tsx --bundle --format=cjs --platform=node --jsx=automatic --outfile=scripts/.board.cjs
 *   node scripts/.board.cjs
 */
import { renderToStaticMarkup } from 'react-dom/server';
import DrawCanvas from '../src/diagram/canvas';
import {
  clipToShape,
  flattenArchModel,
  overlapsRect,
  rectsOverlap,
  resolveConnectors,
  sanitizeShapes,
  sidePointsOf,
  shapeCenter,
  boardMetrics,
  contentBounds,
  hitsShape,
  type DrawShape,
} from '../src/diagram/shapes';
import type { ArchModel } from '../src/diagram/types';

const model: ArchModel = {
  schemaVersion: 1,
  item: { id: 'item-tbox', name: '智能网联 TBOX 相关项' },
  boundaries: [
    { id: 'b-v', name: '车内安全域', kind: 'security_domain' },
    { id: 'b-e', name: '隔离预留域', kind: 'security_domain' },
  ],
  components: [
    { id: 'c-tbox', name: 'TBOX 远程信息单元', category: 'hardware', isExternal: false, boundaryId: 'b-v' },
    { id: 'c-gw', name: '中央网关', category: 'network', isExternal: false, boundaryId: 'b-v' },
    { id: 'c-vcu', name: 'VCU 整车控制器', category: 'hardware', isExternal: false, boundaryId: 'b-v' },
    { id: 'c-app', name: '手机 APP', category: 'external', isExternal: true, boundaryId: null },
    { id: 'c-tsp', name: 'TSP 云端', category: 'external', isExternal: true, boundaryId: null },
  ],
  services: [
    { id: 's-rc', name: '远程控制', componentId: 'c-tbox' },
    { id: 's-ota', name: 'OTA 升级', componentId: 'c-tbox' },
    { id: 's-fw', name: '防火墙', componentId: 'c-gw' },
  ],
  flows: [
    { id: 'f1', label: '下发指令', arrow: 'single', source: { kind: 'service', id: 's-rc' }, target: { kind: 'component', id: 'c-tsp' } },
    { id: 'f2', label: '车云交互', arrow: 'double', source: { kind: 'component', id: 'c-tbox' }, target: { kind: 'service', id: 's-ota' } },
    { id: 'f3', arrow: 'single', source: { kind: 'service', id: 's-fw' }, target: { kind: 'service', id: 's-rc' } },
  ],
};

const checks: Array<[boolean, string]> = [];
const ok = (cond: boolean, msg: string) => checks.push([!!cond, msg]);

/* 1. flatten produces valid, finite, unique-id shapes */
const shapes = flattenArchModel(model);
ok(shapes.length > 0, `flatten → ${shapes.length} shapes`);
const ids = new Set(shapes.map((s) => s.id));
ok(ids.size === shapes.length, 'shape ids are unique');
ok(shapes.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)), 'all shapes have finite x/y');
ok(shapes.some((s) => s.kind === 'rect' && s.headerFill), 'component rect has header caption');
ok(shapes.some((s) => s.kind === 'dashedRect'), 'has dashed frame(s)');
ok(shapes.some((s) => s.kind === 'circle'), 'has service circle(s)');
ok(shapes.some((s) => s.kind === 'arrow' && s.arrowDir === 'double'), 'has double arrow');
const nb = contentBounds(shapes);
ok(!!nb && nb.w > 0 && nb.h > 0, 'content bounds positive');

/* 2. sanitize round-trip */
const cloned = sanitizeShapes(JSON.parse(JSON.stringify(shapes)) as unknown);
ok(cloned.length === shapes.length, 'sanitize round-trip keeps count');
ok(new Set(cloned.map((s) => s.id)).size === cloned.length, 'sanitize ids unique');

/* 3. board metrics respect min size + content */
const bm = boardMetrics(shapes);
ok(bm.w >= 1000 && bm.h >= 640, `board min size respected (${bm.w}x${bm.h})`);
const bmEmpty = boardMetrics([]);
ok(bmEmpty.w === 1000 && bmEmpty.h === 640, 'empty board = default paper');

/* 4. hit-testing is deterministic on a synthetic shape */
const r: DrawShape = {
  id: 'r1', kind: 'rect', x: 10, y: 10, w: 100, h: 60,
  x1: 0, y1: 0, x2: 0, y2: 0,
  fill: '#fff', stroke: '#000', strokeWidth: 1, dashed: false,
  arrowDir: 'single', text: 'x', fontSize: 13, color: '#000', headerFill: null, labelBg: false,
};
ok(hitsShape(r, 60, 40, 0), 'point inside rect hits');
ok(!hitsShape(r, 130, 40, 0), 'point outside rect misses');

/* 5. smart connectors: attach, follow the host, detach when the host is gone */
const mkRect = (id: string, x: number, y: number): DrawShape => ({
  id, kind: 'rect', x, y, w: 100, h: 60,
  x1: 0, y1: 0, x2: 0, y2: 0,
  fill: '#fff', stroke: '#000', strokeWidth: 1.6, dashed: false,
  arrowDir: 'single', ca: null, cb: null, text: id, fontSize: 13, color: '#000', headerFill: null, labelBg: false,
});
const mkLine = (id: string, ca: string | null, cb: string | null): DrawShape => ({
  id, kind: 'arrow', x: 0, y: 0, w: 0, h: 0,
  x1: 0, y1: 0, x2: 0, y2: 0,
  fill: 'none', stroke: '#000', strokeWidth: 1.6, dashed: false,
  arrowDir: 'single', ca, cb, text: '', fontSize: 12, color: '#000', headerFill: null, labelBg: false,
});
const A = mkRect('A', 0, 0);
const B = mkRect('B', 220, 40);
const ln = mkLine('ln', 'A', 'B');
ok(sidePointsOf(A).length === 4, 'a box exposes 4 side points');
const conn = resolveConnectors([A, B, ln]).find((s) => s.id === 'ln')!;
ok(conn.x1 > 99 && conn.x1 < 101, 'source endpoint clips onto A east edge');
ok(conn.x2 > 219 && conn.x2 < 221, 'target endpoint clips onto B west edge');
// host moves → line follows
const B2 = { ...B, x: 320, y: 80 };
const conn2 = resolveConnectors([A, B2, conn]).find((s) => s.id === 'ln')!;
ok(Math.abs(conn2.x2 - 320) < 1.5, 'arrow follows a moved box (B → east 320)');
// host deleted → that anchor is cleared, the other end keeps binding
const conn3 = resolveConnectors([A, conn2]).find((s) => s.id === 'ln')!;
ok(conn3.cb === null && conn3.ca === 'A', 'dangling target anchor is cleared');
ok(Number.isFinite(conn3.x2) && Number.isFinite(conn3.y2), 'detached end keeps finite coords');
// circle clipping stays on the ellipse
const circ: DrawShape = { ...mkRect('C', 500, 200), kind: 'circle', w: 60, h: 60, x: 500, y: 200 };
const cen = shapeCenter(circ);
const hit = clipToShape(circ, cen.x + 200, cen.y);
ok(hit.x >= 559 && hit.x <= 561 && Math.abs(hit.y - cen.y) < 1, 'circle clip lands on the right rim');
// sanitize round-trips anchors
const rt = sanitizeShapes(JSON.parse(JSON.stringify([A, B, ln])) as unknown);
const rtLn = rt.find((s) => s.id === 'ln');
ok(rtLn?.ca === 'A' && rtLn?.cb === 'B', 'sanitize keeps connector anchors');

/* 6. marquee selection helpers: rect overlap + per-shape hit box vs a rect */
ok(rectsOverlap({ x: 0, y: 0, w: 100, h: 100 }, { x: 90, y: 90, w: 10, h: 10 }), 'overlapping rects detected');
ok(!rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 0, w: 10, h: 10 }), 'disjoint rects do not overlap');
ok(overlapsRect(A, { x: -10, y: -10, w: 50, h: 50 }), 'marquee touching box selects it');
ok(!overlapsRect(B, { x: 1500, y: 1500, w: 10, h: 10 }), 'far-away marquee misses the box');
const txtSh: DrawShape = { ...mkRect('txt1', 1000, 500), kind: 'text', text: '你好', w: 30, h: 14 };
ok(overlapsRect(txtSh, { x: 1000, y: 500, w: 5, h: 5 }), 'marquee over a text label selects it');
ok(!overlapsRect(txtSh, { x: 1400, y: 900, w: 5, h: 5 }), 'marquee far from the label misses it');

/* 7. SSR: infinite-canvas structure — hidden export mirror + full-viewport overlay
      with a camera <g> (translate/scale) that holds the shapes + chrome */
const html = renderToStaticMarkup(
  <DrawCanvas
    shapes={shapes}
    tool="select"
    zoom={0.85}
    pan={{ x: 120, y: 40 }}
    selectedIds={[]}
    onSelect={() => undefined}
    onCommit={() => undefined}
  />
);
ok(html.includes('dc-root'), 'camera root <div> present');
ok(html.includes('dc-content'), 'hidden export mirror <svg> present');
ok(html.includes('dc-overlay'), 'full-viewport interaction overlay <svg> present');
ok(html.includes('translate(120, 40) scale(0.85)'), 'camera group applies pan + zoom (SVG attr forbids px units)');
ok(html.includes('智能网联 TBOX 相关项'), 'item label text rendered');
ok(html.includes('中央网关'), 'component caption rendered');
const polygonCount = (html.match(/<polygon/g) || []).length;
ok(polygonCount >= 4, `arrowheads polygons present (${polygonCount})`);
ok((html.match(/<ellipse/g) || []).length >= 1, 'circle(s) rendered as ellipse');
ok((html.match(/<rect/g) || []).length >= 2, 'boxes rendered');

let failed = 0;
for (const [cond, msg] of checks) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
