/* Headless smoke: standalone /diagram/:runId board now has a working "下一步"
   button that jumps into the /workspace TARA wizard at step 1.
   Draw one rect -> click 下一步 -> expect URL /workspace + workflow nav + step 1. */
const { chromium } = require('playwright-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const RUN = 'smoke-next-' + Date.now();
const URL = `http://127.0.0.1:5173/diagram/${RUN}`;

const results = [];
const ok = (cond, msg) => results.push([!!cond, msg]);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('Failed to load resource')) {
      errors.push(`console: ${m.text()}`);
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.dc-overlay', { timeout: 12000 });
  await page.waitForSelector('.tb-rail button[aria-label="矩形"]', { timeout: 12000 });

  // 1) draw one non-text rect so the board has content
  await page.locator('.tb-rail button[aria-label="矩形"]').click();
  await page.waitForTimeout(80);
  await page.mouse.move(420, 260);
  await page.mouse.down();
  await page.mouse.move(640, 400, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  // 2) the standalone navbar now shows an enabled 下一步 button
  const nextBtn = page.locator('.diagram-navbar-next');
  ok((await nextBtn.count()) === 1, '下一步 button rendered on the standalone board');
  ok(await nextBtn.isEnabled(), '下一步 button enabled after drawing a shape');

  // 3) click it -> navigate into /workspace with run state
  await nextBtn.click();

  await page.waitForFunction(
    () => window.location.pathname.startsWith('/workspace'),
    { timeout: 8000 },
  );
  ok(true, `URL became ${page.url()}`);

  // 4) run has no saved steps (backend 500s on the fake id) -> App should land at step 1
  await page.waitForSelector('.workflow-nav', { timeout: 15000 });
  const navText = await page.locator('.workflow-nav').innerText();
  ok(/相关项定义/.test(navText), `workflow nav shows step 1 (got: ${navText.replace(/\s+/g, ' ').slice(0, 60)}…)`);
  await page.waitForSelector('.main-container', { timeout: 8000 });
  const bodyText = await page.locator('.main-container').innerText();
  ok(/相关项定义/.test(bodyText) || /上传文档|手动输入/.test(bodyText), 'step-1 panel (Item Definition) rendered');
  const loading = await page.locator('.loading-area').count();
  ok(loading === 0, 'run-resolution loading gate cleared');

  for (const [cond, msg] of results) console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  console.log('ERRORS', errors.length ? '\n  ' + errors.join('\n  ') : '(none)');

  const failed = results.filter((r) => !r[0]).length;
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
