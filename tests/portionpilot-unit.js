// Unit tests for PortionPilot: scaling math, formatting, merging,
// storage validation and backup validation. Run: node --test tests/portionpilot-unit.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleQuantity, formatQuantity, round2, isValidQuantity, isValidServings,
  mergeIngredients, scaleRecipe, buildShoppingItems, formatShoppingListText,
  normalizeName, normalizeUnit, mergeKey,
} from '../calculator.js';
import { validateRecipe, validateIngredient, validateShoppingItem } from '../storage.js';
import { buildBackup, validateBackup, parseBackupJson } from '../backup.js';

const chickenRice = {
  id: 'r1',
  name: 'Chicken Rice',
  category: 'Dinner',
  servings: 4,
  notes: '',
  favorite: false,
  createdAt: 1,
  updatedAt: 1,
  ingredients: [
    { id: 'i1', name: 'Rice', unit: 'g', quantity: 200 },
    { id: 'i2', name: 'Chicken', unit: 'g', quantity: 400 },
    { id: 'i3', name: 'Water', unit: 'ml', quantity: 500 },
    { id: 'i4', name: 'Salt', unit: 'tsp', quantity: 1 },
  ],
};

test('scaling matches the order example: 4 -> 6 servings', () => {
  assert.equal(scaleQuantity(200, 4, 6), 300);
  assert.equal(scaleQuantity(400, 4, 6), 600);
  assert.equal(scaleQuantity(500, 4, 6), 750);
  assert.equal(scaleQuantity(1, 4, 6), 1.5);
});

test('scaling down and fractional results (display rounds, internals stay exact)', () => {
  assert.equal(scaleQuantity(100, 4, 1), 25);
  assert.equal(formatQuantity(scaleQuantity(1, 3, 1)), '0.33');
  assert.equal(formatQuantity(scaleQuantity(2, 3, 2)), '1.33');
  assert.equal(scaleQuantity(7, 4, 7), 12.25);
});

test('no binary float artefacts in display', () => {
  assert.equal(formatQuantity(scaleQuantity(0.1, 1, 3)), '0.3');
  assert.equal(formatQuantity(0.30000000000000004), '0.3');
  assert.equal(round2(2.675), 2.68);
});

// ---- Required regression tests from ChatGPT review round 1 ----

test('regression: scale 0.01 g from 100 to 1 serving -> 0.0001 g', () => {
  const scaled = scaleQuantity(0.01, 100, 1);
  assert.ok(Math.abs(scaled - 0.0001) < 1e-12);
  assert.equal(formatQuantity(scaled), '0.0001');
});

test('regression: scale 0.025 g from 100 to 1 serving -> 0.00025 g', () => {
  const scaled = scaleQuantity(0.025, 100, 1);
  assert.ok(Math.abs(scaled - 0.00025) < 1e-12);
  assert.equal(formatQuantity(scaled), '0.00025');
});

test('regression: merge 0.0001 g and 0.0002 g -> 0.0003 g', () => {
  const merged = mergeIngredients([
    { name: 'Saffron', unit: 'g', quantity: 0.0001 },
    { name: 'Saffron', unit: 'g', quantity: 0.0002 },
  ]);
  assert.equal(merged.length, 1);
  assert.ok(Math.abs(merged[0].quantity - 0.0003) < 1e-12);
  assert.equal(formatQuantity(merged[0].quantity), '0.0003');
});

test('regression: shopping list with tiny quantities keeps positives', () => {
  const items = buildShoppingItems({
    ...chickenRice,
    servings: 100,
    ingredients: [{ id: 'i1', name: 'Saffron', unit: 'g', quantity: 0.01 }],
  }, 1);
  assert.equal(items.length, 1);
  assert.ok(items[0].quantity > 0);
  assert.equal(formatQuantity(items[0].quantity), '0.0001');
  assert.equal(formatShoppingListText(items), '[ ] 0.0001 g Saffron');
});

