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
