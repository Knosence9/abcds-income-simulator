import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ALLOCATION_SNAPSHOT_STORAGE_KEY,
  clearAllocationSnapshot,
  getAllocationSnapshotStorage,
  loadAllocationSnapshot,
  normalizeAllocationSnapshot,
  restoreAllocationSnapshot,
  saveAllocationSnapshot,
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

test('saves and restores a versioned aggregate-only record', () => {
  const storage = createStorage();

  assert.deepEqual(saveAllocationSnapshot(storage, validSnapshot), { status: 'saved' });
  assert.deepEqual(JSON.parse(storage.values.get(ALLOCATION_SNAPSHOT_STORAGE_KEY)), {
    format: 'abcds-allocation-snapshot',
    version: 1,
    snapshot: validSnapshot,
  });
  assert.deepEqual(loadAllocationSnapshot(storage), validSnapshot);
});

test('rejects malformed, unsupported, incomplete, and extended stored records', () => {
  for (const storedValue of [
    '{broken',
    JSON.stringify({ format: 'abcds-allocation-snapshot', version: 2, snapshot: validSnapshot }),
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
  }))), { status: 'loaded', snapshot: validSnapshot });
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
  assert.match(simulatorPage, /four aggregate pillar balances and aggregate margin debt/i);
  assert.match(simulatorPage, /no holdings, transactions, or account identifiers/i);
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
