import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachProjectionScenarioPresets,
  attachSimulatorControlsToggle,
} from '../src/lib/simulator-controls.mjs';

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
