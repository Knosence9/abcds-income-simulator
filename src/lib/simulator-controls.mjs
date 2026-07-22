export function attachAllocationSnapshot({
  balanceInputs,
  applyButton,
  summary,
  allocationControls,
  startingControls = null,
  calculateSnapshot,
  prepareProjectionSnapshot = null,
  maxStartingValue = Number.POSITIVE_INFINITY,
  formatCurrency,
  render,
}) {
  const getBalances = () => {
    let isValid = true;
    const balances = Object.fromEntries(
      Object.entries(balanceInputs).map(([name, input]) => {
        const rawValue = String(input.value).trim();
        const value = Number(rawValue);
        const inputIsValid = rawValue !== '' && Number.isFinite(value) && value >= 0;
        if (inputIsValid) input.removeAttribute?.('aria-invalid');
        else input.setAttribute?.('aria-invalid', 'true');
        isValid &&= inputIsValid;
        return [name, value];
      }),
    );
    if (!isValid) {
      throw new RangeError('Pillar balances must contain four finite, non-negative values.');
    }
    return balances;
  };
  const getSnapshot = () => calculateSnapshot(getBalances());

  let currentSnapshot = null;
  const updateSummary = () => {
    try {
      currentSnapshot = getSnapshot();
    } catch {
      currentSnapshot = null;
      applyButton.disabled = true;
      summary.textContent = 'Enter four non-negative pillar balances.';
      return;
    }
    if (!currentSnapshot.weights) {
      applyButton.disabled = true;
      summary.textContent = 'Enter at least one pillar balance to calculate weights.';
      return;
    }
    if (prepareProjectionSnapshot) {
      try {
        prepareProjectionSnapshot(getBalances(), { maxStartingValue });
      } catch {
        applyButton.disabled = true;
        summary.textContent = `${formatCurrency(currentSnapshot.totalValue)} total exceeds the ${formatCurrency(maxStartingValue)} projection maximum. Reduce the aggregate balances to apply it.`;
        return;
      }
    }
    applyButton.disabled = false;
    const { anchor, booster, closedEnd, dynamo } = currentSnapshot.weights;
    summary.textContent = `${formatCurrency(currentSnapshot.totalValue)} total — A ${anchor.toFixed(1)}%, B ${booster.toFixed(1)}%, C ${closedEnd.toFixed(1)}%, D ${dynamo.toFixed(1)}%.`;
  };

  for (const input of Object.values(balanceInputs)) {
    input.addEventListener('input', updateSummary);
  }
  updateSummary();

  applyButton.addEventListener('click', () => {
    const snapshot = getSnapshot();
    if (!snapshot.weights) return;
    const projectionSnapshot = prepareProjectionSnapshot
      ? prepareProjectionSnapshot(getBalances(), { maxStartingValue })
      : { startingValue: null, allocations: snapshot.weights };
    if (startingControls && projectionSnapshot.startingValue !== null) {
      const [range, number] = startingControls;
      range.value = String(projectionSnapshot.startingValue);
      number.value = range.value;
      number.removeAttribute('aria-invalid');
    }
    for (const [name, weight] of Object.entries(projectionSnapshot.allocations)) {
      const [range, number] = allocationControls[name];
      range.value = String(weight);
      number.value = range.value;
      number.removeAttribute('aria-invalid');
    }
    render();
    summary.textContent = projectionSnapshot.startingValue === null
      ? 'Allocation snapshot applied to the projection.'
      : `Allocation snapshot and ${formatCurrency(projectionSnapshot.startingValue)} starting value applied to the projection.`;
  });
}

export function attachProjectionScenarioPresets({
  buttons,
  controls,
  resultsStatus,
  getScenario,
  isValid = () => true,
  invalidateResults = () => {},
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
      if (!isValid()) {
        invalidateResults();
        return;
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
