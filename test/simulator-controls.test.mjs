import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachAllocationSnapshot,
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
    '$10,000 gross — $3,500 debt — $6,500 net equity — 65.0% (repair band). A 30.0%, B 20.0%, C 30.0%, D 20.0%.',
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
