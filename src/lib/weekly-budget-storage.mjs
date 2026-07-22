export const WEEKLY_BUDGET_STORAGE_KEY = 'abcds-weekly-budget-v1';
export const WEEKLY_BUDGET_MAX_AMOUNT = 1_000_000_000;

export const WEEKLY_BUDGET_DEFAULTS = Object.freeze({
  weeklyIncome: 1000,
  weeklyEssentials: 500,
  weeklyFlexible: 150,
  weeklySinkingFunds: 100,
  weeklyBreathingRoom: 50,
  weeklyMarginRepair: 0,
});

export const WEEKLY_BUDGET_FIELD_IDS = [
  'weeklyIncome',
  'weeklyEssentials',
  'weeklyFlexible',
  'weeklySinkingFunds',
  'weeklyBreathingRoom',
  'weeklyMarginRepair',
];

export function getWeeklyBudgetStorage(windowObject) {
  try {
    return windowObject.localStorage;
  } catch {
    return null;
  }
}

export function normalizeWeeklyBudgetSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;

  const normalized = {};
  for (const fieldId of WEEKLY_BUDGET_FIELD_IDS) {
    const value = fieldId === 'weeklyMarginRepair' && snapshot[fieldId] === undefined
      ? WEEKLY_BUDGET_DEFAULTS.weeklyMarginRepair
      : snapshot[fieldId];
    if (!Number.isFinite(value) || value < 0 || value > WEEKLY_BUDGET_MAX_AMOUNT) return null;
    normalized[fieldId] = value;
  }

  return normalized;
}

export function parseWeeklyBudgetSnapshot(serializedSnapshot) {
  try {
    return normalizeWeeklyBudgetSnapshot(JSON.parse(serializedSnapshot));
  } catch {
    return null;
  }
}

export function serializeWeeklyBudgetExport(snapshot) {
  const normalized = normalizeWeeklyBudgetSnapshot(snapshot);
  if (!normalized) return null;

  return JSON.stringify({
    format: 'abcds-weekly-budget',
    version: 2,
    budget: normalized,
  }, null, 2);
}

export function parseWeeklyBudgetImport(serializedExport) {
  try {
    const parsed = JSON.parse(serializedExport);
    if (
      !parsed
      || typeof parsed !== 'object'
      || Array.isArray(parsed)
      || parsed.format !== 'abcds-weekly-budget'
      || ![1, 2].includes(parsed.version)
      || (parsed.version === 2 && parsed.budget?.weeklyMarginRepair === undefined)
    ) return null;

    return normalizeWeeklyBudgetSnapshot(parsed.budget);
  } catch {
    return null;
  }
}

export function saveWeeklyBudget(storage, snapshot) {
  const normalized = normalizeWeeklyBudgetSnapshot(snapshot);
  if (!normalized) return false;

  try {
    storage.setItem(WEEKLY_BUDGET_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function loadWeeklyBudget(storage) {
  try {
    return parseWeeklyBudgetSnapshot(storage.getItem(WEEKLY_BUDGET_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearWeeklyBudget(storage) {
  try {
    storage.removeItem(WEEKLY_BUDGET_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
