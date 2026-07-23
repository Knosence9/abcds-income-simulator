import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachAllocationSnapshot,
  attachAllocationSnapshotStorage,
  attachProjectionScenarioPresets,
  attachSimulatorControlsToggle,
} from '../src/lib/simulator-controls.mjs';

test('keeps an empty allocation snapshot from being applied', () => {
  const inputHandlers = [];
  const input = () => ({
    value: '0',
    addEventListener(name, handler) {
      assert.equal(name, 'input');
      inputHandlers.push(handler);
    },
  });
  const balanceInputs = {
    anchor: input(),
    booster: input(),
    closedEnd: input(),
    dynamo: input(),
  };
  const applyButton = { disabled: false, addEventListener() {} };
  const summary = { textContent: '' };

  attachAllocationSnapshot({
    balanceInputs,
    applyButton,
    summary,
    allocationControls: {},
    calculateSnapshot: () => ({ totalValue: 0, weights: null }),
    formatCurrency: (value) => `$${value}`,
    render() {},
  });

  assert.equal(applyButton.disabled, true);
  assert.equal(summary.textContent, 'Enter at least one pillar balance to calculate weights.');
  assert.equal(inputHandlers.length, 4);
});

test('disables an invalid allocation snapshot without throwing', () => {
  const balanceInputs = Object.fromEntries(
    ['anchor', 'booster', 'closedEnd', 'dynamo'].map((name) => [
      name,
      { value: name === 'booster' ? '-1' : '0', addEventListener() {} },
    ]),
  );
  const applyButton = { disabled: false, addEventListener() {} };
  const summary = { textContent: '' };

  assert.doesNotThrow(() => attachAllocationSnapshot({
    balanceInputs,
    applyButton,
    summary,
    allocationControls: {},
    calculateSnapshot: () => {
      throw new RangeError('invalid');
    },
    formatCurrency: String,
    render() {},
  }));
  assert.equal(applyButton.disabled, true);
  assert.equal(summary.textContent, 'Enter four non-negative pillar balances.');
});

test('rejects blank snapshot inputs instead of coercing them to zero', () => {
  const attributes = new Map();
  let calculateCalls = 0;
  const balanceInputs = {
    anchor: {
      value: '',
      addEventListener() {},
      setAttribute(name, value) { attributes.set(name, value); },
      removeAttribute(name) { attributes.delete(name); },
    },
    ...Object.fromEntries(
      ['booster', 'closedEnd', 'dynamo'].map((name) => [
        name,
        { value: '100', addEventListener() {}, removeAttribute() {} },
      ]),
    ),
  };
  const applyButton = { disabled: false, addEventListener() {} };
  const summary = { textContent: '' };

  attachAllocationSnapshot({
    balanceInputs,
    applyButton,
    summary,
    allocationControls: {},
    calculateSnapshot() {
      calculateCalls += 1;
      return { totalValue: 300, weights: null };
    },
    formatCurrency: String,
    render() {},
  });

  assert.equal(calculateCalls, 0);
  assert.equal(attributes.get('aria-invalid'), 'true');
  assert.equal(applyButton.disabled, true);
  assert.equal(summary.textContent, 'Enter four non-negative pillar balances.');
});

