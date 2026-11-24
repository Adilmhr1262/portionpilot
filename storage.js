// PortionPilot — localStorage persistence and data validation.
// All user data lives under these keys; nothing leaves the device.
import { CATEGORIES, isValidQuantity, isValidServings } from './calculator.js';

export const KEYS = {
  recipes: 'portionpilot.recipes.v1',
  shopping: 'portionpilot.shopping.v1',
  settings: 'portionpilot.settings.v1',
};

export const MAX_NAME_LEN = 120;
export const MAX_NOTES_LEN = 2000;
export const MAX_UNIT_LEN = 30;
export const MAX_INGREDIENTS = 100;

let memoryFallback = null;

function storageAvailable() {
  try {
    const probe = '__portionpilot_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const useMemory = !storageAvailable();
if (useMemory) memoryFallback = {};

function rawGet(key) {
  if (useMemory) return key in memoryFallback ? memoryFallback[key] : null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function rawSet(key, value) {
  if (useMemory) {
    memoryFallback[key] = value;
    return true;
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function rawRemove(key) {
  if (useMemory) {
    delete memoryFallback[key];
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore: storage already unavailable
  }
}

export function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isValidText(v, maxLen, { allowEmpty = false } = {}) {
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (!allowEmpty && t.length === 0) return false;
  return t.length <= maxLen;
}

/** Validate one ingredient. Returns an array of error strings (empty = valid). */
export function validateIngredient(ing) {
  const errors = [];
  if (!isPlainObject(ing)) return ['ingredient must be an object'];
  if (!isValidText(ing.name, MAX_NAME_LEN)) errors.push('ingredient name is required (max 120 characters)');
  if (typeof ing.unit !== 'string' || ing.unit.trim().length > MAX_UNIT_LEN) {
    errors.push('ingredient unit must be at most 30 characters');
  }
  if (!isValidQuantity(ing.quantity)) errors.push(`quantity for "${String(ing.name || '').trim() || 'ingredient'}" must be a number greater than 0`);
  if (typeof ing.id !== 'string' || ing.id.trim() === '') errors.push('ingredient id is required');
  return errors;
}

/** Validate one recipe. Returns an array of error strings (empty = valid). */
export function validateRecipe(recipe) {
  const errors = [];
  if (!isPlainObject(recipe)) return ['recipe must be an object'];
  if (typeof recipe.id !== 'string' || recipe.id.trim() === '') errors.push('recipe id is required');
  if (!isValidText(recipe.name, MAX_NAME_LEN)) errors.push('recipe name is required (max 120 characters)');
  if (!CATEGORIES.includes(recipe.category)) errors.push('recipe category is invalid');
  if (!isValidServings(recipe.servings)) errors.push('recipe servings must be a whole number from 1 to 100');
  if (typeof recipe.notes !== 'string' || recipe.notes.length > MAX_NOTES_LEN) {
    errors.push('recipe notes must be at most 2000 characters');
  }
  if (typeof recipe.favorite !== 'boolean') errors.push('recipe favorite flag must be true or false');
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    errors.push('recipe needs at least one ingredient');
  } else if (recipe.ingredients.length > MAX_INGREDIENTS) {
    errors.push('recipe has too many ingredients (max 100)');
  } else {
    const seenIds = new Set();
    for (const ing of recipe.ingredients) {
      if (isPlainObject(ing) && typeof ing.id === 'string') {
        if (seenIds.has(ing.id)) errors.push('recipe has duplicate ingredient ids');
        seenIds.add(ing.id);
      }
      errors.push(...validateIngredient(ing));
    }
  }
  if (typeof recipe.createdAt !== 'number' || typeof recipe.updatedAt !== 'number') {
    errors.push('recipe timestamps are required');
  }
  return errors;
}

/** Validate one shopping-list item. Returns an array of error strings. */
export function validateShoppingItem(item) {
  const errors = [];
  if (!isPlainObject(item)) return ['shopping item must be an object'];
  if (typeof item.id !== 'string' || item.id.trim() === '') errors.push('shopping item id is required');
  if (!isValidText(item.name, MAX_NAME_LEN)) errors.push('shopping item name is required (max 120 characters)');
  if (typeof item.unit !== 'string' || item.unit.trim().length > MAX_UNIT_LEN) {
    errors.push('shopping item unit must be at most 30 characters');
  }
  if (!isValidQuantity(item.quantity)) errors.push('shopping item quantity must be a number greater than 0');
  if (typeof item.purchased !== 'boolean') errors.push('shopping item purchased flag must be true or false');
  return errors;
}

/** Validate a whole recipe list (array, unique ids). Returns error strings. */
export function validateRecipeList(list) {
  const errors = [];
  if (!Array.isArray(list)) return ['recipes must be an array'];
  const seen = new Set();
  for (const recipe of list) {
    if (isPlainObject(recipe) && typeof recipe.id === 'string') {
      if (seen.has(recipe.id)) errors.push(`duplicate recipe id "${recipe.id}"`);
      seen.add(recipe.id);
    }
    errors.push(...validateRecipe(recipe));
  }
  return errors;
}

/** Validate a whole shopping list (array, unique ids). Returns error strings. */
export function validateShoppingList(list) {
  const errors = [];
  if (!Array.isArray(list)) return ['shopping list must be an array'];
  const seen = new Set();
  for (const item of list) {
    if (isPlainObject(item) && typeof item.id === 'string') {
      if (seen.has(item.id)) errors.push(`duplicate shopping item id "${item.id}"`);
      seen.add(item.id);
    }
    errors.push(...validateShoppingItem(item));
  }
  return errors;
}

/**
 * Read and parse a key. Returns {data, corrupted} where corrupted is the raw
 * string when parsing or validation failed (null otherwise). Invalid stored
 * data never throws: the app starts empty and reports it in Settings.
 */
function loadValidated(key, validator, fallback) {
  const raw = rawGet(key);
  if (raw === null || raw === '') return { data: fallback, corrupted: null };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { data: fallback, corrupted: raw };
  }
  const errors = validator(parsed);
  if (errors.length > 0) return { data: fallback, corrupted: raw };
  return { data: parsed, corrupted: null };
}

export function loadRecipes() {
  return loadValidated(KEYS.recipes, validateRecipeList, []);
}

export function loadShopping() {
  return loadValidated(KEYS.shopping, validateShoppingList, []);
}

export function loadSettings() {
  const raw = rawGet(KEYS.settings);
  if (raw === null || raw === '') return { theme: 'system' };
  try {
    const parsed = JSON.parse(raw);
    if (isPlainObject(parsed) && ['light', 'dark', 'system'].includes(parsed.theme)) {
      return { theme: parsed.theme };
    }
  } catch {
    // fall through to default
  }
  return { theme: 'system' };
}

export function saveRecipes(list) {
  return rawSet(KEYS.recipes, JSON.stringify(list));
}

export function saveShopping(list) {
  return rawSet(KEYS.shopping, JSON.stringify(list));
}

export function saveSettings(settings) {
  return rawSet(KEYS.settings, JSON.stringify(settings));
}

export function clearAllData() {
  rawRemove(KEYS.recipes);
  rawRemove(KEYS.shopping);
  rawRemove(KEYS.settings);
}

/** Load everything at once, for app start and backup building. */
export function loadAll() {
  const recipes = loadRecipes();
  const shopping = loadShopping();
  const settings = loadSettings();
  const corrupted = [];
  if (recipes.corrupted !== null) corrupted.push({ key: KEYS.recipes, raw: recipes.corrupted });
  if (shopping.corrupted !== null) corrupted.push({ key: KEYS.shopping, raw: shopping.corrupted });
  return {
    recipes: recipes.data,
    shopping: shopping.data,
    settings,
    corrupted,
    storageInMemory: useMemory,
  };
}
