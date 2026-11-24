// PortionPilot — single-page app: dashboard, recipes, calculator, shopping, settings.
// All user text is inserted with textContent (never innerHTML), so recipe names
// and notes cannot inject markup. Data lives in localStorage via storage.js.
import {
  loadAll, saveRecipes, saveShopping, saveSettings, clearAllData,
  createId, validateRecipe, validateShoppingItem,
} from './storage.js';
import {
  CATEGORIES, COMMON_UNITS, scaleRecipe, formatQuantity, mergeKey,
  buildShoppingItems, formatShoppingListText, isValidQuantity,
} from './calculator.js';
import { buildBackup, serializeBackup, parseBackupJson, validateBackup, backupFileName } from './backup.js';

const state = loadAll();
let recipes = state.recipes;
let shopping = state.shopping;
let settings = state.settings;

// Calculator view state (never written back into the recipe).
const calc = { recipeId: null, target: null };

const viewEl = document.getElementById('view');
const toastEl = document.getElementById('toast');
const modalRoot = document.getElementById('modal-root');

// ---------- small DOM helpers ----------

function el(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.testid) node.dataset.testid = options.testid;
  if (options.attrs) {
    for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
  }
  if (options.children) {
    for (const child of options.children) if (child) node.append(child);
  }
  return node;
}

function icon(name, label) {
  const paths = {
    home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
    book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
    calculator: 'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 5h2m3 0h2m3 0h0M7 12h2m3 0h2m3 0h0M7 16h2m3 0h2',
    cart: 'M3 3h2l2.4 12.2A2 2 0 0 0 9.4 17h8.9a2 2 0 0 0 2-1.6L22 7H6m4 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2z',
    star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9 2.9-6z',
    plus: 'M12 5v14M5 12h14',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm10 3-4.5-4.5',
    trash: 'M3 6h18M8 6V4h8v2m1 0-1 14a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1L7 6',
    copy: 'M9 9h11v11H9zM5 15V4a1 1 0 0 1 1-1h9',
    download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
    upload: 'M12 21V9m0 0 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
    edit: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
    x: 'M18 6 6 18M6 6l12 12',
    check: 'M20 6 9 17l-5-5',
    minus: 'M5 12h14',
    chef: 'M6 13.5A2.5 2.5 0 0 1 8.5 11c.3-2 1.9-3.5 4-3.5S16.2 9 16.5 11A2.5 2.5 0 0 1 19 13.5 2.5 2.5 0 0 1 16.5 16h-9A2.5 2.5 0 0 1 6 13.5zM5 16v4h14v-4',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[name] || paths.home);
  svg.append(path);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  }
  return svg;
}

function toast(message, kind = 'info') {
  toastEl.textContent = message;
  toastEl.className = 'toast show ' + kind;
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => { toastEl.className = 'toast'; }, 3500);
}

function persistRecipes() {
  if (!saveRecipes(recipes)) toast('Could not save recipes: browser storage is unavailable.', 'error');
}

function persistShopping() {
  if (!saveShopping(shopping)) toast('Could not save the shopping list: browser storage is unavailable.', 'error');
}

function persistSettings() {
  if (!saveSettings(settings)) toast('Could not save settings: browser storage is unavailable.', 'error');
}

function go(hash) {
  location.hash = hash;
}

function downloadFile(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// ---------- confirm modal ----------

function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    modalRoot.innerHTML = '';
    const overlay = el('div', { className: 'modal-overlay' });
    const dialog = el('div', { className: 'modal', attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title } });
    dialog.append(el('h2', { text: title }));
    dialog.append(el('p', { text: message }));
    const actions = el('div', { className: 'modal-actions' });
    const cancelBtn = el('button', { className: 'btn btn-secondary', text: 'Cancel' });
    const okBtn = el('button', { className: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), text: confirmLabel });
    actions.append(cancelBtn, okBtn);
    dialog.append(actions);
    overlay.append(dialog);
    modalRoot.append(overlay);
    const previouslyFocused = document.activeElement;
    const close = (value) => {
      modalRoot.innerHTML = '';
      document.removeEventListener('keydown', onKey, true);
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    okBtn.focus();
  });
}

// ---------- theme ----------

function applyTheme() {
  let theme = settings.theme;
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (settings.theme === 'system') applyTheme();
});

// ---------- routing ----------

const NAV = [
  { id: 'dashboard', hash: '#/', label: 'Home', iconName: 'home' },
  { id: 'recipes', hash: '#/recipes', label: 'Recipes', iconName: 'book' },
  { id: 'calculator', hash: '#/calculator', label: 'Calculator', iconName: 'calculator' },
  { id: 'shopping', hash: '#/shopping', label: 'Shopping', iconName: 'cart' },
  { id: 'settings', hash: '#/settings', label: 'Settings', iconName: 'settings' },
];

function currentRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  return { parts, raw: hash };
}

function renderNav(activeId) {
  for (const nav of document.querySelectorAll('[data-nav]')) {
    const isActive = nav.dataset.nav === activeId;
    nav.classList.toggle('active', isActive);
    if (isActive) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  }
}

