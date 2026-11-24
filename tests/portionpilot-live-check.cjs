// Live check for PortionPilot on GitHub Pages (Playwright, headless Firefox).
// Usage: NODE_PATH=<test-tools node_modules> node tests/portionpilot-live-check.cjs [url]
// Default URL: https://adilmhr1262.github.io/portionpilot/
// Exits non-zero if any check fails.
const { firefox } = require('playwright-core');

const url = process.argv[2] || 'https://adilmhr1262.github.io/portionpilot/';
const origin = new URL(url).origin;

let passed = 0;
let failed = 0;
function check(name, ok, extra) {
  if (ok) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const browser = await firefox.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
    page.on('request', (req) => { if (!req.url().startsWith(origin)) externalRequests.push(req.url()); });
    const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    check('live page returns HTTP 200', response && response.status() === 200, response ? 'status ' + response.status() : 'no response');
    await page.waitForSelector('[data-testid="nav-dashboard"]', { timeout: 15000 });
    check('dashboard heading renders', (await page.locator('h1').first().textContent()).includes('Cook the right amount'));
    check('all five nav sections present', (await page.locator('[data-testid^="nav-"]').count()) >= 5);
    await page.click('[data-testid="nav-recipes"]');
    check('recipes section opens', await page.locator('.empty-state').first().isVisible());
    await page.click('[data-testid="nav-calculator"]');
    check('calculator section opens', await page.locator('.empty-state').first().isVisible());
    await page.click('[data-testid="nav-shopping"]');
    check('shopping section opens', await page.locator('[data-testid="shopping-list"]').isVisible());
    await page.click('[data-testid="nav-settings"]');
    check('settings section opens', await page.locator('[data-testid="export-backup"]').isVisible());
    await page.setViewportSize({ width: 375, height: 800 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check('no horizontal overflow at 375px on live site', !overflow);
    check('zero console/page errors on live site', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('zero external requests on live site', externalRequests.length === 0, externalRequests.slice(0, 3).join(', '));
  } finally {
    await browser.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error('Live check crashed:', err.message);
  process.exit(1);
});
