export function attachAllocationSnapshotStorage({
  balanceInputs,
  marginDebtInput,
  saveButton,
  resetButton,
  status,
  storage,
  restoreSnapshot,
  saveSnapshot,
  clearSnapshot,
  refreshSummary,
}) {
  if (!storage) {
    saveButton.disabled = true;
    resetButton.disabled = true;
    status.textContent = 'Browser-local snapshot storage is unavailable.';
    return;
  }

  const setFields = (snapshot) => {
    for (const [name, input] of Object.entries(balanceInputs)) {
      input.value = String(snapshot[name]);
      input.removeAttribute?.('aria-invalid');
    }
    marginDebtInput.value = String(snapshot.marginDebt);
    marginDebtInput.removeAttribute?.('aria-invalid');
  };
  const inputValue = (input) => {
    const rawValue = String(input.value).trim();
    return rawValue === '' ? Number.NaN : Number(rawValue);
  };
  const currentSnapshot = () => ({
    ...Object.fromEntries(
      Object.entries(balanceInputs).map(([name, input]) => [name, inputValue(input)]),
    ),
    marginDebt: inputValue(marginDebtInput),
  });

  const restored = restoreSnapshot(storage);
  if (restored.status === 'loaded') {
    setFields(restored.snapshot);
    refreshSummary();
    status.textContent = 'Saved aggregate allocation snapshot restored from this browser.';
  } else if (restored.status === 'invalid') {
    status.textContent = 'Saved aggregate allocation snapshot was rejected and was not applied.';
  } else if (restored.status === 'unavailable') {
    status.textContent = 'Browser-local snapshot storage is unavailable.';
  }

  saveButton.addEventListener('click', () => {
    const saveResult = saveSnapshot(storage, currentSnapshot());
    status.textContent = saveResult.status === 'saved'
      ? 'Aggregate allocation snapshot saved in this browser.'
      : saveResult.status === 'invalid'
        ? 'Enter a valid aggregate snapshot before saving.'
        : 'Browser-local snapshot storage failed. Values were not saved.';
  });
  resetButton.addEventListener('click', () => {
    if (!clearSnapshot(storage)) {
      status.textContent = 'Saved aggregate allocation snapshot could not be cleared.';
      return;
    }
    setFields({ anchor: 0, booster: 0, closedEnd: 0, dynamo: 0, marginDebt: 0 });
    refreshSummary();
    status.textContent = 'Saved aggregate allocation snapshot cleared and fields reset.';
  });
}

export function attachAllocationSnapshot({
  balanceInputs,
  marginDebtInput = null,
  applyButton,
  summary,
  allocationControls,
  startingControls = null,
  startingMarginControls = null,
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
  const getMarginDebt = () => {
    if (!marginDebtInput) return 0;
    const rawValue = String(marginDebtInput.value).trim();
    const value = Number(rawValue);
    if (rawValue === '' || !Number.isFinite(value) || value < 0) {
      marginDebtInput.setAttribute?.('aria-invalid', 'true');
      throw new RangeError('Margin debt must be a finite, non-negative value.');
    }
    marginDebtInput.removeAttribute?.('aria-invalid');
    return value;
  };
  const getSnapshot = () => calculateSnapshot(getBalances(), getMarginDebt());

  let currentSnapshot = null;
  const updateSummary = () => {
    try {
      currentSnapshot = getSnapshot();
    } catch {
      currentSnapshot = null;
      applyButton.disabled = true;
      summary.textContent = marginDebtInput
        ? 'Enter valid non-negative pillar balances and margin debt no greater than gross value.'
        : 'Enter four non-negative pillar balances.';
      return;
    }
    if (!currentSnapshot.weights) {
      applyButton.disabled = true;
      summary.textContent = 'Enter at least one pillar balance to calculate weights.';
      return;
    }
    if (prepareProjectionSnapshot) {
      try {
        prepareProjectionSnapshot(getBalances(), getMarginDebt(), { maxStartingValue });
      } catch {
        applyButton.disabled = true;
        summary.textContent = `${formatCurrency(currentSnapshot.totalValue)} total exceeds the ${formatCurrency(maxStartingValue)} projection maximum. Reduce the aggregate balances to apply it.`;
        return;
      }
    }
    applyButton.disabled = false;
    const { anchor, booster, closedEnd, dynamo } = currentSnapshot.weights;
    const allocationSummary = `A ${anchor.toFixed(1)}%, B ${booster.toFixed(1)}%, C ${closedEnd.toFixed(1)}%, D ${dynamo.toFixed(1)}%.`;
    const repairTargetSummary = currentSnapshot.principalToResume > 0
      ? `${formatCurrency(currentSnapshot.principalToResume)} principal repair needed to move above 70% at unchanged gross value. `
      : 'No principal repair is needed to resume buying at unchanged gross value. ';
    summary.textContent = currentSnapshot.marginState
      ? `${formatCurrency(currentSnapshot.totalValue)} gross — ${formatCurrency(currentSnapshot.marginDebt)} debt — ${formatCurrency(currentSnapshot.netEquity)} net equity — ${currentSnapshot.marginEquityPercent.toFixed(1)}% (${currentSnapshot.marginState.replaceAll('-', ' ')}). ${repairTargetSummary}${allocationSummary}`
      : `${formatCurrency(currentSnapshot.totalValue)} total — ${allocationSummary}`;
  };

  for (const input of Object.values(balanceInputs)) {
    input.addEventListener('input', updateSummary);
  }
  marginDebtInput?.addEventListener('input', updateSummary);
  updateSummary();

  applyButton.addEventListener('click', () => {
    const snapshot = getSnapshot();
    if (!snapshot.weights) return;
    const projectionSnapshot = prepareProjectionSnapshot
      ? prepareProjectionSnapshot(getBalances(), getMarginDebt(), { maxStartingValue })
      : { startingValue: null, allocations: snapshot.weights };
    if (startingControls && projectionSnapshot.startingValue !== null) {
      const [range, number] = startingControls;
      range.value = String(projectionSnapshot.startingValue);
      number.value = range.value;
      number.removeAttribute('aria-invalid');
    }
    if (startingMarginControls && projectionSnapshot.startingMarginDebt !== undefined) {
      const [range, number] = startingMarginControls;
      range.max = String(projectionSnapshot.startingValue);
      number.max = range.max;
      range.value = String(projectionSnapshot.startingMarginDebt);
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
      : projectionSnapshot.startingMarginDebt === undefined
        ? `Allocation snapshot and ${formatCurrency(projectionSnapshot.startingValue)} starting value applied to the projection.`
        : `Allocation snapshot, ${formatCurrency(projectionSnapshot.startingValue)} starting value, and ${formatCurrency(projectionSnapshot.startingMarginDebt)} margin debt applied to the projection.`;
  });

  return { refreshSummary: updateSummary };
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