test('applies a valid aggregate ABCD snapshot value, debt, and weights to projection controls', () => {
  let clickHandler;
  const input = (value) => ({ value, addEventListener() {} });
  const control = () => ({ value: '', removeAttribute() {} });
  const balanceInputs = {
    anchor: input('3000'),
    booster: input('2000'),
    closedEnd: input('3000'),
    dynamo: input('2000'),
  };
  const marginDebtInput = input('3500');
  const allocationControls = {
    anchor: [control(), control()],
    booster: [control(), control()],
    closedEnd: [control(), control()],
    dynamo: [control(), control()],
  };
  const startingControls = [control(), control()];
  const startingMarginControls = [control(), control()];
  const applyButton = {
    disabled: false,
    addEventListener(name, handler) {
      assert.equal(name, 'click');
      clickHandler = handler;
    },
  };
  let renderCount = 0;
  const summary = { textContent: '' };

  attachAllocationSnapshot({
    balanceInputs,
    marginDebtInput,
    applyButton,
    summary,
    allocationControls,
    startingControls,
    startingMarginControls,
    calculateSnapshot: () => ({
      totalValue: 10_000,
      weights: { anchor: 30, booster: 20, closedEnd: 30, dynamo: 20 },
      marginDebt: 3_500,
      netEquity: 6_500,
      marginEquityPercent: 65,
      marginState: 'repair-band',
      principalToResume: 500.01,
    }),
    prepareProjectionSnapshot: (balances, marginDebt) => {
      assert.deepEqual(balances, {
        anchor: 3_000,
        booster: 2_000,
        closedEnd: 3_000,
        dynamo: 2_000,
      });
      assert.equal(marginDebt, 3_500);
      return {
        startingValue: 10_000,
        startingMarginDebt: 3_500,
        allocations: { anchor: 30, booster: 20, closedEnd: 30, dynamo: 20 },
      };
    },
    maxStartingValue: 250_000,
    formatCurrency: (value) => `$${value.toLocaleString('en-US')}`,
    render: () => { renderCount += 1; },
  });

  assert.equal(
    summary.textContent,
    '$10,000 gross — $3,500 debt — $6,500 net equity — 65.0% (repair band). $500.01 principal repair needed to move above 70% at unchanged gross value. A 30.0%, B 20.0%, C 30.0%, D 20.0%.',
  );
  clickHandler();

  assert.deepEqual(startingControls.map(({ value }) => value), ['10000', '10000']);
  assert.deepEqual(startingMarginControls.map(({ value }) => value), ['3500', '3500']);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(allocationControls).map(([name, controls]) => [
        name,
        controls.map(({ value }) => value),
      ]),
    ),
    {
      anchor: ['30', '30'],
      booster: ['20', '20'],
      closedEnd: ['30', '30'],
      dynamo: ['20', '20'],
    },
  );
  assert.equal(renderCount, 1);
  assert.equal(
    summary.textContent,
    'Allocation snapshot, $10,000 starting value, and $3,500 margin debt applied to the projection.',
  );
});

test('disables an aggregate snapshot whose total exceeds the projection range', () => {
  const balanceInputs = Object.fromEntries(
    ['anchor', 'booster', 'closedEnd', 'dynamo'].map((name) => [
      name,
      { value: name === 'anchor' ? '250001' : '0', addEventListener() {}, removeAttribute() {} },
    ]),
  );
  const applyButton = { disabled: false, addEventListener() {} };
  const summary = { textContent: '' };

  attachAllocationSnapshot({
    balanceInputs,
    applyButton,
    summary,
    allocationControls: {},
    startingControls: [],
    calculateSnapshot: () => ({
      totalValue: 250_001,
      weights: { anchor: 100, booster: 0, closedEnd: 0, dynamo: 0 },
    }),
    prepareProjectionSnapshot() {
      throw new RangeError('Snapshot total must not exceed the projection maximum of 250000.');
    },
    maxStartingValue: 250_000,
    formatCurrency: (value) => `$${value.toLocaleString('en-US')}`,
    render() {},
  });

  assert.equal(applyButton.disabled, true);
  assert.equal(
    summary.textContent,
    '$250,001 total exceeds the $250,000 projection maximum. Reduce the aggregate balances to apply it.',
  );
});

