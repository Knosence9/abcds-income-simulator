export const ALLOCATION_SNAPSHOT_STORAGE_KEY = 'abcds-allocation-snapshot-v1';
export const ALLOCATION_SNAPSHOT_MAX_TOTAL = 250_000;

const snapshotFields = ['anchor', 'booster', 'closedEnd', 'dynamo', 'marginDebt'];
const envelopeFields = ['format', 'version', 'snapshot'];

function hasExactFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

export function getAllocationSnapshotStorage(windowObject) {
  try {
    return windowObject.localStorage;
  } catch {
    return null;
  }
}

export function normalizeAllocationSnapshot(snapshot) {
  if (!hasExactFields(snapshot, snapshotFields)) return null;

  const normalized = Object.fromEntries(
    snapshotFields.map((field) => [field, snapshot[field]]),
  );
  if (!Object.values(normalized).every((value) => Number.isFinite(value) && value >= 0)) {
    return null;
  }

  const grossValue = normalized.anchor
    + normalized.booster
    + normalized.closedEnd
    + normalized.dynamo;
  if (
    !Number.isFinite(grossValue)
    || grossValue > ALLOCATION_SNAPSHOT_MAX_TOTAL
    || normalized.marginDebt > grossValue
  ) return null;

  return normalized;
}

function parseAllocationSnapshot(serializedSnapshot) {
  try {
    const envelope = JSON.parse(serializedSnapshot);
    if (
      !hasExactFields(envelope, envelopeFields)
      || envelope.format !== 'abcds-allocation-snapshot'
      || envelope.version !== 1
    ) return null;
    return normalizeAllocationSnapshot(envelope.snapshot);
  } catch {
    return null;
  }
}

export function saveAllocationSnapshot(storage, snapshot) {
  const normalized = normalizeAllocationSnapshot(snapshot);
  if (!normalized) return { status: 'invalid' };

  try {
    storage.setItem(ALLOCATION_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      format: 'abcds-allocation-snapshot',
      version: 1,
      snapshot: normalized,
    }));
    return { status: 'saved' };
  } catch {
    return { status: 'unavailable' };
  }
}

export function restoreAllocationSnapshot(storage) {
  try {
    const serializedSnapshot = storage.getItem(ALLOCATION_SNAPSHOT_STORAGE_KEY);
    if (serializedSnapshot === null) return { status: 'missing', snapshot: null };
    const snapshot = parseAllocationSnapshot(serializedSnapshot);
    return snapshot
      ? { status: 'loaded', snapshot }
      : { status: 'invalid', snapshot: null };
  } catch {
    return { status: 'unavailable', snapshot: null };
  }
}

export function loadAllocationSnapshot(storage) {
  return restoreAllocationSnapshot(storage).snapshot;
}

export function clearAllocationSnapshot(storage) {
  try {
    storage.removeItem(ALLOCATION_SNAPSHOT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