test('regression: export and restore preserve tiny quantities', () => {
  const tiny = {
    ...chickenRice,
    servings: 100,
    ingredients: [{ id: 'i1', name: 'Saffron', unit: 'g', quantity: 0.01 }],
  };
  const backup = buildBackup([tiny], [{ id: 's1', name: 'Saffron', unit: 'g', quantity: 0.0001, purchased: false }]);
  const restored = validateBackup(JSON.parse(JSON.stringify(backup)));
  assert.equal(restored.ok, true);
  assert.equal(restored.recipes[0].ingredients[0].quantity, 0.01);
  assert.equal(restored.shopping[0].quantity, 0.0001);
  assert.equal(formatQuantity(scaleQuantity(restored.recipes[0].ingredients[0].quantity, 100, 1)), '0.0001');
});

test('invalid quantities and servings are rejected', () => {
  assert.equal(scaleQuantity(0, 4, 6), null);
  assert.equal(scaleQuantity(-5, 4, 6), null);
  assert.equal(scaleQuantity(NaN, 4, 6), null);
  assert.equal(scaleQuantity(Infinity, 4, 6), null);
  assert.equal(scaleQuantity('200', 4, 6), null);
  assert.equal(scaleQuantity(200, 0, 6), null);
  assert.equal(scaleQuantity(200, 4, 0), null);
  assert.equal(scaleQuantity(200, 2.5, 6), null);
  assert.equal(isValidQuantity(0), false);
  assert.equal(isValidQuantity(-1), false);
  assert.equal(isValidQuantity(100000), true);
  assert.equal(isValidQuantity(100001), false);
  assert.equal(isValidServings(1), true);
  assert.equal(isValidServings(100), true);
  assert.equal(isValidServings(101), false);
  assert.equal(isValidServings(1.5), false);
});

test('formatQuantity trims trailing zeros and never shows a positive as zero', () => {
  assert.equal(formatQuantity(300), '300');
  assert.equal(formatQuantity(1.5), '1.5');
  assert.equal(formatQuantity(1.25), '1.25');
  assert.equal(formatQuantity(0.005), '0.005');
  assert.equal(formatQuantity(0.001), '0.001');
  assert.equal(formatQuantity(0.0001), '0.0001');
  assert.equal(formatQuantity(0.00025), '0.00025');
  assert.equal(formatQuantity(0.00030000000000000003), '0.0003');
  assert.equal(formatQuantity(0), '');
  assert.equal(formatQuantity(-2), '');
});

test('scaleRecipe returns original and scaled rows without mutating the recipe', () => {
  const rows = scaleRecipe(chickenRice, 6);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { name: 'Rice', unit: 'g', original: 200, scaled: 300 });
  assert.deepEqual(rows[3], { name: 'Salt', unit: 'tsp', original: 1, scaled: 1.5 });
  assert.equal(chickenRice.ingredients[0].quantity, 200);
  assert.equal(chickenRice.servings, 4);
  assert.equal(scaleRecipe(chickenRice, 0), null);
  assert.equal(scaleRecipe(chickenRice, 101), null);
  assert.equal(scaleRecipe(null, 6), null);
});

test('merging combines identical name+unit only', () => {
  const merged = mergeIngredients([
    { name: 'Rice', unit: 'g', quantity: 200 },
    { name: ' rice ', unit: 'G', quantity: 100 },
    { name: 'Rice', unit: 'kg', quantity: 1 },
    { name: 'Salt', unit: 'tsp', quantity: 1 },
    { name: 'Salt', unit: 'tsp', quantity: 0.5 },
    { name: 'Water', unit: '', quantity: 500 },
    { name: 'Water', unit: '', quantity: 250 },
  ]);
  assert.equal(merged.length, 4);
  assert.deepEqual(merged[0], { name: 'Rice', unit: 'g', quantity: 300 });
  assert.deepEqual(merged[1], { name: 'Rice', unit: 'kg', quantity: 1 });
  assert.deepEqual(merged[2], { name: 'Salt', unit: 'tsp', quantity: 1.5 });
  assert.deepEqual(merged[3], { name: 'Water', unit: '', quantity: 750 });
});

test('merge keys are case and whitespace insensitive', () => {
  assert.equal(mergeKey('  Rice ', 'G'), mergeKey('rice', 'g'));
  assert.notEqual(mergeKey('Rice', 'g'), mergeKey('Rice', 'kg'));
  assert.equal(normalizeName('  Brown   Rice '), 'brown rice');
  assert.equal(normalizeUnit('  TSP '), 'tsp');
});