test('restores, saves, and resets aggregate snapshot fields through explicit controls', () => {
  const handlers = {};
  const balanceInputs = Object.fromEntries(
    ['anchor', 'booster', 'closedEnd', 'dynamo'].map((name) => [
      name,
      { value: '0', removeAttribute() {} },
    ]),
  );
  const marginDebtInput = { value: '0', removeAttribute() {} };
  const saveButton = {
    disabled: false,
    addEventListener(name, handler) { handlers[`save:${name}`] = handler; },
  };
  const resetButton = {
    disabled: false,
    addEventListener(name, handler) { handlers[`reset:${name}`] = handler; },
  };
  const status = { textContent: '' };
  const restored = {
    anchor: 3_000,
    booster: 2_000,
    closedEnd: 3_000,
    dynamo: 2_000,
    marginDebt: 3_500,
  };
  const saved = [];
  let clearCalls = 0;
  let refreshCalls = 0;

  attachAllocationSnapshotStorage({
    balanceInputs,
    marginDebtInput,
    saveButton,
    resetButton,
    status,
    storage: {},
    restoreSnapshot: () => ({
      status: 'loaded',
      snapshot: restored,
      savedAt: '2026-07-23T03:15:00.000Z',
    }),
    saveSnapshot: (_storage, snapshot) => {
      saved.push(snapshot);
      return { status: 'saved', savedAt: '2026-07-23T04:30:00.000Z' };
    },
    clearSnapshot: () => { clearCalls += 1; return true; },
    refreshSummary: () => { refreshCalls += 1; },
    formatSavedAt: (savedAt) => ({
      '2026-07-23T03:15:00.000Z': 'July 22, 2026 at 11:15 PM',
      '2026-07-23T04:30:00.000Z': 'July 23, 2026 at 12:30 AM',
    })[savedAt],
  });

  assert.deepEqual(
    Object.fromEntries(Object.entries(balanceInputs).map(([name, input]) => [name, input.value])),
    { anchor: '3000', booster: '2000', closedEnd: '3000', dynamo: '2000' },
  );
  assert.equal(marginDebtInput.value, '3500');
  assert.equal(
    status.textContent,
    'Aggregate allocation snapshot from July 22, 2026 at 11:15 PM restored from this browser.',
  );
  assert.equal(refreshCalls, 1);

  handlers['save:click']();
  assert.deepEqual(saved, [restored]);
  assert.equal(
    status.textContent,
    'Aggregate allocation snapshot saved in this browser on July 23, 2026 at 12:30 AM.',
  );

  handlers['reset:click']();
  assert.deepEqual(
    Object.values(balanceInputs).map((input) => input.value),
    ['0', '0', '0', '0'],
  );
  assert.equal(marginDebtInput.value, '0');
  assert.equal(clearCalls, 1);
  assert.equal(refreshCalls, 2);
  assert.equal(status.textContent, 'Saved aggregate allocation snapshot cleared and fields reset.');
});

test('formats saved snapshot dates with the browser default locale', () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  const requestedLocales = [];
  Intl.DateTimeFormat = class {
    constructor(locales) {
      requestedLocales.push(locales);
    }

    format() {
      return 'browser-local date';
    }
  };

  try {
    const status = { textContent: '' };
    attachAllocationSnapshotStorage({
      balanceInputs: Object.fromEntries(
        ['anchor', 'booster', 'closedEnd', 'dynamo'].map((name) => [name, { value: '0' }]),
      ),
      marginDebtInput: { value: '0' },
      saveButton: { disabled: false, addEventListener() {} },
      resetButton: { disabled: false, addEventListener() {} },
      status,
      storage: {},
      restoreSnapshot: () => ({
        status: 'loaded',
        snapshot: { anchor: 1, booster: 2, closedEnd: 3, dynamo: 4, marginDebt: 0 },
        savedAt: '2026-07-23T03:15:00.000Z',
      }),
      saveSnapshot: () => ({ status: 'saved', savedAt: '2026-07-23T03:15:00.000Z' }),
      clearSnapshot: () => true,
      refreshSummary() {},
    });

    assert.deepEqual(requestedLocales, [undefined]);
    assert.equal(
      status.textContent,
      'Aggregate allocation snapshot from browser-local date restored from this browser.',
    );
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
  }
});

