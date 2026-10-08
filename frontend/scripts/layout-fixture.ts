/**
 * Node smoke test for the architecture auto-layout (not part of the app).
 * Bundled with esbuild, executed with node:
 *   node_modules/.bin/esbuild scripts/layout-fixture.ts --bundle --format=cjs --platform=node --outfile=scripts/.fixture.cjs
 *   node scripts/.fixture.cjs
 */
import { layoutModel } from '../src/diagram/layout';
import type { ArchModel, ComponentBox, Rect } from '../src/diagram/types';

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
}

const fixture: ArchModel = {
  schemaVersion: 1,
  item: { id: 'item-tbox', name: '智能网联汽车 TBOX 相关项' },
  boundaries: [
    { id: 'b-vehicle', name: '车内安全域', kind: 'security_domain' },
    { id: 'b-gateway', name: '网关信任区', kind: 'trust_boundary' },
    { id: 'b-empty', name: '预留隔离域', kind: 'security_domain' },
  ],
  components: [
    { id: 'c-tbox', name: 'TBOX 远程信息单元', category: 'hardware', isExternal: false, boundaryId: 'b-vehicle' },
    { id: 'c-gw', name: '中央网关', category: 'network', isExternal: false, boundaryId: 'b-gateway' },
    { id: 'c-can', name: '整车 CAN 总线', category: 'network', isExternal: false, boundaryId: 'b-vehicle' },
    { id: 'c-vcu', name: 'VCU 整车控制器', category: 'hardware', isExternal: false, boundaryId: 'b-vehicle' },
    { id: 'c-adas', name: '智能驾驶域控制器', category: 'control', isExternal: false, boundaryId: null },
    { id: 'c-obd', name: 'OBD-II 诊断口', category: 'hardware', isExternal: false, boundaryId: 'b-vehicle' },
    { id: 'c-ble', name: '蓝牙 LE 模块', category: 'software', isExternal: false, boundaryId: 'b-vehicle' },
    { id: 'c-app', name: '手机 APP', category: 'external', isExternal: true, boundaryId: null },
    { id: 'c-tsp', name: 'TSP 云端', category: 'external', isExternal: true, boundaryId: null },
    { id: 'c-att', name: '攻击者（远程/近场）', category: 'external', isExternal: true, boundaryId: null },
  ],
  services: [
    { id: 's-rc', name: '远程控制接口', componentId: 'c-tbox' },
    { id: 's-ota', name: 'OTA 升级', componentId: 'c-tbox' },
    { id: 's-fw', name: '防火墙', componentId: 'c-gw' },
    { id: 's-ids', name: '入侵检测 IDS', componentId: 'c-gw' },
    { id: 's-vc', name: '车速控制', componentId: 'c-vcu' },
    { id: 's-diag', name: '诊断服务 D', componentId: 'c-obd' },
  ],
  flows: [
    { id: 'f1', label: 'APP 远程控车指令', arrow: 'single', source: { kind: 'service', id: 's-rc' }, target: { kind: 'component', id: 'c-tsp' } },
    { id: 'f2', label: 'TSP 下发控制', arrow: 'single', source: { kind: 'component', id: 'c-app' }, target: { kind: 'component', id: 'c-tsp' } },
    { id: 'f3', label: '车云数据流', arrow: 'double', source: { kind: 'component', id: 'c-tbox' }, target: { kind: 'component', id: 'c-tsp' } },
    { id: 'f4', label: '车内 CAN 报文', arrow: 'double', source: { kind: 'service', id: 's-rc' }, target: { kind: 'service', id: 's-fw' } },
    { id: 'f5', label: '固件下发', arrow: 'single', source: { kind: 'service', id: 's-ota' }, target: { kind: 'service', id: 's-fw' } },
    { id: 'f6', label: '控制指令', arrow: 'single', source: { kind: 'service', id: 's-fw' }, target: { kind: 'service', id: 's-vc' } },
    { id: 'f7', label: '诊断访问', arrow: 'single', source: { kind: 'service', id: 's-diag' }, target: { kind: 'service', id: 's-fw' } },
    { id: 'f8', label: '近场攻击路径', arrow: 'single', source: { kind: 'component', id: 'c-att' }, target: { kind: 'service', id: 's-diag' } },
    { id: 'f9', label: '蓝牙攻击路径', arrow: 'single', source: { kind: 'component', id: 'c-att' }, target: { kind: 'service', id: 's-ota' } },
  ],
};

