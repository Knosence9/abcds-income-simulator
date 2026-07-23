import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ALLOCATION_SNAPSHOT_MAX_IMPORT_BYTES,
  ALLOCATION_SNAPSHOT_STORAGE_KEY,
  clearAllocationSnapshot,
  createAllocationSnapshotImportCoordinator,
  getAllocationSnapshotStorage,
  loadAllocationSnapshot,
  normalizeAllocationSnapshot,
  parseAllocationSnapshotImport,
  readAllocationSnapshotImportFile,
  readAllocationSnapshotInputs,
  restoreAllocationSnapshot,
  saveAllocationSnapshot,
  serializeAllocationSnapshotExport,
} from '../src/lib/allocation-snapshot-storage.mjs';

const validSnapshot = {
  anchor: 3_000,
  booster: 2_000,
  closedEnd: 3_000,
  dynamo: 2_000,
  marginDebt: 3_500,
};

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(ALLOCATION_SNAPSHOT_STORAGE_KEY, initialValue);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('normalizes a complete aggregate allocation snapshot without extra data', () => {
  assert.deepEqual(normalizeAllocationSnapshot(validSnapshot), validSnapshot);
  assert.equal(normalizeAllocationSnapshot({ ...validSnapshot, accountId: 'private' }), null);
});

test('rejects invalid aggregate allocation snapshot values and debt above gross value', () => {
  for (const snapshot of [
    null,
    { ...validSnapshot, anchor: Number.NaN },
    { ...validSnapshot, booster: -1 },
    { ...validSnapshot, closedEnd: Number.POSITIVE_INFINITY },
    { ...validSnapshot, marginDebt: 10_000.01 },
  ]) {
    assert.equal(normalizeAllocationSnapshot(snapshot), null);
  }
});

test('saves and restores a version-2 aggregate record with an injected save time', () => {
  const storage = createStorage();
  const savedAt = '2026-07-23T03:15:00.000Z';

  assert.deepEqual(saveAllocationSnapshot(storage, validSnapshot, () => savedAt), {
    status: 'saved',
    savedAt,
  });
  assert.deepEqual(JSON.parse(storage.values.get(ALLOCATION_SNAPSHOT_STORAGE_KEY)), {
    format: 'abcds-allocation-snapshot',
    version: 2,
    savedAt,
    snapshot: validSnapshot,
  });
  assert.deepEqual(restoreAllocationSnapshot(storage), {
    status: 'loaded',
    savedAt,
    snapshot: validSnapshot,
  });
  assert.deepEqual(loadAllocationSnapshot(storage), validSnapshot);
});

test('round-trips an aggregate snapshot through the versioned JSON transfer format', () => {
  const savedAt = '2026-07-23T03:15:00.000Z';
  const serialized = serializeAllocationSnapshotExport(validSnapshot, savedAt);

  assert.deepEqual(JSON.parse(serialized), {
    format: 'abcds-allocation-snapshot',
    version: 2,
    savedAt,
    snapshot: validSnapshot,
  });
  assert.deepEqual(parseAllocationSnapshotImport(serialized), {
    savedAt,
    snapshot: validSnapshot,
  });
});

test('allocation snapshot transfer rejects legacy, extended, and invalid records', () => {
  const savedAt = '2026-07-23T03:15:00.000Z';
  for (const serialized of [
    '{broken',
    JSON.stringify({ format: 'abcds-allocation-snapshot', version: 1, snapshot: validSnapshot }),
    JSON.stringify({
      format: 'abcds-allocation-snapshot',
      version: 2,
      savedAt,
      snapshot: validSnapshot,
      accountId: 'unexpected',
    }),
    JSON.stringify({
      format: 'abcds-allocation-snapshot',
      version: 2,
      savedAt,
      snapshot: { ...validSnapshot, marginDebt: 10_001 },
    }),
  ]) {
    assert.equal(parseAllocationSnapshotImport(serialized), null);
  }
  assert.equal(serializeAllocationSnapshotExport({ ...validSnapshot, anchor: -1 }, savedAt), null);
  assert.equal(serializeAllocationSnapshotExport(validSnapshot, 'July 23'), null);
});

test('reads transfer inputs without coercing blank aggregate values to zero', () => {
  const balanceInputs = Object.fromEntries(
    Object.entries(validSnapshot)
      .filter(([name]) => name !== 'marginDebt')
      .map(([name, value]) => [name, { value: String(value) }]),
  );
  assert.deepEqual(readAllocationSnapshotInputs(balanceInputs, { value: '3500' }), validSnapshot);

  balanceInputs.anchor.value = '';
  assert.equal(Number.isNaN(readAllocationSnapshotInputs(balanceInputs, { value: '3500' }).anchor), true);
  assert.equal(Number.isNaN(readAllocationSnapshotInputs(balanceInputs, { value: ' ' }).marginDebt), true);
});

test('rejects oversized allocation snapshot imports before reading file contents', async () => {
  let readCount = 0;
  const oversizedFile = {
    size: ALLOCATION_SNAPSHOT_MAX_IMPORT_BYTES + 1,
    async text() {
      readCount += 1;
      return serializeAllocationSnapshotExport(validSnapshot, '2026-07-23T03:15:00.000Z');
    },
  };

  assert.deepEqual(await readAllocationSnapshotImportFile(oversizedFile), { status: 'too-large' });
  assert.equal(readCount, 0);
});

test('keeps only the latest allocation snapshot import request current', () => {
  const imports = createAllocationSnapshotImportCoordinator();
  const firstRequest = imports.begin();
  const secondRequest = imports.begin();

  assert.equal(firstRequest.isCurrent(), false);
  assert.equal(secondRequest.isCurrent(), true);

  imports.invalidate();
  assert.equal(secondRequest.isCurrent(), false);
});

