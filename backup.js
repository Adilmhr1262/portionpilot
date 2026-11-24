// PortionPilot — JSON backup export and validated import.
// Import validates the WHOLE file first; nothing is replaced unless valid.
import { validateRecipeList, validateShoppingList } from './storage.js';

export const BACKUP_APP = 'portionpilot';
export const BACKUP_VERSION = 1;

/** Build the backup object from current data. */
export function buildBackup(recipes, shopping) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    recipes: recipes || [],
    shopping: shopping || [],
  };
}

/** Serialise a backup object to a JSON string. */
export function serializeBackup(backup) {
  return JSON.stringify(backup, null, 2);
}

/**
 * Validate parsed backup data. Returns {ok, errors, recipes, shopping}.
 * `recipes`/`shopping` are present only when ok is true.
 */
export function validateBackup(data) {
  const errors = [];
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['backup must be a JSON object'] };
  }
  if (data.app !== BACKUP_APP) errors.push('backup is not a PortionPilot backup');
  if (data.version !== BACKUP_VERSION) errors.push(`unsupported backup version (expected ${BACKUP_VERSION})`);
  if (!Array.isArray(data.recipes)) {
    errors.push('backup recipes must be an array');
  } else {
    errors.push(...validateRecipeList(data.recipes));
  }
  const shopping = Array.isArray(data.shopping) ? data.shopping : [];
  if (!Array.isArray(data.shopping) && data.shopping !== undefined) {
    errors.push('backup shopping list must be an array');
  } else {
    errors.push(...validateShoppingList(shopping));
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], recipes: data.recipes, shopping };
}

/** Parse backup JSON text. Returns {ok, data} or {ok:false, error}. */
export function parseBackupJson(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'file is empty' };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'file is not valid JSON' };
  }
}

/** Suggest a filename for the exported backup. */
export function backupFileName(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `portionpilot-backup-${stamp}.json`;
}
