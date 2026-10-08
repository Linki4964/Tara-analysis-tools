/* Marquee / multi-select smoke (headless Chrome).
   Draws rectangles, then verifies: marquee-select one → Delete removes it;
   marquee-select one + Ctrl+click another → Delete removes both (additive). */
const { chromium } = require('playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:5173/diagram/mq';

const results = [];
const ok = (cond, msg) => results.push([!!cond, msg]);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`console: ${m.text()}`); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.dc-overlay', { timeout: 12000 });

  const state = () => page.evaluate(() => {
    const camG = document.querySelector('.dc-overlay g');
    const t = camG?.getAttribute('transform') || '';
    const m = /translate\(([-\d.]+), ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(t);
    const shapeRects = Array.from(document.querySelectorAll('.dc-content rect')).slice(1);
    return {
      zoom: m ? Number(m[3]) : 1,
      panX: m ? Number(m[1]) : 0,
      panY: m ? Number(m[2]) : 0,
      shapes: shapeRects.map((r) => ({
        x: Number(r.getAttribute('x')), y: Number(r.getAttribute('y')),
        w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')),
      })),
      tool: document.querySelector('.tb-btn--active')?.getAttribute('aria-label') || null,
    };
  });

  const pickTool = (label) => page.locator(`.tb-rail button[aria-label="${label}"]`).click();

  const drawRect = async (x1, y1, x2, y2) => {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  };

  // screen coords for a small marquee that overlaps only the given shape
  const marqueeAround = async (st, sh) => {
    const sx = st.panX + (sh.x - 6) * st.zoom;
    const sy = st.panY + (sh.y - 6) * st.zoom;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(st.panX + (sh.x + 8) * st.zoom, st.panY + (sh.y + 8) * st.zoom, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  };

  // 1) clear & draw two well-separated rects (second far away in screen space)
  await pickTool('矩形');
  await drawRect(420, 260, 620, 400); // r1  (auto-fit happens once after first)
  await drawRect(1120, 700, 1280, 820); // r2 far from r1
  let s = await state();
  ok(s.shapes.length === 2, `two rects drawn (got ${s.shapes.length})`);

  // 2) marquee-select only r1 → Delete must remove exactly it
  await pickTool('选择');
  await page.waitForTimeout(80);
  s = await state();
  await marqueeAround(s, s.shapes[0]);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(120);
  s = await state();
  ok(s.shapes.length === 1, `marquee + Delete left one shape (got ${s.shapes.length})`);

  // 3) draw a third rect, marquee-select one of the two, then Ctrl+click the other
  await pickTool('矩形');
  await drawRect(420, 620, 620, 760);
  await pickTool('选择');
  s = await state();
  ok(s.shapes.length === 2, `two rects again (got ${s.shapes.length})`);
  await marqueeAround(s, s.shapes[0]); // select first only
  await page.waitForTimeout(100);
  const add = s.shapes[1];
  const cx = s.panX + (add.x + add.w / 2) * s.zoom;
  const cy = s.panY + (add.y + add.h / 2) * s.zoom;
  await page.keyboard.down('Control');
  await page.mouse.click(cx, cy);
  await page.keyboard.up('Control');
  await page.waitForTimeout(120);

  // 4) Delete should now remove BOTH (selection grew by Ctrl+click)
  await page.keyboard.press('Delete');
  await page.waitForTimeout(150);
  s = await state();
  ok(s.shapes.length === 0, `Ctrl+click then Delete removed both (got ${s.shapes.length})`);

  // 5) group drag: marquee-select two, drag one, both must translate together
  await pickTool('矩形');
  await drawRect(300, 180, 460, 300);
  await drawRect(700, 620, 880, 740);
  await pickTool('选择');
  s = await state();
  ok(s.shapes.length === 2, `fresh pair drawn (got ${s.shapes.length})`);
  const pre0 = { ...s.shapes[0] };
  const pre1 = { ...s.shapes[1] };
  await page.mouse.move(1000, 70); // below navbar, empty, right of the shapes
  await page.mouse.down();
  await page.mouse.move(240, 800, { steps: 14 }); // spans the pair top→bottom
  await page.mouse.up();
  await page.waitForTimeout(120);
  // drag the first shape by +120px x, +60px y (screen units)
  const fx = s.panX + (pre0.x + pre0.w / 2) * s.zoom;
  const fy = s.panY + (pre0.y + pre0.h / 2) * s.zoom;
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.mouse.move(fx + 120, fy + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(160);
  s = await state();
  const d0x = s.shapes[0].x - pre0.x, d0y = s.shapes[0].y - pre0.y;
  const d1x = s.shapes[1].x - pre1.x, d1y = s.shapes[1].y - pre1.y;
  ok(Math.abs(d0x - d1x) < 1.5 && Math.abs(d0y - d1y) < 1.5,
     `whole group moved together (deltas (${d0x.toFixed(1)},${d0y.toFixed(1)}) vs (${d1x.toFixed(1)},${d1y.toFixed(1)}))`);
  ok(d0x !== 0 || d0y !== 0, `group actually moved (dx=${d0x.toFixed(1)}, dy=${d0y.toFixed(1)})`);

  for (const [cond, msg] of results) console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  console.log('ERRORS', errors.length ? '\n  ' + errors.join('\n  ') : '(none)');

  const failed = results.filter((r) => !r[0]).length;
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
