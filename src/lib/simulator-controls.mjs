export function attachProjectionScenarioPresets({
  buttons,
  controls,
  resultsStatus,
  getScenario,
  render,
}) {
  const clearSelectedPreset = () => {
    for (const button of buttons) button.setAttribute('aria-pressed', 'false');
  };
  for (const pair of Object.values(controls)) {
    for (const control of pair) {
      control.addEventListener('input', clearSelectedPreset);
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const scenario = getScenario(button.dataset.scenario);
      for (const [name, value] of Object.entries(scenario)) {
        const [range, number] = controls[name];
        range.value = String(value);
        number.value = range.value;
        number.removeAttribute('aria-invalid');
      }
      for (const presetButton of buttons) {
        presetButton.setAttribute('aria-pressed', String(presetButton === button));
      }
      render();
      resultsStatus.textContent = `${button.textContent.trim()} starting assumptions applied. Projection updated.`;
    });
  }
}

export function attachSimulatorControlsToggle({
  simulatorShell,
  controlsToggle,
  simulatorControls,
  matchMedia,
  requestFrame,
}) {
  let toggleRevision = 0;

  controlsToggle.addEventListener('click', () => {
    const revision = ++toggleRevision;
    const isOpen = simulatorShell.classList.toggle('controls-open');
    controlsToggle.setAttribute('aria-expanded', String(isOpen));
    controlsToggle.textContent = isOpen
      ? 'Hide simulator inputs'
      : 'Open simulator inputs';

    const isNarrowViewport = matchMedia('(max-width: 760px)').matches;
    if (isOpen && isNarrowViewport) {
      const prefersReducedMotion = matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      const behavior = prefersReducedMotion ? 'auto' : 'smooth';
      requestFrame(() => {
        if (
          revision !== toggleRevision
          || !simulatorShell.classList.contains('controls-open')
        ) return;
        simulatorControls.scrollIntoView({ behavior, block: 'start' });
      });
    }
  });
}