test('reports an unavailable save date when restoring a version-1 snapshot', () => {
  const status = { textContent: '' };
  attachAllocationSnapshotStorage({
    balanceInputs: Object.fromEntries(
      ['anchor', 'booster', 'closedEnd', 'dynamo'].map((name) => [name, { value: '0' }]),
    ),
    marginDebtInput: { value: '0' },
    saveButton: { disabled: false, addEventListener() {} },
    resetButton: { disabled: false, addEventListener() {} },
    status,
    storage: {},
    restoreSnapshot: () => ({
      status: 'loaded',
      snapshot: { anchor: 1, booster: 2, closedEnd: 3, dynamo: 4, marginDebt: 0 },
      savedAt: null,
    }),
    saveSnapshot: () => ({ status: 'saved', savedAt: '2026-07-23T03:15:00.000Z' }),
    clearSnapshot: () => true,
    refreshSummary() {},
  });

  assert.equal(
    status.textContent,
    'Aggregate allocation snapshot restored from this browser; its save date is unavailable.',
  );
});

test('keeps save confirmation usable when an injected saver returns an invalid save date', () => {
  let clickHandler;
  const status = { textContent: '' };
  attachAllocationSnapshotStorage({
    balanceInputs: Object.fromEntries(
      ['anchor', 'booster', 'closedEnd', 'dynamo'].map((name) => [name, { value: '0' }]),
    ),
    marginDebtInput: { value: '0' },
    saveButton: {
      disabled: false,
      addEventListener(_event, handler) { clickHandler = handler; },
    },
    resetButton: { disabled: false, addEventListener() {} },
    status,
    storage: {},
    restoreSnapshot: () => ({ status: 'missing', snapshot: null }),
    saveSnapshot: () => ({ status: 'saved', savedAt: 'not-a-date' }),
    clearSnapshot: () => true,
    refreshSummary() {},
  });

  assert.doesNotThrow(() => clickHandler());
  assert.equal(status.textContent, 'Aggregate allocation snapshot saved in this browser.');
});

test('does not coerce blank aggregate fields to zero when saving', () => {
  let clickHandler;
  let savedSnapshot;
  const balanceInputs = {
    anchor: { value: '' },
    booster: { value: '0' },
    closedEnd: { value: '0' },
    dynamo: { value: '0' },
  };
  const status = { textContent: '' };

  attachAllocationSnapshotStorage({
    balanceInputs,
    marginDebtInput: { value: '0' },
    saveButton: {
      disabled: false,
      addEventListener(_name, handler) { clickHandler = handler; },
    },
    resetButton: { disabled: false, addEventListener() {} },
    status,
    storage: {},
    restoreSnapshot: () => ({ status: 'missing', snapshot: null }),
    saveSnapshot: (_storage, snapshot) => {
      savedSnapshot = snapshot;
      return { status: 'invalid' };
    },
    clearSnapshot: () => true,
    refreshSummary() {},
  });

  clickHandler();

  assert.equal(Number.isNaN(savedSnapshot.anchor), true);
  assert.equal(status.textContent, 'Enter a valid aggregate snapshot before saving.');
});

test('announces browser storage failure without blaming valid snapshot input', () => {
  let clickHandler;
  const status = { textContent: '' };
  attachAllocationSnapshotStorage({
    balanceInputs: Object.fromEntries(
      ['anchor', 'booster', 'closedEnd', 'dynamo'].map((name) => [name, { value: '100' }]),
    ),
    marginDebtInput: { value: '0' },
    saveButton: { disabled: false, addEventListener(_name, handler) { clickHandler = handler; } },
    resetButton: { disabled: false, addEventListener() {} },
    status,
    storage: {},
    restoreSnapshot: () => ({ status: 'missing', snapshot: null }),
    saveSnapshot: () => ({ status: 'unavailable' }),
    clearSnapshot: () => true,
    refreshSummary() {},
  });

  clickHandler();
  assert.equal(status.textContent, 'Browser-local snapshot storage failed. Values were not saved.');
});