function render() {
  const { parts } = currentRoute();
  viewEl.innerHTML = '';
  if (parts.length === 0) {
    renderNav('dashboard');
    renderDashboard();
  } else if (parts[0] === 'recipes' && parts[1] === 'new') {
    renderNav('recipes');
    renderRecipeForm(null);
  } else if (parts[0] === 'recipes' && parts[1] === 'edit' && parts[2]) {
    renderNav('recipes');
    const recipe = recipes.find((r) => r.id === parts[2]);
    if (recipe) renderRecipeForm(recipe);
    else { toast('Recipe not found.', 'error'); go('#/recipes'); }
  } else if (parts[0] === 'recipes') {
    renderNav('recipes');
    renderRecipes();
  } else if (parts[0] === 'calculator') {
    renderNav('calculator');
    renderCalculator(parts[1] || null);
  } else if (parts[0] === 'shopping') {
    renderNav('shopping');
    renderShopping();
  } else if (parts[0] === 'settings') {
    renderNav('settings');
    renderSettings();
  } else {
    renderNav('dashboard');
    renderDashboard();
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

// ---------- shared view pieces ----------

function pageHeader(title, subtitle, actions = []) {
  const header = el('header', { className: 'page-header' });
  const textWrap = el('div');
  textWrap.append(el('h1', { text: title }));
  if (subtitle) textWrap.append(el('p', { className: 'page-subtitle', text: subtitle }));
  header.append(textWrap);
  for (const action of actions) header.append(action);
  return header;
}

function emptyState(message, actionBtn = null) {
  const box = el('div', { className: 'empty-state' });
  box.append(el('p', { text: message }));
  if (actionBtn) box.append(actionBtn);
  return box;
}

function recipeById(id) {
  return recipes.find((r) => r.id === id) || null;
}

function sortedRecipes(list, sort) {
  const copy = [...list];
  if (sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'servings') copy.sort((a, b) => a.servings - b.servings);
  else copy.sort((a, b) => b.createdAt - a.createdAt);
  return copy;
}

function recipeCard(recipe) {
  const card = el('article', { className: 'recipe-card' });
  const top = el('div', { className: 'recipe-card-top' });
  top.append(el('h3', { text: recipe.name }));
  const favBtn = el('button', {
    className: 'icon-btn fav-btn' + (recipe.favorite ? ' fav-on' : ''),
    attrs: { 'aria-label': (recipe.favorite ? 'Remove from favourites: ' : 'Add to favourites: ') + recipe.name, 'aria-pressed': String(recipe.favorite) },
    testid: 'fav-' + recipe.id,
  });
  favBtn.append(icon('star'));
  favBtn.addEventListener('click', () => {
    recipe.favorite = !recipe.favorite;
    recipe.updatedAt = Date.now();
    persistRecipes();
    render();
    toast(recipe.favorite ? `"${recipe.name}" added to favourites.` : `"${recipe.name}" removed from favourites.`);
  });
  top.append(favBtn);
  card.append(top);
  const meta = el('p', { className: 'recipe-meta' });
  meta.append(el('span', { className: 'chip', text: recipe.category }));
  meta.append(document.createTextNode(` ${recipe.servings} servings · ${recipe.ingredients.length} ingredients`));
  card.append(meta);
  if (recipe.notes) card.append(el('p', { className: 'recipe-notes', text: recipe.notes }));
  const actions = el('div', { className: 'card-actions' });
  const calcBtn = el('button', { className: 'btn btn-primary btn-small', text: 'Calculate' });
  calcBtn.prepend(icon('calculator'));
  calcBtn.addEventListener('click', () => go('#/calculator/' + recipe.id));
  const editBtn = el('button', { className: 'btn btn-secondary btn-small', text: 'Edit' });
  editBtn.prepend(icon('edit'));
  editBtn.addEventListener('click', () => go('#/recipes/edit/' + recipe.id));
  const dupBtn = el('button', { className: 'btn btn-secondary btn-small', text: 'Duplicate' });
  dupBtn.prepend(icon('copy'));
  dupBtn.addEventListener('click', () => duplicateRecipe(recipe));
  const delBtn = el('button', { className: 'btn btn-danger-outline btn-small', text: 'Delete' });
  delBtn.prepend(icon('trash'));
  delBtn.addEventListener('click', () => deleteRecipe(recipe));
  actions.append(calcBtn, editBtn, dupBtn, delBtn);
  card.append(actions);
  return card;
}

async function deleteRecipe(recipe) {
  const ok = await confirmDialog({
    title: 'Delete recipe?',
    message: `"${recipe.name}" will be permanently deleted. This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  recipes = recipes.filter((r) => r.id !== recipe.id);
  persistRecipes();
  toast(`"${recipe.name}" deleted.`);
  render();
}

function duplicateRecipe(recipe) {
  const copy = {
    ...recipe,
    id: createId(),
    name: recipe.name + ' (copy)',
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ingredients: recipe.ingredients.map((ing) => ({ ...ing, id: createId() })),
  };
  recipes = [copy, ...recipes];
  persistRecipes();
  toast(`Duplicated as "${copy.name}".`);
  render();
}

// ---------- dashboard ----------

function renderDashboard() {
  const favs = recipes.filter((r) => r.favorite);
  const recent = sortedRecipes(recipes, 'newest').slice(0, 5);
  const remaining = shopping.filter((i) => !i.purchased).length;

  const addBtn = el('button', { className: 'btn btn-primary', text: 'Add recipe' });
  addBtn.prepend(icon('plus'));
  addBtn.addEventListener('click', () => go('#/recipes/new'));
  viewEl.append(pageHeader('Cook the right amount, every time.', 'Save recipes, scale servings, and shop with the exact quantities.', [addBtn]));

  const stats = el('div', { className: 'stat-grid' });
  const statData = [
    { label: 'Recipes', value: String(recipes.length) },
    { label: 'Favourites', value: String(favs.length) },
    { label: 'Shopping items left', value: String(remaining) },
    { label: 'Total ingredients', value: String(recipes.reduce((n, r) => n + r.ingredients.length, 0)) },
  ];
  for (const s of statData) {
    const card = el('div', { className: 'stat-card' });
    card.append(el('p', { className: 'stat-value', text: s.value }));
    card.append(el('p', { className: 'stat-label', text: s.label }));
    stats.append(card);
  }
  viewEl.append(stats);

  const favSection = el('section', { className: 'section' });
  favSection.append(el('h2', { text: 'Favourites' }));
  if (favs.length === 0) {
    favSection.append(el('p', { className: 'muted', text: 'No favourites yet. Tap the star on any recipe to pin it here.' }));
  } else {
    const grid = el('div', { className: 'card-grid' });
    for (const r of favs) grid.append(recipeCard(r));
    favSection.append(grid);
  }
  viewEl.append(favSection);

  const recentSection = el('section', { className: 'section' });
  recentSection.append(el('h2', { text: 'Recently added' }));
  if (recent.length === 0) {
    const btn = el('button', { className: 'btn btn-primary', text: 'Add your first recipe' });
    btn.addEventListener('click', () => go('#/recipes/new'));
    recentSection.append(emptyState('No recipes yet. Add your first recipe to start scaling.', btn));
  } else {
    const grid = el('div', { className: 'card-grid' });
    for (const r of recent) grid.append(recipeCard(r));
    recentSection.append(grid);
  }
  viewEl.append(recentSection);
}

// ---------- my recipes ----------

function renderRecipes() {
  const addBtn = el('button', { className: 'btn btn-primary', text: 'Add recipe' });
  addBtn.prepend(icon('plus'));
  addBtn.addEventListener('click', () => go('#/recipes/new'));
  viewEl.append(pageHeader('My Recipes', 'Create, edit, search, duplicate and delete recipes.', [addBtn]));

  const controls = el('div', { className: 'filter-row' });
  const searchWrap = el('div', { className: 'search-wrap' });
  const searchInput = el('input', {
    attrs: { type: 'search', placeholder: 'Search recipes or ingredients', 'aria-label': 'Search recipes or ingredients' },
    testid: 'search-recipes',
  });
  searchWrap.append(icon('search'));
  searchWrap.append(searchInput);
  const categorySelect = el('select', { attrs: { 'aria-label': 'Filter by category' }, testid: 'filter-category' });
  categorySelect.append(el('option', { text: 'All categories', attrs: { value: '' } }));
  for (const c of CATEGORIES) categorySelect.append(el('option', { text: c, attrs: { value: c } }));
  const sortSelect = el('select', { attrs: { 'aria-label': 'Sort recipes' }, testid: 'sort-recipes' });
  for (const [value, label] of [['newest', 'Newest first'], ['name', 'Name A–Z'], ['servings', 'Servings: low to high']]) {
    sortSelect.append(el('option', { text: label, attrs: { value } }));
  }
  controls.append(searchWrap, categorySelect, sortSelect);
  viewEl.append(controls);

  const results = el('div', { className: 'card-grid', testid: 'recipe-results' });
  viewEl.append(results);
  const countLine = el('p', { className: 'muted', testid: 'recipe-count' });
  viewEl.append(countLine);

  function refresh() {
    const q = searchInput.value.trim().toLowerCase();
    const cat = categorySelect.value;
    let list = recipes.filter((r) => {
      if (cat && r.category !== cat) return false;
      if (!q) return true;
      if (r.name.toLowerCase().includes(q)) return true;
      return r.ingredients.some((ing) => ing.name.toLowerCase().includes(q));
    });
    list = sortedRecipes(list, sortSelect.value);
    results.innerHTML = '';
    countLine.textContent = list.length === 1 ? '1 recipe' : `${list.length} recipes`;
    if (list.length === 0) {
      results.append(emptyState(recipes.length === 0
        ? 'No recipes yet. Add your first recipe to start scaling.'
        : 'No recipes match your search. Try a different term or filter.'));
    } else {
      for (const r of list) results.append(recipeCard(r));
    }
  }

  searchInput.addEventListener('input', refresh);
  categorySelect.addEventListener('change', refresh);
  sortSelect.addEventListener('change', refresh);
  refresh();
}

// ---------- recipe form ----------

function renderRecipeForm(existing) {
  const isEdit = existing !== null;
  viewEl.append(pageHeader(
    isEdit ? 'Edit recipe' : 'Add recipe',
    isEdit ? 'Changes update the saved recipe. Scaling never changes the original.' : 'Add ingredients with a quantity, a unit and a name.',
  ));

  const form = el('form', { className: 'form', attrs: { novalidate: '' } });
  const errorBox = el('div', { className: 'form-errors', attrs: { role: 'alert', hidden: '' } });
  form.append(errorBox);

  const nameField = el('div', { className: 'field' });
  const nameLabel = el('label', { text: 'Recipe name', attrs: { for: 'recipe-name' } });
  const nameInput = el('input', { attrs: { id: 'recipe-name', type: 'text', maxlength: '120', required: '', autocomplete: 'off' }, testid: 'recipe-name' });
  if (isEdit) nameInput.value = existing.name;
  nameField.append(nameLabel, nameInput);
  form.append(nameField);

  const row2 = el('div', { className: 'field-row' });
  const catField = el('div', { className: 'field' });
  const catLabel = el('label', { text: 'Category', attrs: { for: 'recipe-category' } });
  const catSelect = el('select', { attrs: { id: 'recipe-category' }, testid: 'recipe-category' });
  for (const c of CATEGORIES) {
    const opt = el('option', { text: c, attrs: { value: c } });
    if (isEdit && existing.category === c) opt.selected = true;
    catSelect.append(opt);
  }
  catField.append(catLabel, catSelect);
  const servField = el('div', { className: 'field' });
  const servLabel = el('label', { text: 'Original servings', attrs: { for: 'recipe-servings' } });
  const servInput = el('input', { attrs: { id: 'recipe-servings', type: 'number', min: '1', max: '100', step: '1', inputmode: 'numeric', required: '' }, testid: 'recipe-servings' });
  servInput.value = isEdit ? String(existing.servings) : '4';
  servField.append(servLabel, servInput);
  row2.append(catField, servField);
  form.append(row2);

  const notesField = el('div', { className: 'field' });
  const notesLabel = el('label', { text: 'Preparation notes (optional)', attrs: { for: 'recipe-notes' } });
  const notesInput = el('textarea', { attrs: { id: 'recipe-notes', rows: '3', maxlength: '2000' }, testid: 'recipe-notes' });
  if (isEdit) notesInput.value = existing.notes;
  notesField.append(notesLabel, notesInput);
  form.append(notesField);

  const ingSection = el('fieldset', { className: 'ingredients-fieldset' });
  ingSection.append(el('legend', { text: 'Ingredients' }));
  const ingList = el('div', { className: 'ingredient-list', testid: 'ingredient-list' });
  ingSection.append(ingList);
  const addIngBtn = el('button', { className: 'btn btn-secondary btn-small', text: 'Add ingredient', attrs: { type: 'button' }, testid: 'add-ingredient' });
  addIngBtn.prepend(icon('plus'));
  ingSection.append(addIngBtn);
  form.append(ingSection);

  const unitList = el('datalist', { attrs: { id: 'unit-suggestions' } });
  for (const u of COMMON_UNITS) unitList.append(el('option', { attrs: { value: u } }));
  form.append(unitList);

  function ingredientRow(ing) {
    const row = el('div', { className: 'ingredient-row' });
    const qty = el('input', { attrs: { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: 'Qty', 'aria-label': 'Ingredient quantity', required: '' }, testid: 'ingredient-qty' });
    const unit = el('input', { attrs: { type: 'text', list: 'unit-suggestions', maxlength: '30', placeholder: 'Unit (g, ml, tsp…)', 'aria-label': 'Ingredient unit', autocomplete: 'off' }, testid: 'ingredient-unit' });
    const name = el('input', { attrs: { type: 'text', maxlength: '120', placeholder: 'Ingredient name', 'aria-label': 'Ingredient name', required: '', autocomplete: 'off' }, testid: 'ingredient-name' });
    if (ing) {
      qty.value = String(ing.quantity);
      unit.value = ing.unit;
      name.value = ing.name;
      row.dataset.ingredientId = ing.id;
    } else {
      row.dataset.ingredientId = createId();
    }
    const removeBtn = el('button', { className: 'icon-btn', attrs: { type: 'button', 'aria-label': 'Remove ingredient' }, testid: 'remove-ingredient' });
    removeBtn.append(icon('x'));
    removeBtn.addEventListener('click', () => {
      if (ingList.children.length <= 1) {
        toast('A recipe needs at least one ingredient.', 'error');
        return;
      }
      row.remove();
    });
    row.append(qty, unit, name, removeBtn);
    return row;
  }

  if (isEdit) {
    for (const ing of existing.ingredients) ingList.append(ingredientRow(ing));
  } else {
    ingList.append(ingredientRow(null));
  }
  addIngBtn.addEventListener('click', () => ingList.append(ingredientRow(null)));

  const actions = el('div', { className: 'form-actions' });
  const saveBtn = el('button', { className: 'btn btn-primary', text: isEdit ? 'Save changes' : 'Save recipe', attrs: { type: 'submit' }, testid: 'save-recipe' });
  const cancelBtn = el('button', { className: 'btn btn-secondary', text: 'Cancel', attrs: { type: 'button' } });
  cancelBtn.addEventListener('click', () => go('#/recipes'));
  actions.append(saveBtn, cancelBtn);
  form.append(actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errors = [];
    const name = nameInput.value.trim();
    if (!name) errors.push('Recipe name is required.');
    if (name.length > 120) errors.push('Recipe name must be at most 120 characters.');
    const servings = Number(servInput.value);
    if (!Number.isInteger(servings) || servings < 1 || servings > 100) {
      errors.push('Original servings must be a whole number from 1 to 100.');
    }
    const category = catSelect.value;
    if (!CATEGORIES.includes(category)) errors.push('Choose a valid category.');
    const notes = notesInput.value;
    if (notes.length > 2000) errors.push('Preparation notes must be at most 2000 characters.');

    const ingredients = [];
    for (const row of ingList.children) {
      const qtyInput = row.querySelector('[data-testid="ingredient-qty"]');
      const unitInput = row.querySelector('[data-testid="ingredient-unit"]');
      const nameInputRow = row.querySelector('[data-testid="ingredient-name"]');
      const qty = Number(qtyInput.value);
      const ingName = nameInputRow.value.trim();
      const unit = unitInput.value.trim();
      if (!ingName && qtyInput.value.trim() === '' && unit === '') continue; // skip a fully blank row
      if (!ingName) errors.push('Every ingredient needs a name.');
      if (!isValidQuantity(qty)) errors.push(`Quantity for "${ingName || 'ingredient'}" must be a number greater than 0.`);
      if (unit.length > 30) errors.push('Ingredient unit must be at most 30 characters.');
      ingredients.push({ id: row.dataset.ingredientId, name: ingName, unit, quantity: qty });
    }
    if (ingredients.length === 0) errors.push('Add at least one ingredient.');

    if (errors.length > 0) {
      errorBox.innerHTML = '';
      errorBox.removeAttribute('hidden');
      const list = el('ul');
      for (const msg of errors) list.append(el('li', { text: msg }));
      errorBox.append(el('strong', { text: 'Please fix the following:' }), list);
      errorBox.scrollIntoView({ block: 'nearest' });
      return;
    }

    const now = Date.now();
    const recipe = {
      id: isEdit ? existing.id : createId(),
      name,
      category,
      servings,
      notes,
      favorite: isEdit ? existing.favorite : false,
      createdAt: isEdit ? existing.createdAt : now,
      updatedAt: now,
      ingredients,
    };
    const validationErrors = validateRecipe(recipe);
    if (validationErrors.length > 0) {
      errorBox.innerHTML = '';
      errorBox.removeAttribute('hidden');
      const list = el('ul');
      for (const msg of validationErrors) list.append(el('li', { text: msg }));
      errorBox.append(el('strong', { text: 'Please fix the following:' }), list);
      return;
    }
    if (isEdit) {
      recipes = recipes.map((r) => (r.id === recipe.id ? recipe : r));
      toast(`"${name}" saved.`);
    } else {
      recipes = [recipe, ...recipes];
      toast(`"${name}" added.`);
    }
    persistRecipes();
    go('#/recipes');
  });

  viewEl.append(form);
}

// ---------- calculator ----------

function renderCalculator(preselectedId) {
  viewEl.append(pageHeader('Recipe Calculator', 'Pick a recipe, set the servings you need, and every ingredient is recalculated. The original recipe is never changed.'));

  if (recipes.length === 0) {
    const btn = el('button', { className: 'btn btn-primary', text: 'Add your first recipe' });
    btn.addEventListener('click', () => go('#/recipes/new'));
    viewEl.append(emptyState('No recipes yet. Add a recipe first, then scale it here.', btn));
    return;
  }

  if (preselectedId && recipeById(preselectedId)) {
    if (calc.recipeId !== preselectedId) {
      calc.recipeId = preselectedId;
      calc.target = recipeById(preselectedId).servings;
    }
  }
  if (!calc.recipeId || !recipeById(calc.recipeId)) {
    calc.recipeId = recipes[0].id;
    calc.target = recipes[0].servings;
  }
  const recipe = recipeById(calc.recipeId);
  if (calc.target === null || calc.target === undefined) calc.target = recipe.servings;

  const controls = el('div', { className: 'calc-controls' });
  const pickerField = el('div', { className: 'field' });
  pickerField.append(el('label', { text: 'Recipe', attrs: { for: 'calc-recipe' } }));
  const picker = el('select', { attrs: { id: 'calc-recipe' }, testid: 'calc-recipe' });
  for (const r of sortedRecipes(recipes, 'name')) {
    const opt = el('option', { text: `${r.name} (${r.servings} servings)`, attrs: { value: r.id } });
    if (r.id === recipe.id) opt.selected = true;
    picker.append(opt);
  }
  pickerField.append(picker);
  controls.append(pickerField);

  const stepperField = el('div', { className: 'field' });
  stepperField.append(el('label', { text: 'Desired servings', attrs: { for: 'calc-servings' } }));
  const stepper = el('div', { className: 'stepper' });
  const minusBtn = el('button', { className: 'btn btn-secondary stepper-btn', text: '−', attrs: { type: 'button', 'aria-label': 'One fewer serving' }, testid: 'servings-minus' });
  const servingsInput = el('input', { attrs: { id: 'calc-servings', type: 'number', min: '1', max: '100', step: '1', inputmode: 'numeric' }, testid: 'calc-servings' });
  servingsInput.value = String(calc.target);
  const plusBtn = el('button', { className: 'btn btn-secondary stepper-btn', text: '+', attrs: { type: 'button', 'aria-label': 'One more serving' }, testid: 'servings-plus' });
  stepper.append(minusBtn, servingsInput, plusBtn);
  stepperField.append(stepper);
  controls.append(stepperField);
  viewEl.append(controls);

  const summary = el('p', { className: 'calc-summary', testid: 'calc-summary' });
  viewEl.append(summary);

  const tableWrap = el('div', { className: 'table-wrap' });
  const table = el('table', { className: 'calc-table' });
  const thead = el('thead');
  const headRow = el('tr');
  headRow.append(el('th', { text: 'Ingredient' }), el('th', { text: `Original (${recipe.servings} servings)` }), el('th', { text: `Adjusted (${calc.target} servings)` }));
  thead.append(headRow);
  table.append(thead);
  const tbody = el('tbody', { testid: 'calc-rows' });
  table.append(tbody);
  tableWrap.append(table);
  viewEl.append(tableWrap);

  const actions = el('div', { className: 'form-actions' });
  const resetBtn = el('button', { className: 'btn btn-secondary', text: 'Reset to original servings', attrs: { type: 'button' }, testid: 'calc-reset' });
  resetBtn.prepend(icon('x'));
  const shopBtn = el('button', { className: 'btn btn-primary', text: 'Add adjusted to shopping list', attrs: { type: 'button' }, testid: 'calc-to-shopping' });
  shopBtn.prepend(icon('cart'));
  actions.append(resetBtn, shopBtn);
  viewEl.append(actions);

  function refreshTable() {
    const rows = scaleRecipe(recipe, calc.target);
    summary.textContent = `${recipe.name}: original ${recipe.servings} servings, adjusted to ${calc.target} servings (×${formatQuantity(calc.target / recipe.servings)}).`;
    tbody.innerHTML = '';
    if (!rows) {
      const tr = el('tr');
      tr.append(el('td', { text: 'Could not calculate. Check the serving count.', attrs: { colspan: '3' } }));
      tbody.append(tr);
      return;
    }
    for (const row of rows) {
      const tr = el('tr');
      tr.append(el('td', { text: row.name }));
      tr.append(el('td', { text: `${formatQuantity(row.original)}${row.unit ? ' ' + row.unit : ''}` }));
      tr.append(el('td', { text: `${formatQuantity(row.scaled)}${row.unit ? ' ' + row.unit : ''}`, className: 'scaled-cell' }));
      tbody.append(tr);
    }
  }

  function setTarget(value) {
    const n = Math.trunc(Number(value));
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      toast('Servings must be a whole number from 1 to 100.', 'error');
      servingsInput.value = String(calc.target);
      return;
    }
    calc.target = n;
    servingsInput.value = String(n);
    refreshTable();
  }

  picker.addEventListener('change', () => {
    calc.recipeId = picker.value;
    const next = recipeById(calc.recipeId);
    calc.target = next.servings;
    go('#/calculator/' + next.id);
  });
  minusBtn.addEventListener('click', () => setTarget(calc.target - 1));
  plusBtn.addEventListener('click', () => setTarget(calc.target + 1));
  servingsInput.addEventListener('change', () => setTarget(servingsInput.value));
  resetBtn.addEventListener('click', () => {
    calc.target = recipe.servings;
    servingsInput.value = String(recipe.servings);
    refreshTable();
    toast('Reset to the original serving size.');
  });
  shopBtn.addEventListener('click', () => {
    const items = buildShoppingItems(recipe, calc.target);
    if (!items) { toast('Could not build the shopping list.', 'error'); return; }
    let added = 0;
    let merged = 0;
    for (const item of items) {
      const match = shopping.find((s) => !s.purchased && mergeKey(s.name, s.unit) === mergeKey(item.name, item.unit));
      if (match) {
        match.quantity = match.quantity + item.quantity;
        merged++;
      } else {
        shopping.push({ ...item, id: createId() });
        added++;
      }
    }
    persistShopping();
    toast(merged > 0
      ? `${items.length} ingredients added to the shopping list (${merged} merged with existing items).`
      : `${items.length} ingredients added to the shopping list.`);
    go('#/shopping');
  });

  refreshTable();
}

// ---------- shopping list ----------

function renderShopping() {
  viewEl.append(pageHeader('Shopping List', 'Check items off as you buy them. Identical ingredients with the same unit are combined into one line.'));

  const form = el('form', { className: 'shopping-add-form', attrs: { novalidate: '' } });
  const qtyInput = el('input', { attrs: { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: 'Qty', 'aria-label': 'Quantity', required: '' }, testid: 'shop-qty' });
  const unitInput = el('input', { attrs: { type: 'text', list: 'unit-suggestions', maxlength: '30', placeholder: 'Unit', 'aria-label': 'Unit', autocomplete: 'off' }, testid: 'shop-unit' });
  const nameInput = el('input', { attrs: { type: 'text', maxlength: '120', placeholder: 'Ingredient name', 'aria-label': 'Ingredient name', required: '', autocomplete: 'off' }, testid: 'shop-name' });
  const unitList = el('datalist', { attrs: { id: 'unit-suggestions' } });
  for (const u of COMMON_UNITS) unitList.append(el('option', { attrs: { value: u } }));
  const addBtn = el('button', { className: 'btn btn-primary', text: 'Add item', attrs: { type: 'submit' }, testid: 'shop-add' });
  addBtn.prepend(icon('plus'));
  form.append(qtyInput, unitInput, nameInput, addBtn);
  viewEl.append(form, unitList);

  let editingId = null;
  const editHint = el('p', { className: 'muted', attrs: { hidden: '' }, testid: 'shop-edit-hint' });
  viewEl.append(editHint);

  const listEl = el('ul', { className: 'shopping-list', testid: 'shopping-list' });
  viewEl.append(listEl);

  const actions = el('div', { className: 'form-actions' });
  const copyBtn = el('button', { className: 'btn btn-secondary', text: 'Copy list as text', attrs: { type: 'button' }, testid: 'shop-copy' });
  copyBtn.prepend(icon('copy'));
  const clearBtn = el('button', { className: 'btn btn-secondary', text: 'Clear purchased', attrs: { type: 'button' }, testid: 'shop-clear-purchased' });
  clearBtn.prepend(icon('trash'));
  actions.append(copyBtn, clearBtn);
  viewEl.append(actions);

  function refreshList() {
    listEl.innerHTML = '';
    if (shopping.length === 0) {
      listEl.append(emptyState('Shopping list is empty. Generate one from a recipe in the Calculator, or add items above.'));
      return;
    }
    for (const item of shopping) {
      const li = el('li', { className: 'shopping-item' + (item.purchased ? ' purchased' : '') });
      const check = el('input', { attrs: { type: 'checkbox', 'aria-label': 'Mark purchased: ' + item.name }, testid: 'shop-check-' + item.id });
      check.checked = item.purchased;
      check.addEventListener('change', () => {
        item.purchased = check.checked;
        persistShopping();
        render();
      });
      const label = el('span', { className: 'shopping-label', text: `${formatQuantity(item.quantity)}${item.unit ? ' ' + item.unit : ''} ${item.name}` });
      const editBtn = el('button', { className: 'icon-btn', attrs: { type: 'button', 'aria-label': 'Edit ' + item.name }, testid: 'shop-edit-' + item.id });
      editBtn.append(icon('edit'));
      editBtn.addEventListener('click', () => {
        editingId = item.id;
        qtyInput.value = String(item.quantity);
        unitInput.value = item.unit;
        nameInput.value = item.name;
        addBtn.textContent = 'Save changes';
        editHint.textContent = `Editing "${item.name}". Save to apply, or clear the form to cancel.`;
        editHint.removeAttribute('hidden');
        nameInput.focus();
      });
      const delBtn = el('button', { className: 'icon-btn', attrs: { type: 'button', 'aria-label': 'Delete ' + item.name }, testid: 'shop-delete-' + item.id });
      delBtn.append(icon('trash'));
      delBtn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Remove item?',
          message: `"${item.name}" will be removed from the shopping list.`,
          confirmLabel: 'Remove',
          danger: true,
        });
        if (!ok) return;
        shopping = shopping.filter((s) => s.id !== item.id);
        persistShopping();
        toast(`"${item.name}" removed.`);
        render();
      });
      li.append(check, label, editBtn, delBtn);
      listEl.append(li);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const qty = Number(qtyInput.value);
    const unit = unitInput.value.trim();
    const name = nameInput.value.trim();
    if (!name) { toast('Ingredient name is required.', 'error'); return; }
    if (!isValidQuantity(qty)) { toast('Quantity must be a number greater than 0.', 'error'); return; }
    if (unit.length > 30) { toast('Unit must be at most 30 characters.', 'error'); return; }
    if (editingId) {
      const item = shopping.find((s) => s.id === editingId);
      if (item) {
        item.name = name;
        item.unit = unit;
        item.quantity = qty;
        const errs = validateShoppingItem(item);
        if (errs.length > 0) { toast(errs[0], 'error'); return; }
        persistShopping();
        toast(`"${name}" updated.`);
      }
      editingId = null;
      addBtn.textContent = 'Add item';
      editHint.setAttribute('hidden', '');
      editHint.textContent = '';
    } else {
      const match = shopping.find((s) => !s.purchased && mergeKey(s.name, s.unit) === mergeKey(name, unit));
      if (match) {
        match.quantity = match.quantity + qty;
        toast(`Merged into the existing "${name}" line.`);
      } else {
        shopping.push({ id: createId(), name, unit, quantity: qty, purchased: false });
        toast(`"${name}" added to the shopping list.`);
      }
      persistShopping();
    }
    qtyInput.value = '';
    unitInput.value = '';
    nameInput.value = '';
    refreshList();
  });

  copyBtn.addEventListener('click', async () => {
    if (shopping.length === 0) { toast('Nothing to copy: the shopping list is empty.', 'error'); return; }
    const ok = await copyText(formatShoppingListText(shopping));
    toast(ok ? 'Shopping list copied as plain text.' : 'Could not copy. Select the list manually.', ok ? 'info' : 'error');
  });

  clearBtn.addEventListener('click', async () => {
    const purchased = shopping.filter((s) => s.purchased);
    if (purchased.length === 0) { toast('No purchased items to clear.', 'error'); return; }
    const ok = await confirmDialog({
      title: 'Clear purchased items?',
      message: `${purchased.length} purchased item(s) will be removed from the list.`,
      confirmLabel: 'Clear',
      danger: true,
    });
    if (!ok) return;
    shopping = shopping.filter((s) => !s.purchased);
    persistShopping();
    toast('Purchased items cleared.');
    render();
  });

  refreshList();
}

// ---------- settings ----------

function renderSettings() {
  viewEl.append(pageHeader('Settings', 'Theme, backup, restore and data management.'));

  const themeSection = el('section', { className: 'section' });
  themeSection.append(el('h2', { text: 'Theme' }));
  const themeForm = el('form', { className: 'theme-picker' });
  for (const [value, label] of [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']]) {
    const wrap = el('label', { className: 'radio-label' });
    const radio = el('input', { attrs: { type: 'radio', name: 'theme', value }, testid: 'theme-' + value });
    radio.checked = settings.theme === value;
    radio.addEventListener('change', () => {
      settings.theme = value;
      persistSettings();
      applyTheme();
      toast(`Theme set to ${label}.`);
    });
    wrap.append(radio, document.createTextNode(label));
    themeForm.append(wrap);
  }
  themeSection.append(themeForm);
  viewEl.append(themeSection);

  if (state.storageInMemory) {
    const warn = el('div', { className: 'notice warning' });
    warn.append(el('strong', { text: 'Browser storage is unavailable. ' }));
    warn.append(document.createTextNode('Your data is kept only in memory for this session and will be lost when you close the tab.'));
    viewEl.append(warn);
  }

  const backupSection = el('section', { className: 'section' });
  backupSection.append(el('h2', { text: 'Backup and restore' }));
  backupSection.append(el('p', { className: 'muted', text: 'Export all recipes and the shopping list as a JSON file. Restoring replaces everything, but only after the file is fully validated.' }));
  const backupActions = el('div', { className: 'form-actions' });
  const exportBtn = el('button', { className: 'btn btn-primary', text: 'Export backup (JSON)', attrs: { type: 'button' }, testid: 'export-backup' });
  exportBtn.prepend(icon('download'));
  exportBtn.addEventListener('click', () => {
    downloadFile(backupFileName(), serializeBackup(buildBackup(recipes, shopping)));
    toast('Backup downloaded.');
  });
  const importLabel = el('label', { className: 'btn btn-secondary file-label', text: 'Import backup (JSON)' });
  importLabel.prepend(icon('upload'));
  const importInput = el('input', { attrs: { type: 'file', accept: '.json,application/json', hidden: '' }, testid: 'import-backup' });
  importLabel.append(importInput);
  backupActions.append(exportBtn, importLabel);
  backupSection.append(backupActions);
  const importStatus = el('div', { className: 'import-status', attrs: { role: 'status' }, testid: 'import-status' });
  backupSection.append(importStatus);
  viewEl.append(backupSection);

  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = '';
    if (!file) return;
    importStatus.innerHTML = '';
    const text = await file.text();
    const parsed = parseBackupJson(text);
    if (!parsed.ok) {
      importStatus.append(el('p', { className: 'error-text', text: 'Import failed: ' + parsed.error + '. Nothing was changed.' }));
      return;
    }
    const result = validateBackup(parsed.data);
    if (!result.ok) {
      importStatus.append(el('p', { className: 'error-text', text: 'Import failed: this file is not a valid PortionPilot backup. Nothing was changed.' }));
      const list = el('ul', { className: 'error-list' });
      for (const err of result.errors.slice(0, 8)) list.append(el('li', { text: err }));
      importStatus.append(list);
      return;
    }
    const ok = await confirmDialog({
      title: 'Replace all data?',
      message: `This backup holds ${result.recipes.length} recipe(s) and ${result.shopping.length} shopping item(s). Importing replaces everything currently saved.`,
      confirmLabel: 'Replace and import',
      danger: true,
    });
    if (!ok) {
      importStatus.append(el('p', { className: 'muted', text: 'Import cancelled. Nothing was changed.' }));
      return;
    }
    recipes = result.recipes;
    shopping = result.shopping;
    persistRecipes();
    persistShopping();
    importStatus.append(el('p', { className: 'success-text', text: `Imported ${result.recipes.length} recipe(s) and ${result.shopping.length} shopping item(s).` }));
    toast('Backup imported.');
    render();
  });

  if (state.corrupted.length > 0) {
    const corruptSection = el('section', { className: 'section' });
    corruptSection.append(el('h2', { text: 'Recovered data problem' }));
    const warn = el('div', { className: 'notice warning' });
    warn.append(el('strong', { text: 'Some saved data was unreadable, so the app started empty for that part. ' }));
    warn.append(document.createTextNode('You can download the unreadable data below before deleting it.'));
    corruptSection.append(warn);
    for (const entry of state.corrupted) {
      const row = el('div', { className: 'form-actions' });
      const dlBtn = el('button', { className: 'btn btn-secondary btn-small', text: 'Download unreadable data (' + entry.key + ')', attrs: { type: 'button' } });
      dlBtn.addEventListener('click', () => downloadFile('portionpilot-corrupted-data.txt', entry.raw, 'text/plain'));
      row.append(dlBtn);
      corruptSection.append(row);
    }
    viewEl.append(corruptSection);
  }

  const dangerSection = el('section', { className: 'section danger-zone' });
  dangerSection.append(el('h2', { text: 'Delete all data' }));
  dangerSection.append(el('p', { className: 'muted', text: 'This permanently deletes every recipe and shopping item. Type DELETE to confirm.' }));
  const deleteInput = el('input', { attrs: { type: 'text', placeholder: 'Type DELETE to confirm', 'aria-label': 'Type DELETE to confirm', autocomplete: 'off' }, testid: 'delete-all-input' });
  const deleteBtn = el('button', { className: 'btn btn-danger', text: 'Delete all data', attrs: { type: 'button', disabled: '' }, testid: 'delete-all-btn' });
  deleteBtn.prepend(icon('trash'));
  deleteInput.addEventListener('input', () => {
    if (deleteInput.value === 'DELETE') deleteBtn.removeAttribute('disabled');
    else deleteBtn.setAttribute('disabled', '');
  });
  deleteBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete everything?',
      message: 'Every recipe and shopping item will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    recipes = [];
    shopping = [];
    clearAllData();
    state.corrupted = [];
    toast('All data deleted.');
    go('#/');
    render();
  });
  const dangerRow = el('div', { className: 'form-actions' });
  dangerRow.append(deleteInput, deleteBtn);
  dangerSection.append(dangerRow);
  viewEl.append(dangerSection);
}

// ---------- navigation wiring + init ----------

function buildNav() {
  const sidebarNav = document.getElementById('sidebar-nav');
  const bottomNav = document.getElementById('bottom-nav');
  for (const item of NAV) {
    for (const container of [sidebarNav, bottomNav]) {
      const link = el('a', { className: 'nav-link', attrs: { href: item.hash }, testid: 'nav-' + item.id });
      link.dataset.nav = item.id;
      link.append(icon(item.iconName));
      link.append(el('span', { text: item.label }));
      link.addEventListener('click', (e) => {
        e.preventDefault();
        go(item.hash);
      });
      container.append(link);
    }
  }
}

applyTheme();
buildNav();
render();

if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline support is a bonus: the app works fully without it.
    });
  });
}
