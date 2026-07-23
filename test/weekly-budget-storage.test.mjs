import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  clearWeeklyBudget,
  createWeeklyBudgetImportCoordinator,
  getWeeklyBudgetStorage,
  loadWeeklyBudget,
  normalizeWeeklyBudgetSnapshot,
  parseWeeklyBudgetImport,
  parseWeeklyBudgetSnapshot,
  readWeeklyBudgetImportFile,
  saveWeeklyBudget,
  serializeWeeklyBudgetExport,
  WEEKLY_BUDGET_MAX_IMPORT_BYTES,
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

test('rejects oversized weekly budget imports before reading file contents', async () => {
  let readCount = 0;
  const oversizedFile = {
    size: WEEKLY_BUDGET_MAX_IMPORT_BYTES + 1,
    async text() {
      readCount += 1;
      return serializeWeeklyBudgetExport(validSnapshot);
    },
  };

  assert.deepEqual(await readWeeklyBudgetImportFile(oversizedFile), { status: 'too-large' });
  assert.equal(readCount, 0);
});

test('keeps only the latest weekly budget import request current', () => {
  const imports = createWeeklyBudgetImportCoordinator();
  const session = imports.activate();
  const firstRequest = imports.begin(session);
  const secondRequest = imports.begin(session);

  assert.equal(firstRequest.isCurrent(), false);
  assert.equal(secondRequest.isCurrent(), true);

  imports.invalidate();
  assert.equal(secondRequest.isCurrent(), false);
});

test('keeps import requests stale after teardown until the coordinator is reactivated', () => {
  const imports = createWeeklyBudgetImportCoordinator();
  const retiredSession = imports.activate();

  imports.deactivate();
  const postTeardownRequest = imports.begin(retiredSession);
  assert.equal(postTeardownRequest.isCurrent(), false);

  const activeSession = imports.activate();
  const stalePageRequest = imports.begin(retiredSession);
  assert.equal(stalePageRequest.isCurrent(), false);

  const activePageRequest = imports.begin(activeSession);
  assert.equal(activePageRequest.isCurrent(), true);
});

test('clears the previous weekly budget file before opening a replacement picker', () => {
  const imports = createWeeklyBudgetImportCoordinator();
  const session = imports.activate();
  const request = imports.begin(session);
  const clicks = [];
  const fileInput = {
    value: 'abcds-weekly-budget.json',
    click() {
      clicks.push(this.value);
    },
  };

  imports.openFilePicker(fileInput);

  assert.equal(request.isCurrent(), false);
  assert.equal(fileInput.value, '');
  assert.deepEqual(clicks, ['']);
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

test('rejects malformed, unsupported, extended, and invalid weekly budget imports', () => {
  assert.equal(parseWeeklyBudgetImport('{broken'), null);
  assert.equal(parseWeeklyBudgetImport(JSON.stringify({
    format: 'abcds-weekly-budget',
    version: 3,
    budget: validSnapshot,
  })), null);
  assert.equal(parseWeeklyBudgetImport(JSON.stringify({
    format: 'abcds-weekly-budget',
    version: 2,
    budget: validSnapshot,
    accountId: 'unexpected',
  })), null);
  assert.equal(parseWeeklyBudgetImport(JSON.stringify({
    format: 'abcds-weekly-budget',
    version: 2,
    budget: { ...validSnapshot, accountId: 'unexpected' },
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
  assert.match(budgetPage, /readWeeklyBudgetImportFile\(file\)/);
  assert.match(budgetPage, /createWeeklyBudgetImportCoordinator\(\)/);
  assert.match(budgetPage, /weeklyBudgetImports\.openFilePicker\(fileInput\)/);
  assert.match(budgetPage, /importWeeklyBudget\(event, importSession\)/);
  assert.match(
    budgetPage,
    /const isUserInput = event\?\.type === 'input';\s*if \(isUserInput\) weeklyBudgetImports\.invalidate\(\);/,
  );
  assert.match(budgetPage, /if \(isUserInput\) saveWeeklyBudget\(storage, weeklySnapshot\(\)\)/);
  assert.match(
    budgetPage,
    /function initializeWeeklyBudget\(\) \{[\s\S]*?if \([\s\S]*?!form[\s\S]*?\) return;\s*const importSession = weeklyBudgetImports\.activate\(\);/,
  );
  assert.match(
    budgetPage,
    /document\.addEventListener\('astro:before-swap', cancelWeeklyBudgetImport\)/,
  );
  assert.match(
    budgetPage,
    /function cancelWeeklyBudgetImport\(\) \{\s*weeklyBudgetImports\.deactivate\(\);\s*\}/,
  );
  assert.match(
    budgetPage,
    /resetButton\.addEventListener\('click', \(\) => \{\s*weeklyBudgetImports\.invalidate\(\);/,
  );
  assert.match(budgetPage, /if \(!request\.isCurrent\(\)\) return/);
  assert.match(budgetPage, /if \(request\.isCurrent\(\)\) input\.value = ''/);
  assert.match(budgetPage, /because the file is too large/);
  assert.match(budgetPage, /URL\.revokeObjectURL\(downloadUrl\)/);
  assert.match(budgetPage, /Imported weekly budget from JSON\./);
  assert.match(budgetPage, /Could not import that weekly budget JSON\./);
  assert.match(
    budgetPage,
    /Import and export processing stays local; exported files can be moved manually between browsers or devices/i,
  );
});
