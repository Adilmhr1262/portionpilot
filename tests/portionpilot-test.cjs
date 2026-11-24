// Browser acceptance tests for PortionPilot (Playwright, headless Firefox).
// Serves the project over local HTTP and drives the real UI.
// Run: NODE_PATH=<test-tools node_modules> node tests/portionpilot-test.cjs
// Exits non-zero if any check fails.
const { firefox } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

let passed = 0;
let failed = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { passed++; console.log('  PASS ' + name); }
  else { failed++; failures.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}/`;
  let browser;
  try {
    browser = await firefox.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
    page.on('request', (req) => { if (!req.url().startsWith(base)) externalRequests.push(req.url()); });

    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="nav-dashboard"]');

    // 1. Fresh install: empty dashboard.
    check('fresh install shows zero recipes', (await page.locator('.stat-value').first().textContent()) === '0');
    check('fresh install shows empty state', await page.locator('.empty-state').first().isVisible());

    // 2. Add a recipe (the order example: Chicken Rice, 4 servings).
    await page.click('[data-testid="nav-recipes"]');
    await page.click('text=Add recipe');
    await page.fill('[data-testid="recipe-name"]', 'Chicken Rice');
    await page.selectOption('[data-testid="recipe-category"]', 'Dinner');
    await page.fill('[data-testid="recipe-servings"]', '4');
    const ingredients = [
      ['200', 'g', 'Rice'],
      ['400', 'g', 'Chicken'],
      ['500', 'ml', 'Water'],
      ['1', 'tsp', 'Salt'],
    ];
    for (let i = 0; i < ingredients.length; i++) {
      if (i > 0) await page.click('[data-testid="add-ingredient"]');
      await page.locator('[data-testid="ingredient-qty"]').nth(i).fill(ingredients[i][0]);
      await page.locator('[data-testid="ingredient-unit"]').nth(i).fill(ingredients[i][1]);
      await page.locator('[data-testid="ingredient-name"]').nth(i).fill(ingredients[i][2]);
    }
    await page.click('[data-testid="save-recipe"]');
    await page.waitForSelector('[data-testid="recipe-results"]');
    check('recipe appears in My Recipes', (await page.locator('.recipe-card h3').first().textContent()) === 'Chicken Rice');
    check('recipe count reads 1 recipe', (await page.locator('[data-testid="recipe-count"]').textContent()).includes('1 recipe'));

    // 3. Invalid quantity is rejected in the form.
    await page.click('text=Add recipe');
    await page.fill('[data-testid="recipe-name"]', 'Bad Soup');
    await page.fill('[data-testid="recipe-servings"]', '2');
    await page.locator('[data-testid="ingredient-qty"]').first().fill('-5');
    await page.locator('[data-testid="ingredient-name"]').first().fill('Water');
    await page.click('[data-testid="save-recipe"]');
    check('negative quantity rejected with error shown', await page.locator('.form-errors').isVisible());
    await page.click('text=Cancel');
    check('rejected recipe was not saved', (await page.locator('[data-testid="recipe-count"]').textContent()).includes('1 recipe'));

    // 4. Search and filter.
    await page.fill('[data-testid="search-recipes"]', 'chicken');
    check('search finds the recipe', await page.locator('.recipe-card h3').first().isVisible());
    await page.fill('[data-testid="search-recipes"]', 'zzz-no-match');
    check('no-match search shows empty state', await page.locator('.empty-state').isVisible());
    await page.fill('[data-testid="search-recipes"]', '');
    await page.selectOption('[data-testid="filter-category"]', 'Breakfast');
    check('category filter hides Dinner recipe', await page.locator('.empty-state').isVisible());
    await page.selectOption('[data-testid="filter-category"]', '');

    // 5. Favourite shows on the dashboard.
    await page.locator('.fav-btn').first().click();
    await page.click('[data-testid="nav-dashboard"]');
    check('favourite appears on dashboard', (await page.locator('.section .recipe-card h3').first().textContent()) === 'Chicken Rice');

    // 6. Calculator: 4 -> 6 servings matches the order example.
    await page.click('[data-testid="nav-calculator"]');
    const servings = page.locator('[data-testid="calc-servings"]');
    await servings.fill('6');
    await servings.press('Tab');
    await sleep(200);
    const rowsText = await page.locator('[data-testid="calc-rows"]').textContent();
    check('scaled Rice is 300 g', rowsText.includes('300 g'));
    check('scaled Chicken is 600 g', rowsText.includes('600 g'));
    check('scaled Water is 750 ml', rowsText.includes('750 ml'));
    check('scaled Salt is 1.5 tsp', rowsText.includes('1.5 tsp'));
    check('summary names 6 servings', (await page.locator('[data-testid="calc-summary"]').textContent()).includes('6 servings'));
    await page.click('[data-testid="calc-reset"]');
    check('reset returns to 4 servings', (await page.locator('[data-testid="calc-servings"]').inputValue()) === '4');

    // 7. Original recipe is untouched by scaling.
    await page.click('[data-testid="nav-recipes"]');
    check('original still 4 servings after scaling', (await page.locator('.recipe-meta').first().textContent()).includes('4 servings'));

    // 8. Generate shopping list from scaled quantities.
    await page.click('[data-testid="nav-calculator"]');
    await page.locator('[data-testid="calc-servings"]').fill('6');
    await page.locator('[data-testid="calc-servings"]').press('Tab');
    await sleep(200);
    await page.click('[data-testid="calc-to-shopping"]');
    await page.waitForSelector('[data-testid="shopping-list"]');
    const shopText = await page.locator('[data-testid="shopping-list"]').textContent();
    check('shopping list has 300 g Rice', shopText.includes('300 g Rice'));
    check('shopping list has 4 items', (await page.locator('.shopping-item').count()) === 4);

    // 9. Manual add merges same name+unit; different unit stays separate.
    await page.fill('[data-testid="shop-qty"]', '100');
    await page.fill('[data-testid="shop-unit"]', 'g');
    await page.fill('[data-testid="shop-name"]', 'rice');
    await page.click('[data-testid="shop-add"]');
    await sleep(200);
    const mergedText = await page.locator('[data-testid="shopping-list"]').textContent();
    check('same name+unit merges to 400 g Rice', mergedText.includes('400 g Rice'));
    check('merge keeps 4 items', (await page.locator('.shopping-item').count()) === 4);
    await page.fill('[data-testid="shop-qty"]', '1');
    await page.fill('[data-testid="shop-unit"]', 'kg');
    await page.fill('[data-testid="shop-name"]', 'Rice');
    await page.click('[data-testid="shop-add"]');
    await sleep(200);
    check('different unit adds a separate line', (await page.locator('.shopping-item').count()) === 5);

    // 10. Mark purchased, copy list as text.
    await page.locator('.shopping-item input[type="checkbox"]').first().check();
    check('purchased item gets purchased style', await page.locator('.shopping-item.purchased').first().isVisible());
    await page.click('[data-testid="shop-copy"]');
    await sleep(300);
    let copied = null;
    try { copied = await page.evaluate(() => navigator.clipboard.readText()); } catch { copied = null; }
    if (copied !== null) {
      check('copied text has checked and unchecked lines', copied.includes('[x]') && copied.includes('[ ]') && copied.includes('Rice'));
    } else {
      check('copy shows success toast', (await page.locator('#toast').textContent()).includes('copied'));
    }

    // 11. Persistence across reload.
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="nav-dashboard"]');
    check('data survives reload', (await page.locator('.stat-value').first().textContent()) === '1');
    await page.click('[data-testid="nav-shopping"]');
    check('shopping list survives reload', (await page.locator('.shopping-item').count()) === 5);

    // 12. Duplicate recipe.
    await page.click('[data-testid="nav-recipes"]');
    await page.locator('.recipe-card .btn', { hasText: 'Duplicate' }).first().click();
    await sleep(300);
    check('duplicate creates a copy', (await page.locator('[data-testid="recipe-count"]').textContent()).includes('2 recipes'));
    check('copy is named with (copy)', (await page.locator('.recipe-card h3').nth(0).textContent()).includes('(copy)'));

    // 13. Edit recipe.
    await page.locator('.recipe-card .btn', { hasText: 'Edit' }).first().click();
    await page.fill('[data-testid="recipe-name"]', 'Chicken Rice Deluxe');
    await page.click('[data-testid="save-recipe"]');
    await sleep(300);
    check('edited name is saved', (await page.locator('.recipe-card h3').first().textContent()) === 'Chicken Rice Deluxe');

    // 14. Backup export downloads valid JSON; bad import rejected, good import accepted.
    await page.click('[data-testid="nav-settings"]');
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
    await page.click('[data-testid="export-backup"]');
    const download = await downloadPromise;
    const downloadPath = path.join(ROOT, 'tests', '.export-check.json');
    await download.saveAs(downloadPath);
    const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
    check('exported backup is valid PortionPilot JSON', exported.app === 'portionpilot' && exported.version === 1 && exported.recipes.length === 2);
    fs.unlinkSync(downloadPath);

    await page.setInputFiles('[data-testid="import-backup"]', path.join(ROOT, 'tests', 'bad-backup.json'));
    await sleep(400);
    check('invalid backup rejected with data intact', (await page.locator('[data-testid="import-status"]').textContent()).includes('not a valid'));
    await page.click('[data-testid="nav-recipes"]');
    check('data intact after rejected import', (await page.locator('[data-testid="recipe-count"]').textContent()).includes('2 recipes'));

    await page.click('[data-testid="nav-settings"]');
    await page.setInputFiles('[data-testid="import-backup"]', path.join(ROOT, 'tests', 'good-backup.json'));
    await sleep(400);
    await page.locator('.modal-actions .btn-danger').click(); // confirm replace
    await sleep(400);
    await page.click('[data-testid="nav-recipes"]');
    check('valid import replaces data with Morning Oats', (await page.locator('.recipe-card h3').first().textContent()) === 'Morning Oats');

    // 15. Dark theme applies and persists.
    await page.click('[data-testid="nav-settings"]');
    await page.click('[data-testid="theme-dark"]');
    check('dark theme applies', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await page.reload({ waitUntil: 'load' });
    check('dark theme persists after reload', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await page.click('[data-testid="theme-light"]');

    // 16. Delete-all gating.
    await page.click('[data-testid="nav-settings"]');
    check('delete-all disabled until DELETE is typed', await page.locator('[data-testid="delete-all-btn"]').isDisabled());
    await page.fill('[data-testid="delete-all-input"]', 'delete');
    check('lowercase delete keeps button disabled', await page.locator('[data-testid="delete-all-btn"]').isDisabled());
    await page.fill('[data-testid="delete-all-input"]', 'DELETE');
    await page.click('[data-testid="delete-all-btn"]');
    await page.locator('.modal-actions .btn-danger').click();
    await sleep(400);
    check('delete-all empties the dashboard', (await page.locator('.stat-value').first().textContent()) === '0');

    // 16b. Tiny-quantity regression (review round 1): 0.01 g, 100 -> 1 serving.
    await page.click('[data-testid="nav-recipes"]');
    await page.click('text=Add recipe');
    await page.fill('[data-testid="recipe-name"]', 'Saffron Pinch');
    await page.fill('[data-testid="recipe-servings"]', '100');
    await page.locator('[data-testid="ingredient-qty"]').first().fill('0.01');
    await page.locator('[data-testid="ingredient-unit"]').first().fill('g');
    await page.locator('[data-testid="ingredient-name"]').first().fill('Saffron');
    await page.click('[data-testid="save-recipe"]');
    await page.waitForSelector('[data-testid="recipe-results"]');
    await page.click('[data-testid="nav-calculator"]');
    await page.locator('[data-testid="calc-servings"]').fill('1');
    await page.locator('[data-testid="calc-servings"]').press('Tab');
    await sleep(200);
    const tinyRows = await page.locator('[data-testid="calc-rows"]').textContent();
    check('tiny quantity scales to 0.0001 g, not zero', tinyRows.includes('0.0001 g'));
    await page.click('[data-testid="calc-to-shopping"]');
    await sleep(300);
    const tinyShop = await page.locator('[data-testid="shopping-list"]').textContent();
    check('shopping list keeps 0.0001 g', tinyShop.includes('0.0001 g Saffron'));
    await page.fill('[data-testid="shop-qty"]', '0.0002');
    await page.fill('[data-testid="shop-unit"]', 'g');
    await page.fill('[data-testid="shop-name"]', 'Saffron');
    await page.click('[data-testid="shop-add"]');
    await sleep(200);
    const mergedTiny = await page.locator('[data-testid="shopping-list"]').textContent();
    check('tiny merge gives 0.0003 g', mergedTiny.includes('0.0003 g Saffron'));
    await page.click('[data-testid="nav-settings"]');
    const download2Promise = page.waitForEvent('download', { timeout: 5000 });
    await page.click('[data-testid="export-backup"]');
    const download2 = await download2Promise;
    const tinyPath = path.join(ROOT, 'tests', '.export-tiny-check.json');
    await download2.saveAs(tinyPath);
    const tinyExport = JSON.parse(fs.readFileSync(tinyPath, 'utf8'));
    check('exported backup keeps 0.01 g original', tinyExport.recipes[0].ingredients[0].quantity === 0.01);
    await page.setInputFiles('[data-testid="import-backup"]', tinyPath);
    await sleep(400);
    await page.locator('.modal-actions .btn-danger').click();
    await sleep(400);
    fs.unlinkSync(tinyPath);
    await page.click('[data-testid="nav-calculator"]');
    await page.locator('[data-testid="calc-servings"]').fill('1');
    await page.locator('[data-testid="calc-servings"]').press('Tab');
    await sleep(200);
    const restoredRows = await page.locator('[data-testid="calc-rows"]').textContent();
    check('restored tiny quantity still scales to 0.0001 g', restoredRows.includes('0.0001 g'));

    // 17. Responsive: no horizontal overflow; bottom nav on mobile, sidebar on desktop.
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await sleep(200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      check(`no horizontal overflow at ${width}px`, !overflow);
    }
    await page.setViewportSize({ width: 375, height: 800 });
    check('bottom nav visible at 375px', await page.locator('#bottom-nav').isVisible());
    await page.setViewportSize({ width: 1024, height: 800 });
    check('sidebar visible at 1024px', await page.locator('.sidebar').isVisible());
    check('bottom nav hidden at 1024px', !(await page.locator('#bottom-nav').isVisible()));

    // 18. Keyboard focus is visible.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('[data-testid="nav-recipes"]');
    await page.keyboard.press('Tab');
    const focusVisible = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return false;
      const style = getComputedStyle(active);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    });
    check('keyboard focus is visible', focusVisible);

    // 19. Offline: service worker serves the app with network off.
    await page.goto(base, { waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await sleep(500);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(1200);
    const offlineHeading = await page.locator('h1').first().textContent().catch(() => '');
    check('app loads offline from service worker', offlineHeading.includes('Cook the right amount'));
    await context.setOffline(false);

    // 20. Zero console errors and zero external requests.
    check('zero console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('zero external requests', externalRequests.length === 0, externalRequests.slice(0, 3).join(', '));
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failures: ' + failures.join(', '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('Test run crashed:', err);
  process.exit(1);
});