test('rejects an invalid stored aggregate snapshot without partially applying it', () => {
  const balanceInputs = Object.fromEntries(
    ['anchor', 'booster', 'closedEnd', 'dynamo'].map((name) => [name, { value: '0' }]),
  );
  const marginDebtInput = { value: '0' };

  attachAllocationSnapshotStorage({
    balanceInputs,
    marginDebtInput,
    saveButton: { disabled: false, addEventListener() {} },
    resetButton: { disabled: false, addEventListener() {} },
    status: { set textContent(value) { this.value = value; }, get textContent() { return this.value; } },
    storage: {},
    restoreSnapshot: () => ({ status: 'invalid', snapshot: null }),
    saveSnapshot: () => true,
    clearSnapshot: () => true,
    refreshSummary() {},
  });

  assert.deepEqual(Object.values(balanceInputs).map((input) => input.value), ['0', '0', '0', '0']);
  assert.equal(marginDebtInput.value, '0');
});

test('announces when browser storage becomes unavailable during restore', () => {
  const status = { textContent: '' };

  attachAllocationSnapshotStorage({
    balanceInputs: Object.fromEntries(
      ['anchor', 'booster', 'closedEnd', 'dynamo'].map((name) => [name, { value: '0' }]),
    ),
    marginDebtInput: { value: '0' },
    saveButton: { disabled: false, addEventListener() {} },
    resetButton: { disabled: false, addEventListener() {} },
    status,
    storage: {},
    restoreSnapshot: () => ({ status: 'unavailable', snapshot: null }),
    saveSnapshot: () => ({ status: 'saved' }),
    clearSnapshot: () => true,
    refreshSummary() {},
  });

  assert.equal(status.textContent, 'Browser-local snapshot storage is unavailable.');
});

function createFixture({ narrow = true, reducedMotion = false } = {}) {
  const classes = new Set();
  const frames = [];
  const scrollCalls = [];
  let clickHandler;

  const simulatorShell = {
    classList: {
      toggle(className) {
        if (classes.has(className)) {
          classes.delete(className);
          return false;
        }
        classes.add(className);
        return true;
      },
      contains(className) {
        return classes.has(className);
      },
    },
  };
  const controlsToggle = {
    attributes: new Map(),
    textContent: 'Open simulator inputs',
    addEventListener(eventName, handler) {
      assert.equal(eventName, 'click');
      clickHandler = handler;
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    click() {
      clickHandler();
    },
  };
  const simulatorControls = {
    scrollIntoView(options) {
      scrollCalls.push(options);
    },
  };
  const matchMedia = (query) => ({
    matches: query === '(max-width: 760px)' ? narrow : reducedMotion,
  });

  attachSimulatorControlsToggle({
    simulatorShell,
    controlsToggle,
    simulatorControls,
    matchMedia,
    requestFrame: (callback) => frames.push(callback),
  });

  return {
    controlsToggle,
    frames,
    scrollCalls,
  };
}

test('opening simulator controls on a narrow screen scrolls the panel into view', () => {
  const fixture = createFixture();

  fixture.controlsToggle.click();
  fixture.frames.shift()();

  assert.deepEqual(fixture.scrollCalls, [{ behavior: 'smooth', block: 'start' }]);
});

test('opening simulator controls on a desktop does not queue a scroll', () => {
  const fixture = createFixture({ narrow: false });

  fixture.controlsToggle.click();

  assert.deepEqual(fixture.frames, []);
  assert.deepEqual(fixture.scrollCalls, []);
});

test('reduced motion opens mobile controls without smooth scrolling', () => {
  const fixture = createFixture({ reducedMotion: true });

  fixture.controlsToggle.click();
  fixture.frames.shift()();

  assert.deepEqual(fixture.scrollCalls, [{ behavior: 'auto', block: 'start' }]);
});

test('closing simulator controls before the queued frame skips scrolling', () => {
  const fixture = createFixture();

  fixture.controlsToggle.click();
  fixture.controlsToggle.click();
  fixture.frames.shift()();

  assert.deepEqual(fixture.scrollCalls, []);
});

test('reopening controls invalidates the stale queued scroll', () => {
  const fixture = createFixture();

  fixture.controlsToggle.click();
  fixture.controlsToggle.click();
  fixture.controlsToggle.click();
  fixture.frames.shift()();
  fixture.frames.shift()();

  assert.deepEqual(fixture.scrollCalls, [{ behavior: 'smooth', block: 'start' }]);
});

test('scenario preset updates paired controls and renders once', () => {
  const handlers = new Map();
  const button = {
    dataset: { scenario: 'stress' },
    textContent: 'Stress',
    attributes: new Map(),
    addEventListener(name, handler) { handlers.set(name, handler); },
    setAttribute(name, value) { this.attributes.set(name, value); },
  };
  const control = () => ({
    value: '',
    addEventListener() {},
    removeAttribute() {},
  });
  const controls = {
    dividendYield: [control(), control()],
    acDistributionShare: [control(), control()],
    dividendGrowth: [control(), control()],
    inflation: [control(), control()],
  };
  const resultsStatus = { textContent: '' };
  let renderCount = 0;

  attachProjectionScenarioPresets({
    buttons: [button],
    controls,
    resultsStatus,
    getScenario: () => ({
      dividendYield: 8,
      acDistributionShare: 25,
      dividendGrowth: -10,
      inflation: 7,
    }),
    render: () => { renderCount += 1; },
  });
  handlers.get('click')();

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(controls).map(([name, [range, number]]) => [
        name,
        [range.value, number.value],
      ]),
    ),
    {
      dividendYield: ['8', '8'],
      acDistributionShare: ['25', '25'],
      dividendGrowth: ['-10', '-10'],
      inflation: ['7', '7'],
    },
  );
  assert.equal(button.attributes.get('aria-pressed'), 'true');
  assert.equal(renderCount, 1);
  assert.match(resultsStatus.textContent, /Stress starting assumptions applied/);
});

