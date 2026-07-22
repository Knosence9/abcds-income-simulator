import test from 'node:test';
import assert from 'node:assert/strict';

import { attachSimulatorControlsToggle } from '../src/lib/simulator-controls.mjs';

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
