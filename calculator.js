// PortionPilot — pure scaling, formatting and merging logic.
// No DOM, no storage access: fully unit-testable.
export const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Desserts', 'Other'];

export const COMMON_UNITS = [
  'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'cups',
  'pcs', 'piece', 'pieces', 'clove', 'cloves', 'pinch', 'slice', 'slices',
];

export const MAX_SERVINGS = 100;
export const MAX_QUANTITY = 100000;

/** True when v is a finite number strictly greater than zero. */
export function isValidQuantity(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_QUANTITY;
}

/** True when v is an integer serving count in range. */
export function isValidServings(v) {
  return Number.isInteger(v) && v >= 1 && v <= MAX_SERVINGS;
}

/** Round to two decimal places without binary float artefacts (0.1 * 3 -> 0.3). */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Scale one quantity from `fromServings` to `toServings`.
 * Returns the full-precision scaled quantity, or null for invalid input.
 * Rounding happens ONLY at display time (see formatQuantity): a scaled
 * value is never rounded before it is stored, merged, or exported, so a
 * valid positive quantity can never become zero.
 */
export function scaleQuantity(qty, fromServings, toServings) {
  if (!isValidQuantity(qty)) return null;
  if (!isValidServings(fromServings) || !isValidServings(toServings)) return null;
  const scaled = (qty * toServings) / fromServings;
  if (!Number.isFinite(scaled) || scaled <= 0) return null;
  return scaled;
}

/**
 * Display a quantity: integers plain, otherwise up to 2 decimals with
 * trailing zeros trimmed (300, 1.5, 0.33). Values below 0.01 keep four
 * significant figures instead, so a positive quantity never displays as
 * zero: 0.0001 stays "0.0001", 0.00025 stays "0.00025".
 */
export function formatQuantity(qty) {
  if (!isValidQuantity(qty)) return '';
  if (qty >= 0.01) return String(round2(qty));
  return String(Number(qty.toPrecision(4)));
}

/** Normalise an ingredient name for comparison: trim, collapse spaces, lowercase. */
export function normalizeName(name) {
  return String(name).trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Normalise a unit for comparison. Empty unit stays empty. */
export function normalizeUnit(unit) {
  return String(unit || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Merge key: same name AND same unit merge; different units never merge. */
export function mergeKey(name, unit) {
  return normalizeName(name) + '\u0000' + normalizeUnit(unit);
}

/**
 * Merge a list of {name, unit, quantity} items: identical name+unit pairs
 * are summed at full precision (never rounded before merging).
 * First-seen order and the first item's display casing are kept.
 * Invalid items are dropped.
 */
export function mergeIngredients(items) {
  const order = [];
  const byKey = new Map();
  for (const item of items || []) {
    if (!item || !isValidQuantity(item.quantity)) continue;
    const name = String(item.name || '').trim();
    if (!name) continue;
    const unit = String(item.unit || '').trim();
    const key = mergeKey(name, unit);
    if (byKey.has(key)) {
      const existing = byKey.get(key);
      existing.quantity = existing.quantity + item.quantity;
    } else {
      const merged = { name, unit, quantity: item.quantity };
      byKey.set(key, merged);
      order.push(merged);
    }
  }
  return order;
}

/**
 * Scale every ingredient of a recipe to `targetServings`.
 * Returns [{name, unit, original, scaled}] or null for invalid input.
 * The recipe object is never mutated.
 */
export function scaleRecipe(recipe, targetServings) {
  if (!recipe || !Array.isArray(recipe.ingredients)) return null;
  if (!isValidServings(recipe.servings) || !isValidServings(targetServings)) return null;
  const rows = [];
  for (const ing of recipe.ingredients) {
    if (!isValidQuantity(ing.quantity)) return null;
    const scaled = scaleQuantity(ing.quantity, recipe.servings, targetServings);
    if (scaled === null) return null;
    rows.push({
      name: String(ing.name).trim(),
      unit: String(ing.unit || '').trim(),
      original: ing.quantity,
      scaled,
    });
  }
  return rows;
}

/** Build shopping-list items from a recipe at a target serving count. */
export function buildShoppingItems(recipe, targetServings) {
  const rows = scaleRecipe(recipe, targetServings);
  if (rows === null) return null;
  const merged = mergeIngredients(rows.map((r) => ({ name: r.name, unit: r.unit, quantity: r.scaled })));
  return merged.map((m) => ({ name: m.name, unit: m.unit, quantity: m.quantity, purchased: false }));
}

/** Plain-text shopping list, one checkbox line per item. */
export function formatShoppingListText(items) {
  const lines = (items || []).map((item) => {
    const box = item.purchased ? '[x]' : '[ ]';
    const qty = formatQuantity(item.quantity);
    const unit = item.unit ? ' ' + item.unit : '';
    return `${box} ${qty}${unit} ${item.name}`;
  });
  return lines.join('\n');
}