test('scenario preset keeps results unavailable while another input is invalid', () => {
  const handlers = new Map();
  const button = {
    dataset: { scenario: 'base' },
    textContent: 'Base',
    attributes: new Map(),
    addEventListener(name, handler) { handlers.set(name, handler); },
    setAttribute(name, value) { this.attributes.set(name, value); },
  };
  const control = () => ({
    value: '',
    addEventListener() {},
    removeAttribute() {},
  });
  const resultsStatus = { textContent: 'Enter a value within the allowed range.' };
  let invalidationCount = 0;
  let renderCount = 0;

  attachProjectionScenarioPresets({
    buttons: [button],
    controls: { dividendYield: [control(), control()] },
    resultsStatus,
    getScenario: () => ({ dividendYield: 12 }),
    isValid: () => false,
    invalidateResults: () => { invalidationCount += 1; },
    render: () => { renderCount += 1; },
  });
  handlers.get('click')();

  assert.equal(renderCount, 0);
  assert.equal(invalidationCount, 1);
  assert.equal(resultsStatus.textContent, 'Enter a value within the allowed range.');
});

test('manual scenario control edits clear the selected preset', () => {
  const inputHandlers = [];
  const button = {
    dataset: { scenario: 'base' },
    textContent: 'Base',
    attributes: new Map(),
    addEventListener() {},
    setAttribute(name, value) { this.attributes.set(name, value); },
  };
  const control = () => ({
    addEventListener(name, handler) {
      if (name === 'input') inputHandlers.push(handler);
    },
  });

  attachProjectionScenarioPresets({
    buttons: [button],
    controls: { dividendYield: [control(), control()] },
    resultsStatus: { textContent: '' },
    getScenario: () => ({}),
    render() {},
  });
  button.setAttribute('aria-pressed', 'true');
  inputHandlers[0]();

  assert.equal(button.attributes.get('aria-pressed'), 'false');
});
