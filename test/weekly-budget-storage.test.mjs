import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  clearWeeklyBudget,
  getWeeklyBudgetStorage,
  loadWeeklyBudget,
  normalizeWeeklyBudgetSnapshot,
  parseWeeklyBudgetImport,
  parseWeeklyBudgetSnapshot,
  saveWeeklyBudget,
  serializeWeeklyBudgetExport,
  WEEKLY_BUDGET_MAX_AMOUNT,
  WEEKLY_BUDGET_STORAGE_KEY,
} from '../src/lib/weekly-budget-storage.mjs';

const validSnapshot = {
  weeklyIncome: 1000,
  weeklyEssentials: 500,
  weeklyFlexible: 150,
  weeklySinkingFunds: 100,
  weeklyBreathingRoom: 50,
  weeklyMarginRepair: 100,
};

test('accepts a complete weekly budget with a non-negative margin repair reserve', () => {
  assert.deepEqual(normalizeWeeklyBudgetSnapshot(validSnapshot), validSnapshot);
});

test('migrates a legacy weekly budget with no margin repair reserve to zero', () => {
  const { weeklyMarginRepair, ...legacySnapshot } = validSnapshot;

  assert.deepEqual(normalizeWeeklyBudgetSnapshot(legacySnapshot), {
    ...legacySnapshot,
    weeklyMarginRepair: 0,
  });
});

test('rejects weekly amounts above the planner calculation bound', () => {
  assert.equal(
    normalizeWeeklyBudgetSnapshot({
      ...validSnapshot,
      weeklyIncome: WEEKLY_BUDGET_MAX_AMOUNT + 0.01,
    }),
    null,
  );
});

test('ignores malformed or invalid stored weekly budgets', () => {
  assert.equal(parseWeeklyBudgetSnapshot('{broken'), null);
  assert.equal(parseWeeklyBudgetSnapshot(JSON.stringify({ ...validSnapshot, weeklyIncome: -1 })), null);
  assert.equal(parseWeeklyBudgetSnapshot(JSON.stringify({ weeklyIncome: 1000 })), null);
});

test('degrades gracefully when browser storage access is denied', () => {
  const windowObject = {
    get localStorage() {
      throw new DOMException('blocked', 'SecurityError');
    },
  };

  assert.equal(getWeeklyBudgetStorage(windowObject), null);
});

test('saves, restores, and clears a valid weekly budget through browser storage', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  assert.equal(saveWeeklyBudget(storage, validSnapshot), true);
  assert.deepEqual(loadWeeklyBudget(storage), validSnapshot);
  assert.equal(values.has(WEEKLY_BUDGET_STORAGE_KEY), true);
  assert.equal(clearWeeklyBudget(storage), true);
  assert.equal(loadWeeklyBudget(storage), null);
});

test('round-trips a weekly budget through the versioned JSON export format', () => {
  const exported = serializeWeeklyBudgetExport(validSnapshot);

  assert.deepEqual(JSON.parse(exported), {
    format: 'abcds-weekly-budget',
    version: 2,
    budget: validSnapshot,
  });
  assert.deepEqual(parseWeeklyBudgetImport(exported), validSnapshot);
});

test('migrates version 1 imports but rejects incomplete version 2 budgets', () => {
  const { weeklyMarginRepair, ...legacyBudget } = validSnapshot;
  const exportEnvelope = {
    format: 'abcds-weekly-budget',
    version: 1,
    budget: legacyBudget,
  };

  assert.deepEqual(parseWeeklyBudgetImport(JSON.stringify(exportEnvelope)), {
    ...legacyBudget,
    weeklyMarginRepair: 0,
  });
  assert.equal(parseWeeklyBudgetImport(JSON.stringify({
    ...exportEnvelope,
    version: 2,
  })), null);
});

test('rejects malformed, unsupported, and invalid weekly budget imports', () => {
  assert.equal(parseWeeklyBudgetImport('{broken'), null);
  assert.equal(parseWeeklyBudgetImport(JSON.stringify({
    format: 'abcds-weekly-budget',
    version: 3,
    budget: validSnapshot,
  })), null);
  assert.equal(parseWeeklyBudgetImport(JSON.stringify({
    format: 'abcds-weekly-budget',
    version: 1,
    budget: { ...validSnapshot, weeklyIncome: -1 },
  })), null);
  assert.equal(serializeWeeklyBudgetExport({ ...validSnapshot, weeklyIncome: Infinity }), null);
});

test('budget planner restores valid browser-local values and provides an explicit reset', async () => {
  const budgetPage = await readFile(
    new URL('../src/pages/budget.astro', import.meta.url),
    'utf8',
  );

  assert.match(budgetPage, /id="resetWeeklyBudget"[^>]*type="button"/);
  assert.equal(
    (budgetPage.match(/max=\{WEEKLY_BUDGET_MAX_AMOUNT\}/g) ?? []).length,
    6,
  );
  assert.match(budgetPage, /Enter an amount within the allowed range in every field/);
  assert.match(budgetPage, /const storage = getWeeklyBudgetStorage\(window\)/);
  assert.match(budgetPage, /loadWeeklyBudget\(storage\)/);
  assert.match(budgetPage, /saveWeeklyBudget\(storage/);
  assert.match(budgetPage, /clearWeeklyBudget\(storage\)/);
  assert.match(budgetPage, /form\.dataset\.initialized === 'true'/);
  assert.match(budgetPage, /stored only in this browser/i);
  assert.match(budgetPage, /not submitted by this planner/i);
  assert.doesNotMatch(budgetPage, /analytics[^.]*weekly(?:Income|Essentials|Flexible|SinkingFunds|BreathingRoom|MarginRepair)/i);
});

test('budget planner provides local JSON import and export controls', async () => {
  const budgetPage = await readFile(
    new URL('../src/pages/budget.astro', import.meta.url),
    'utf8',
  );

  assert.match(budgetPage, /id="exportWeeklyBudget"[^>]*type="button"/);
  assert.match(budgetPage, /id="importWeeklyBudget"[^>]*type="button"/);
  assert.match(
    budgetPage,
    /id="weeklyBudgetFile"[^>]*type="file"[^>]*accept="application\/json,\.json"/,
  );
  assert.match(budgetPage, /serializeWeeklyBudgetExport\(weeklySnapshot\(\)\)/);
  assert.match(budgetPage, /parseWeeklyBudgetImport\(await file\.text\(\)\)/);
  assert.match(budgetPage, /URL\.revokeObjectURL\(downloadUrl\)/);
  assert.match(budgetPage, /Imported weekly budget from JSON\./);
  assert.match(budgetPage, /Could not import that weekly budget JSON\./);
  assert.match(budgetPage, /Import and export stay on this device/i);
});
