export const WEEKLY_BUDGET_STORAGE_KEY = 'abcds-weekly-budget-v1';
export const WEEKLY_BUDGET_MAX_AMOUNT = 1_000_000_000;
export const WEEKLY_BUDGET_MAX_IMPORT_BYTES = 64 * 1024;

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

const weeklyBudgetEnvelopeFields = ['format', 'version', 'budget'];
const weeklyBudgetVersion1Fields = WEEKLY_BUDGET_FIELD_IDS.filter(
  (field) => field !== 'weeklyMarginRepair',
);

function hasExactFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

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

export function serializeWeeklyBudgetCsv(snapshot) {
  const normalized = normalizeWeeklyBudgetSnapshot(snapshot);
  if (!normalized) return null;

  const rows = [
    ['Take-home income', normalized.weeklyIncome],
    ['Essentials', normalized.weeklyEssentials],
    ['Flexible spending', normalized.weeklyFlexible],
    ['Sinking funds', normalized.weeklySinkingFunds],
    ['Breathing-room buffer', normalized.weeklyBreathingRoom],
    ['Margin repair', normalized.weeklyMarginRepair],
  ];
  return [
    'Category,Weekly amount',
    ...rows.map(([label, amount]) => `${label},${amount.toFixed(2)}`),
  ].join('\r\n');
}

export function parseWeeklyBudgetImport(serializedExport) {
  try {
    const parsed = JSON.parse(serializedExport);
    if (
      !hasExactFields(parsed, weeklyBudgetEnvelopeFields)
      || parsed.format !== 'abcds-weekly-budget'
      || ![1, 2].includes(parsed.version)
      || !hasExactFields(
        parsed.budget,
        parsed.version === 1 ? weeklyBudgetVersion1Fields : WEEKLY_BUDGET_FIELD_IDS,
      )
    ) return null;

    return normalizeWeeklyBudgetSnapshot(parsed.budget);
  } catch {
    return null;
  }
}

export async function readWeeklyBudgetImportFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size < 0) return { status: 'invalid' };
  if (file.size > WEEKLY_BUDGET_MAX_IMPORT_BYTES) return { status: 'too-large' };
  try {
    const budget = parseWeeklyBudgetImport(await file.text());
    return budget ? { status: 'loaded', budget } : { status: 'invalid' };
  } catch {
    return { status: 'unavailable' };
  }
}

export function createWeeklyBudgetImportCoordinator() {
  let currentRequestId = 0;
  let currentSessionId = 0;
  let active = false;
  return {
    begin(sessionId) {
      const requestId = ++currentRequestId;
      return {
        isCurrent: () => (
          active
          && sessionId === currentSessionId
          && requestId === currentRequestId
        ),
      };
    },
    activate() {
      currentRequestId += 1;
      currentSessionId += 1;
      active = true;
      return currentSessionId;
    },
    deactivate() {
      currentRequestId += 1;
      active = false;
    },
    invalidate() {
      currentRequestId += 1;
    },
    openFilePicker(fileInput) {
      currentRequestId += 1;
      fileInput.value = '';
      fileInput.click();
    },
  };
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