test('clears the previous snapshot file before opening a replacement picker', () => {
  const imports = createAllocationSnapshotImportCoordinator();
  const request = imports.begin();
  const clicks = [];
  const fileInput = {
    value: 'abcds-allocation-snapshot.json',
    click() {
      clicks.push(this.value);
    },
  };

  imports.openFilePicker(fileInput);

  assert.equal(request.isCurrent(), false);
  assert.equal(fileInput.value, '');
  assert.deepEqual(clicks, ['']);
});

test('rejects an invalid injected save time without writing a record', () => {
  const storage = createStorage();

  assert.deepEqual(saveAllocationSnapshot(storage, validSnapshot, () => 'July 23'), {
    status: 'invalid',
  });
  assert.equal(storage.values.has(ALLOCATION_SNAPSHOT_STORAGE_KEY), false);
});

test('rejects malformed, unsupported, incomplete, and extended stored records', () => {
  for (const storedValue of [
    '{broken',
    JSON.stringify({ format: 'abcds-allocation-snapshot', version: 3, snapshot: validSnapshot }),
    JSON.stringify({
      format: 'abcds-allocation-snapshot',
      version: 2,
      savedAt: 'July 23',
      snapshot: validSnapshot,
    }),
    JSON.stringify({
      format: 'abcds-allocation-snapshot',
      version: 2,
      savedAt: '2026-07-23T03:15:00.000Z',
      snapshot: validSnapshot,
      accountId: 'unexpected',
    }),
    JSON.stringify({ format: 'other', version: 1, snapshot: validSnapshot }),
    JSON.stringify({ format: 'abcds-allocation-snapshot', version: 1, snapshot: { anchor: 1 } }),
    JSON.stringify({
      format: 'abcds-allocation-snapshot',
      version: 1,
      snapshot: validSnapshot,
      accountId: 'unexpected',
    }),
  ]) {
    assert.equal(loadAllocationSnapshot(createStorage(storedValue)), null);
  }
});

test('distinguishes missing, invalid, and valid stored snapshots', () => {
  assert.deepEqual(restoreAllocationSnapshot(createStorage()), { status: 'missing', snapshot: null });
  assert.deepEqual(restoreAllocationSnapshot(createStorage('{broken')), {
    status: 'invalid',
    snapshot: null,
  });
  assert.deepEqual(restoreAllocationSnapshot(createStorage(JSON.stringify({
    format: 'abcds-allocation-snapshot',
    version: 1,
    snapshot: validSnapshot,
  }))), { status: 'loaded', snapshot: validSnapshot, savedAt: null });
});

test('clears stored snapshots and tolerates unavailable browser storage', () => {
  const storage = createStorage();
  saveAllocationSnapshot(storage, validSnapshot);

  assert.equal(clearAllocationSnapshot(storage), true);
  assert.equal(loadAllocationSnapshot(storage), null);
  assert.equal(getAllocationSnapshotStorage({
    get localStorage() {
      throw new DOMException('blocked', 'SecurityError');
    },
  }), null);
});

test('simulator exposes explicit local snapshot persistence controls and privacy copy', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /id="saveAllocationSnapshot"[^>]*type="button"/);
  assert.match(simulatorPage, /id="resetAllocationSnapshot"[^>]*type="button"/);
  assert.match(simulatorPage, /id="allocationSnapshotStorageStatus"[^>]*aria-live="polite"/);
  assert.match(simulatorPage, /attachAllocationSnapshotStorage\(\{/);
  assert.match(simulatorPage, /getAllocationSnapshotStorage\(window\)/);
  assert.match(simulatorPage, /restoreAllocationSnapshot/);
  assert.match(simulatorPage, /saveAllocationSnapshot/);
  assert.match(simulatorPage, /clearAllocationSnapshot/);
  assert.match(simulatorPage, /four aggregate pillar balances, aggregate margin debt, and save time/i);
  assert.match(simulatorPage, /no holdings, transactions, or account identifiers/i);
});

test('simulator offers local aggregate snapshot JSON transfer without implicit storage', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /id="exportAllocationSnapshot"[^>]*type="button"/);
  assert.match(simulatorPage, /id="importAllocationSnapshot"[^>]*type="button"/);
  assert.match(simulatorPage, /id="allocationSnapshotFile"[^>]*type="file"[^>]*accept="application\/json,.json"[^>]*hidden/);
  assert.match(simulatorPage, /serializeAllocationSnapshotExport/);
  assert.match(simulatorPage, /readAllocationSnapshotImportFile/);
  assert.match(simulatorPage, /Imported aggregate snapshot from JSON\. Choose Save in browser to persist it\./);
  assert.match(simulatorPage, /Import and export stay on this device/i);
});

test('storage operation failures return safe outcomes', () => {
  const brokenStorage = {
    getItem() { throw new Error('unavailable'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('unavailable'); },
  };

  assert.deepEqual(saveAllocationSnapshot(brokenStorage, validSnapshot), { status: 'unavailable' });
  assert.deepEqual(saveAllocationSnapshot(createStorage(), { ...validSnapshot, anchor: -1 }), {
    status: 'invalid',
  });
  assert.deepEqual(restoreAllocationSnapshot(brokenStorage), {
    status: 'unavailable',
    snapshot: null,
  });
  assert.equal(loadAllocationSnapshot(brokenStorage), null);
  assert.equal(clearAllocationSnapshot(brokenStorage), false);
});
