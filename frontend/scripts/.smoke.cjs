/* Interactive smoke: open the infinite-canvas board and try to place a rect by drag + by click. */
const { chromium } = require('playwright-core');

const CHROME =
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:5173/diagram/smoke';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`reqfail: ${r.url()} ${r.failure()?.errorText}`));

  await page.goto(URL, { waitUntil: 'networkidle' }).catch((e) => errors.push(`goto: ${e.message}`));
  await page.waitForSelector('.dc-overlay', { timeout: 12000 }).catch(() => errors.push('no .dc-overlay'));

  const before = await page.evaluate(() => ({
    ov: document.querySelectorAll('.dc-overlay g rect').length,
    ct: document.querySelectorAll('.dc-content rect').length,
    overlayBox: (() => { const r = document.querySelector('.dc-overlay').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
    hostBox: (() => { const r = document.querySelector('.arch-canvas-host').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
    tool: document.querySelector('.tb-btn--active')?.getAttribute('aria-label') || null,
  }));

  // pick the solid-rect tool
  const rectBtn = page.locator('.tb-rail button[aria-label="矩形"]');
  const btnVisible = await rectBtn.isVisible();
  await rectBtn.click();
  const toolAfter = await page.evaluate(() => document.querySelector('.tb-btn--active')?.getAttribute('aria-label') || null);

  // drag-draw a rect in the middle of the canvas
  await page.mouse.move(560, 380);
  await page.mouse.down();
  await page.mouse.move(800, 560, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const afterDrag = await page.evaluate(() => ({
    ov: document.querySelectorAll('.dc-overlay g rect').length,
    ct: document.querySelectorAll('.dc-content rect').length,
    welcome: !!document.querySelector('.dc-welcome'),
    tip: !!document.querySelector('.dc-tip'),
  }));

  // single click on empty space should drop a default-size rect (150x96)
  await page.mouse.click(420, 300);
  await page.waitForTimeout(200);
  const afterClick = await page.evaluate(() => ({
    ov: document.querySelectorAll('.dc-overlay g rect').length,
    ct: document.querySelectorAll('.dc-content rect').length,
  }));

  // ---- exact placement check: now the board is non-empty, so the auto-fit is
  // done and the camera is fixed. Draw a second rect and verify its on-screen
  // box lands where the mouse dragged (model<->screen mapping correctness).
  await page.mouse.move(760, 120);
  await page.mouse.down();
  await page.mouse.move(1010, 250, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(60);
  const placement = await page.evaluate(() => {
    const camG = document.querySelector('.dc-overlay g');
    const lastRect = Array.from(document.querySelectorAll('.dc-overlay g rect')).pop();
    if (!camG || !lastRect) return null;
    const r = lastRect.getBoundingClientRect();
    return { camTransform: camG.getAttribute('transform'), x: r.x, y: r.y, w: r.width, h: r.height };
  });

  console.log('BEFORE     ', JSON.stringify(before));
  console.log('TOOL AFTER ', JSON.stringify(toolAfter));
  console.log('AFTER DRAG ', JSON.stringify(afterDrag));
  console.log('AFTER CLICK', JSON.stringify(afterClick));
  console.log('PLACEMENT  ', JSON.stringify(placement));
  console.log('ERRORS', errors.length ? errors.join('\n  ') : '(none)');

  const got = afterClick.ct - before.ct;
  const mapOk = placement && Math.abs(placement.x - 760) < 20 && Math.abs(placement.y - 120) < 20 &&
                Math.abs(placement.x + placement.w - 1010) < 20 && Math.abs(placement.y + placement.h - 250) < 20;
  console.log(`\nRESULT: ${got >= 2 ? 'PASS — drag + click each placed a rect' : 'FAIL — rect count grew by ' + got}`);
  console.log(`MAP: ${mapOk ? 'PASS — placed rect matches the mouse drag position' : 'FAIL — placement off (' + JSON.stringify(placement) + ')'}`);
  await browser.close();
  process.exit(got >= 2 && mapOk ? 0 : 1);
})();
