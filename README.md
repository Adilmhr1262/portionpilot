# PortionPilot — Cook the right amount, every time.

A personal recipe scaling and ingredient calculator. Save recipes, adjust the
serving size, and every ingredient quantity is recalculated instantly. Generate
a shopping checklist from the scaled quantities.

## Features

- **Dashboard** — recipe count, favourites, shopping items left, recently added recipes.
- **My Recipes** — create, edit, search, filter, sort, duplicate and delete recipes.
  Recipes have a name, category (Breakfast, Lunch, Dinner, Snacks, Desserts,
  Other), original serving size, preparation notes, and unlimited ingredients
  (quantity, unit, name). Favourite recipes with the star toggle.
- **Recipe Calculator** — pick a recipe, step servings up or down, and see the
  original and adjusted quantity side by side. Scaling never changes the saved
  recipe. Reset returns to the original serving size.
- **Shopping List** — generate a checklist from adjusted recipe quantities.
  Identical ingredients with the same unit are combined into one line; different
  units are never merged. Add, edit and remove items by hand, mark items as
  purchased, clear purchased items, and copy the list as plain text.
- **Settings** — light, dark and system themes; JSON backup export and validated
  restore; delete-all gated on typing DELETE.

## How scaling works

Scaled quantity = original quantity x (desired servings / original servings).
Precision is kept internally: quantities are never rounded before they are
stored, merged, or exported. Rounding happens only for display — up to two
decimals for ordinary quantities (0.1 x 3 shows as 0.3, not
0.30000000000000004), and four significant figures for very small quantities,
so a valid positive quantity never displays as zero (0.01 g scaled from 100
servings to 1 shows as 0.0001 g). The original recipe is stored untouched;
scaling only affects the calculator view and the generated shopping list.

## Tech

- HTML5, CSS3, vanilla JavaScript (ES modules). No backend, no accounts, no
  frameworks, no external requests.
- All data in `localStorage` under the `portionpilot.*.v1` keys.
- A service worker caches the app shell so it works offline after the first load.
- Responsive: sidebar navigation on desktop, bottom navigation on mobile.
  44px minimum touch targets, visible keyboard focus, reduced-motion support.

## Files

- `index.html` — app shell and navigation
- `styles.css` — all styling (forest green / warm cream / orange)
- `app.js` — UI, routing, forms
- `storage.js` — localStorage persistence and data validation
- `calculator.js` — pure scaling, formatting and merging logic
- `backup.js` — JSON backup export and validated import
- `sw.js` — offline service worker
- `manifest.webmanifest` — installable web app manifest

## Tests

- Unit tests: `node --test tests/portionpilot-unit.js`
- Browser tests (headless Firefox via Playwright): `node tests/portionpilot-test.cjs`
- Live check (after deploying to GitHub Pages): `node tests/portionpilot-live-check.cjs <url>`

## Privacy

Everything stays on your device. There are no accounts, no analytics, no
network requests to third parties, and no data leaves the browser except when
you choose Export backup or Copy list.