const L = layoutModel(fixture);

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  }
}

// canvas bounds sanity
check(Number.isFinite(L.width) && L.width > 40, 'canvas width sane');
check(Number.isFinite(L.height) && L.height > 40, 'canvas height sane');
check(L.components.length === fixture.components.length, 'every component placed');
check(L.services.length === fixture.services.length, 'every service anchored');
check(L.flows.length === fixture.flows.length, 'every flow routed');

const rects: Rect[] = L.components;
for (let i = 0; i < rects.length; i++) {
  const a = rects[i];
  check(a.x >= 0 && a.y >= 0 && a.x + a.w <= L.width + 0.5 && a.y + a.h <= L.height + 0.5, `comp ${a.id} inside canvas`);
  for (let j = i + 1; j < rects.length; j++) {
    const b = rects[j];
    if (a.id !== b.id && overlap(a, b)) {
      failures += 1;
      console.error(`OVERLAP between ${a.id}(${a.x},${a.y},${a.w}x${a.h}) and ${b.id}(${b.x},${b.y},${b.w}x${b.h})`);
    }
  }
}
// item frame must contain every internal component box
const itemRect: Rect = L.item;
for (const c of L.components) {
  if (c.isExternal) continue;
  const inside =
    itemRect.x <= c.x && itemRect.y <= c.y && itemRect.x + itemRect.w >= c.x + c.w - 0.5 && itemRect.y + itemRect.h >= c.y + c.h - 0.5;
  check(inside, `item frame contains internal comp ${c.id}`);
}
// externals must sit strictly below the item frame
for (const c of L.components.filter((c) => c.isExternal)) {
  check(c.y >= itemRect.y + itemRect.h - 0.5, `external ${c.id} below item frame`);
}
// boundary frames enclose member bboxes (by name-to-id known mapping)
const bBy: Record<string, Rect> = Object.fromEntries(L.boundaries.map((b) => [b.id, b]));
const inBoundary: Array<[string, string]> = [
  ['b-vehicle', 'c-tbox'],
  ['b-vehicle', 'c-can'],
  ['b-vehicle', 'c-vcu'],
  ['b-vehicle', 'c-obd'],
  ['b-vehicle', 'c-ble'],
  ['b-gateway', 'c-gw'],
];
for (const [bid, cid] of inBoundary) {
  const b = bBy[bid];
  const c = L.components.find((x) => x.id === cid)!;
  const inside = b.x <= c.x && b.y <= c.y && b.x + b.w >= c.x + c.w - 0.5 && b.y + b.h >= c.y + c.h - 0.5;
  check(inside, `boundary ${bid} contains ${cid}`);
}
check(!!bBy['b-empty'], 'empty boundary got a placeholder frame');

// every flow endpoint finite & inside-ish
for (const f of L.flows) {
  check(Number.isFinite(f.x0) && Number.isFinite(f.y0) && Number.isFinite(f.x1) && Number.isFinite(f.y1), `flow ${f.id} endpoints finite`);
}

console.log('\n== canvas ==', L.width, 'x', L.height);
console.log('== item ==', JSON.stringify(L.item));
console.log('== boundaries ==');
for (const b of L.boundaries) console.log(`  ${b.id.padEnd(10)} (${Math.round(b.x)},${Math.round(b.y)}) ${Math.round(b.w)}x${Math.round(b.h)} "${b.name}"`);
console.log('== components ==');
for (const c of L.components) console.log(`  ${c.id.padEnd(10)} (${Math.round(c.x)},${Math.round(c.y)}) ${Math.round(c.w)}x${Math.round(c.h)} ext=${c.isExternal ? 'Y' : 'n'} "${c.name}"`);
console.log('== flows ==');
for (const f of L.flows) console.log(`  ${f.id} (${Math.round(f.x0)},${Math.round(f.y0)}) -> (${Math.round(f.x1)},${Math.round(f.y1)}) ${f.arrow}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