test('buildShoppingItems scales then merges within the recipe', () => {
  const dup = {
    ...chickenRice,
    ingredients: [
      ...chickenRice.ingredients,
      { id: 'i5', name: 'salt', unit: 'tsp', quantity: 0.5 },
    ],
  };
  const items = buildShoppingItems(dup, 6);
  assert.equal(items.length, 4);
  const salt = items.find((i) => normalizeName(i.name) === 'salt');
  assert.equal(salt.quantity, 2.25);
  assert.equal(salt.purchased, false);
  assert.equal(buildShoppingItems(chickenRice, 0), null);
});

test('shopping list plain text format', () => {
  const text = formatShoppingListText([
    { name: 'Rice', unit: 'g', quantity: 300, purchased: false },
    { name: 'Eggs', unit: '', quantity: 2, purchased: true },
  ]);
  assert.equal(text, '[ ] 300 g Rice\n[x] 2 Eggs');
  assert.equal(formatShoppingListText([]), '');
});

test('validateRecipe accepts a good recipe and rejects bad ones', () => {
  assert.deepEqual(validateRecipe(chickenRice), []);
  assert.ok(validateRecipe({ ...chickenRice, name: '  ' }).length > 0);
  assert.ok(validateRecipe({ ...chickenRice, category: 'Brunch' }).length > 0);
  assert.ok(validateRecipe({ ...chickenRice, servings: 0 }).length > 0);
  assert.ok(validateRecipe({ ...chickenRice, servings: 2.5 }).length > 0);
  assert.ok(validateRecipe({ ...chickenRice, ingredients: [] }).length > 0);
  assert.ok(validateRecipe({ ...chickenRice, ingredients: [{ id: 'i1', name: 'Rice', unit: 'g', quantity: -1 }] }).length > 0);
  assert.ok(validateRecipe({ ...chickenRice, ingredients: [{ id: 'i1', name: 'Rice', unit: 'g', quantity: NaN }] }).length > 0);
  assert.ok(validateRecipe(null).length > 0);
});

test('validateIngredient and validateShoppingItem reject bad input', () => {
  assert.deepEqual(validateIngredient({ id: 'i1', name: 'Rice', unit: 'g', quantity: 200 }), []);
  assert.ok(validateIngredient({ id: 'i1', name: '', unit: 'g', quantity: 200 }).length > 0);
  assert.ok(validateIngredient({ id: 'i1', name: 'Rice', unit: 'g', quantity: 0 }).length > 0);
  assert.deepEqual(validateShoppingItem({ id: 's1', name: 'Rice', unit: 'g', quantity: 300, purchased: false }), []);
  assert.ok(validateShoppingItem({ id: 's1', name: 'Rice', unit: 'g', quantity: 300, purchased: 'no' }).length > 0);
});

test('backup round-trips and validates', () => {
  const backup = buildBackup([chickenRice], [{ id: 's1', name: 'Rice', unit: 'g', quantity: 300, purchased: false }]);
  assert.equal(backup.app, 'portionpilot');
  assert.equal(backup.version, 1);
  const result = validateBackup(JSON.parse(JSON.stringify(backup)));
  assert.equal(result.ok, true);
  assert.equal(result.recipes.length, 1);
  assert.equal(result.shopping.length, 1);
});

test('backup validation rejects wrong app, version, and bad recipes', () => {
  assert.equal(validateBackup({ app: 'other', version: 1, recipes: [], shopping: [] }).ok, false);
  assert.equal(validateBackup({ app: 'portionpilot', version: 2, recipes: [], shopping: [] }).ok, false);
  assert.equal(validateBackup({ app: 'portionpilot', version: 1, recipes: [{ ...chickenRice, servings: 0 }], shopping: [] }).ok, false);
  assert.equal(validateBackup({ app: 'portionpilot', version: 1, recipes: [chickenRice, chickenRice], shopping: [] }).ok, false);
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup('nope').ok, false);
});

test('parseBackupJson handles empty and malformed text', () => {
  assert.equal(parseBackupJson('').ok, false);
  assert.equal(parseBackupJson('{bad json').ok, false);
  assert.equal(parseBackupJson('{"app":"portionpilot"}').ok, true);
});
