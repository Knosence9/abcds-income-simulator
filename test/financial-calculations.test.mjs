import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  calculateMarginAccount,
  calculateWeeklyBudget,
  classifyMarginRepairState,
  getProjectionScenario,
  monthlyToWeekly,
  parseWeeklyContribution,
  routePillarDistributions,
} from '../src/lib/financial-calculations.mjs';

test('provides conservative projection starting assumptions', () => {
  assert.deepEqual(getProjectionScenario('conservative'), {
    dividendYield: 8,
    acDistributionShare: 75,
    dividendGrowth: 1,
    inflation: 3,
  });
});

test('provides base projection starting assumptions', () => {
  assert.deepEqual(getProjectionScenario('base'), {
    dividendYield: 12,
    acDistributionShare: 50,
    dividendGrowth: 2,
    inflation: 3,
  });
});

test('provides distribution stress starting assumptions', () => {
  assert.deepEqual(getProjectionScenario('stress'), {
    dividendYield: 8,
    acDistributionShare: 25,
    dividendGrowth: -10,
    inflation: 7,
  });
});

test('returns a defensive copy of projection assumptions', () => {
  const scenario = getProjectionScenario('base');
  scenario.dividendYield = 80;

  assert.equal(getProjectionScenario('base').dividendYield, 12);
});

test('rejects an unknown projection scenario', () => {
  for (const name of ['optimistic', 'toString']) {
    assert.throws(
      () => getProjectionScenario(name),
      new RegExp(`Unknown projection scenario: ${name}`),
    );
  }
});

test('separates gross market value, margin debt, and net equity', () => {
  assert.deepEqual(
    calculateMarginAccount({ marketValue: 10_000, marginDebt: 2_500 }),
    {
      grossMarketValue: 10_000,
      marginDebt: 2_500,
      netEquity: 7_500,
      marginEquityPercent: 75,
    },
  );
});

test('simulator exposes and applies accessible scenario starting points', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  for (const [name, label] of [
    ['conservative', 'Conservative'],
    ['base', 'Base'],
    ['stress', 'Stress'],
  ]) {
    assert.match(
      simulatorPage,
      new RegExp(`<button[^>]*data-scenario="${name}"[^>]*aria-pressed="false"[^>]*>${label}<\\/button>`),
    );
  }
  assert.match(simulatorPage, /getProjectionScenario/);
  assert.match(simulatorPage, /attachProjectionScenarioPresets/);
  assert.match(simulatorPage, /starting assumptions/i);
  assert.match(simulatorPage, /NAV\/price decline/i);
  assert.match(simulatorPage, /margin interest and principal repayment/i);
});

test('simulator exposes a bounded margin debt input and separate equity ledgers', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /calculateMarginAccount/);
  assert.match(
    simulatorPage,
    /<label id="marginDebtLabel" for="marginDebtNumber">Starting margin debt/,
  );
  assert.match(
    simulatorPage,
    /<input id="marginDebt" type="range" aria-labelledby="marginDebtLabel"/,
  );
  assert.match(simulatorPage, /id="grossMarketValue"/);
  assert.match(simulatorPage, /id="marginDebtResult"/);
  assert.match(simulatorPage, /id="netEquity"/);
  assert.match(simulatorPage, /id="marginEquityPercent"/);
  assert.match(simulatorPage, /marginDebt\.max = starting\.value/);
  assert.match(simulatorPage, /marginDebtNumber\.max = starting\.value/);
  assert.match(simulatorPage, /principal is held constant/i);
  assert.match(simulatorPage, /interest and principal repayment are not modeled/i);
});

test('parses a valid budget contribution for the simulator', () => {
  assert.equal(parseWeeklyContribution('200.25', { fallback: 750, max: 5_000 }), 200.25);
});

test('falls back when a budget contribution is absent or not numeric', () => {
  for (const value of [null, '', 'not-a-number']) {
    assert.equal(parseWeeklyContribution(value, { fallback: 750, max: 5_000 }), 750);
  }
});

test('clamps a finite budget contribution to simulator limits', () => {
  assert.equal(parseWeeklyContribution('-1', { fallback: 750, max: 5_000 }), 0);
  assert.equal(parseWeeklyContribution('5000.01', { fallback: 750, max: 5_000 }), 5_000);
});

test('normalizes an imported weekly contribution to whole cents', () => {
  assert.equal(parseWeeklyContribution('123.456', { fallback: 750, max: 5_000 }), 123.46);
});

test('calculates a safe contribution from the remaining weekly surplus', () => {
  assert.deepEqual(
    calculateWeeklyBudget({
      income: 1_000,
      essentials: 500,
      flexible: 150,
      sinkingFunds: 100,
      breathingRoom: 50,
    }),
    {
      totalOutflow: 800,
      surplusOrDeficit: 200,
      safeContribution: 200,
    },
  );
});

test('reports a weekly deficit without recommending a negative contribution', () => {
  assert.deepEqual(
    calculateWeeklyBudget({
      income: 700,
      essentials: 500,
      flexible: 150,
      sinkingFunds: 100,
      breathingRoom: 50,
    }),
    {
      totalOutflow: 800,
      surplusOrDeficit: -100,
      safeContribution: 0,
    },
  );
});

test('balances decimal currency values without a floating-point deficit', () => {
  assert.deepEqual(
    calculateWeeklyBudget({
      income: 0.30,
      essentials: 0.10,
      flexible: 0.20,
      sinkingFunds: 0,
      breathingRoom: 0,
    }),
    {
      totalOutflow: 0.30,
      surplusOrDeficit: 0,
      safeContribution: 0,
    },
  );
});

test('classifies margin equity below the 60% floor for immediate repair', () => {
  assert.equal(classifyMarginRepairState(59.99), 'repair-immediately');
});

test('classifies the 60% to 70% inclusive interval as the repair band', () => {
  assert.equal(classifyMarginRepairState(60), 'repair-band');
  assert.equal(classifyMarginRepairState(70), 'repair-band');
});

test('classifies margin equity above 70% as eligible to resume buying', () => {
  assert.equal(classifyMarginRepairState(70.01), 'eligible-to-resume');
});

test('strategy flow renders the canonical three-state margin repair rule', async () => {
  const homePage = await readFile(
    new URL('../src/pages/index.astro', import.meta.url),
    'utf8',
  );

  assert.match(homePage, /classifyMarginRepairState/);
  assert.match(homePage, /data-margin-state=/);
  assert.match(homePage, /Below 60%/);
  assert.match(homePage, /60%–70% inclusive/);
  assert.match(homePage, /Above 70%/);
  assert.match(homePage, /household budget is stable/);
  assert.match(
    homePage,
    /Margin equity % = net account equity ÷ gross securities market value × 100/,
  );
  assert.match(homePage, /floor/);
  assert.match(homePage, /repair band/);
  assert.match(homePage, /resume threshold/);
  assert.match(
    homePage,
    /Below 60%: immediate repair \/ 60%–70%: repair band \/ above 70%: eligible/,
  );
  assert.doesNotMatch(homePage, /Equity<br\/>below 60%\?/);
});

test('routes A/C distributions to reinvestment and B/D distributions to spendable cash', () => {
  const result = routePillarDistributions({
    marketValue: 10_000,
    anchor: 40,
    booster: 30,
    closedEnd: 20,
    dynamo: 10,
  });

  assert.deepEqual(result, {
    grossDistributions: 100,
    reinvestedDistributions: 60,
    spendableDistributions: 40,
    endingMarketValue: 10_060,
  });
});

test('simulator exposes and uses separate distribution ledgers', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /routePillarDistributions/);
  assert.match(simulatorPage, /id="grossDistributions"/);
  assert.match(simulatorPage, /id="reinvestedDistributions"/);
  assert.match(simulatorPage, /id="spendableDistributions"/);
  assert.match(
    simulatorPage,
    /id="acShare"[^>]*aria-labelledby="acShareLabel"/,
  );
  assert.match(simulatorPage, />Reinvested A\/C distributions</);
  assert.match(simulatorPage, />Spendable B\/D distributions</);
});

test('simulator range and number pairs share unique accessible labels', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );
  const controls = [
    ['starting', 'startingNumber', 'Starting gross market value'],
    ['marginDebt', 'marginDebtNumber', 'Starting margin debt'],
    ['paycheck', 'paycheckNumber', 'Weekly paycheck contribution'],
    ['yield', 'yieldNumber', 'Portfolio dividend %'],
    ['acShare', 'acShareNumber', 'A/C distribution share (DRIP on)'],
    ['growth', 'growthNumber', 'Dividend growth %'],
    ['inflation', 'inflationNumber', 'Inflation %'],
    ['expenses', 'expensesNumber', 'Monthly expenses'],
    ['projectionYears', 'projectionYearsNumber', 'Projection years'],
  ];

  for (const [rangeId, numberId, label] of controls) {
    const labelId = `${rangeId}Label`;
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      simulatorPage,
      new RegExp(`<label id="${labelId}" for="${numberId}">${escapedLabel}`),
    );
    assert.match(
      simulatorPage,
      new RegExp(
        `<input id="${rangeId}" type="range" aria-labelledby="${labelId}"`,
      ),
    );
  }
});

test('simulator announces a concise result summary after committed input changes', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    simulatorPage,
    /id="resultsStatus" class="sr-only" role="status" aria-live="polite" aria-atomic="true"/,
  );
  assert.doesNotMatch(simulatorPage, /class="stats"[^>]*role="status"/);
  assert.match(simulatorPage, /addEventListener\('change', announceResultsIfValid\)/);
  assert.match(simulatorPage, /Projection updated\. Gross market value/);
  assert.match(simulatorPage, /Projection updated\.[\s\S]*Margin debt/);
  assert.match(simulatorPage, /Projection updated\.[\s\S]*Margin equity/);
});

test('simulator announces when starting gross market value bounds margin debt downward', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    simulatorPage,
    /const currentDebt = Number\(marginDebt\.value\);[\s\S]*marginDebt\.max = starting\.value;[\s\S]*const boundedDebt = Math\.min\(currentDebt, Number\(starting\.value\)\)/,
  );
  assert.match(
    simulatorPage,
    /cannot exceed starting gross market value/i,
  );
  assert.match(
    simulatorPage,
    /margin debt was adjusted because it cannot exceed starting gross market value/i,
  );
});

test('simulator reinitializes its controls after ClientRouter navigation', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /document\.addEventListener\('astro:page-load', initializeSimulator\)/);
  assert.match(simulatorPage, /function initializeSimulator\(\)/);
});

test('simulator applies a validated weekly contribution from the budget URL', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /parseWeeklyContribution/);
  assert.match(simulatorPage, /window\.location\.hash\.slice\(1\)/);
  assert.match(simulatorPage, /searchParams\.get\('weeklyContribution'\)/);
  assert.match(simulatorPage, /paycheck\.value = transferredContribution/);
  assert.match(simulatorPage, /const appliedContribution = Number\(paycheck\.value\)/);
  assert.match(simulatorPage, /paycheckNumber\.value = appliedContribution/);
  assert.match(simulatorPage, /Number\.isFinite\(requestedNumber\)/);
  assert.match(simulatorPage, /\? appliedContribution/);
  assert.match(simulatorPage, /Weekly contribution imported from budget:/);
  assert.match(simulatorPage, /id="paycheckNumber"[^>]*step="0\.01"/);
  assert.match(simulatorPage, /id="paycheck"[^>]*step="0\.01"/);
});

test('simulator keeps synchronized controls on the range-valid value', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    simulatorPage,
    /number\.value\.trim\(\) === ''[\s\S]*!number\.validity\.valid[\s\S]*!Number\.isFinite\(number\.valueAsNumber\)/,
  );
  assert.match(simulatorPage, /number\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(
    simulatorPage,
    /const enteredValue = number\.valueAsNumber;[\s\S]*range\.value = String\(enteredValue\);[\s\S]*number\.value = range\.value;[\s\S]*resultsStatus\.textContent = '';[\s\S]*render\(\)/,
  );
  assert.match(
    simulatorPage,
    /function hasInvalidInputs\(\)[\s\S]*pairs\.some[\s\S]*aria-invalid[\s\S]*true/,
  );
  assert.match(
    simulatorPage,
    /function announceResultsIfValid\(\)[\s\S]*hasInvalidInputs\(\)[\s\S]*Enter a value within the allowed range\.[\s\S]*return;[\s\S]*announceResults\(\)/,
  );
  assert.match(
    simulatorPage,
    /number\.removeAttribute\('aria-invalid'\);[\s\S]*if \(hasInvalidInputs\(\)\)[\s\S]*Enter a value within the allowed range\.[\s\S]*return;[\s\S]*resultsStatus\.textContent = '';[\s\S]*render\(\)/,
  );
  assert.match(simulatorPage, /range\.addEventListener\('change', announceResultsIfValid\)/);
});

test('simulator makes derived output unavailable while any input is invalid', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    simulatorPage,
    /function invalidateResults\(\)[\s\S]*resultIds[\s\S]*textContent = '—'[\s\S]*chart\.replaceChildren\(\)[\s\S]*Projection unavailable while an input is invalid/,
  );
  assert.match(
    simulatorPage,
    /number\.setAttribute\('aria-invalid', 'true'\);[\s\S]*invalidateResults\(\);[\s\S]*Enter a value within the allowed range\./,
  );
  assert.match(
    simulatorPage,
    /function render\(\)[\s\S]*chart\.setAttribute\('aria-label', 'Line plot of projected dividend income'\)/,
  );
});

test('simulator disables document smooth scrolling for reduced motion', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    simulatorPage,
    /@media \(prefers-reduced-motion: reduce\) \{ html \{ scroll-behavior:auto; \} \}/,
  );
});

test('simulator initializer ignores ClientRouter visits to other routes', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    simulatorPage,
    /function initializeSimulator\(\) \{[\s\S]*if \(!simulatorShell \|\| !controlsToggle\) \{[\s\S]*return;/,
  );
});

test('simulator keyboard cleanup ignores routes without simulator controls', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    simulatorPage,
    /if \(!simulatorShell \|\| !controlsToggle\) \{[\s\S]*document\.removeEventListener\('keydown', closeSimulatorControls\);[\s\S]*return;/,
  );
});

test('menu lab reinitializes drag controls after ClientRouter navigation', async () => {
  const menuLabPage = await readFile(
    new URL('../src/dev-pages/menu-lab.astro', import.meta.url),
    'utf8',
  );

  assert.match(menuLabPage, /document\.addEventListener\('astro:page-load', initializeMenuLab\)/);
  assert.match(menuLabPage, /function initializeMenuLab\(\)/);
});

test('menu lab initializer ignores ClientRouter visits to other routes', async () => {
  const menuLabPage = await readFile(
    new URL('../src/dev-pages/menu-lab.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    menuLabPage,
    /function initializeMenuLab\(\) \{[\s\S]*if \(!lab\) \{[\s\S]*return;/,
  );
});

test('menu lab stage keeps every seeded control inside its clipped viewport', async () => {
  const menuLabPage = await readFile(
    new URL('../src/dev-pages/menu-lab.astro', import.meta.url),
    'utf8',
  );
  const stageMinimumHeights = [...menuLabPage.matchAll(
    /\.stage\s*\{[^}]*min-height:\s*(\d+)px;/g,
  )].map((match) => Number(match[1]));

  assert.equal(stageMinimumHeights.length, 2);
  assert.ok(
    stageMinimumHeights.every((height) => height >= 855),
    'R20 needs at least 855px of stage height to remain fully draggable',
  );
});

test('converts a $100 monthly amount to approximately $23.08 per week', () => {
  const weeklyAmount = monthlyToWeekly(100);

  assert.equal(weeklyAmount, 100 * 12 / 52);
  assert.equal(weeklyAmount.toFixed(2), '23.08');
});

test('budget page provides a local-only accessible weekly planner', async () => {
  const budgetPage = await readFile(
    new URL('../src/pages/budget.astro', import.meta.url),
    'utf8',
  );

  assert.match(budgetPage, /calculateWeeklyBudget/);
  for (const [id, label] of [
    ['weeklyIncome', 'Weekly take-home income'],
    ['weeklyEssentials', 'Weekly essentials'],
    ['weeklyFlexible', 'Weekly flexible spending'],
    ['weeklySinkingFunds', 'Weekly sinking funds'],
    ['weeklyBreathingRoom', 'Weekly breathing-room buffer'],
  ]) {
    assert.match(budgetPage, new RegExp(`<label for="${id}">${label}<\\/label>`));
    assert.match(budgetPage, new RegExp(`<input id="${id}"[^>]*type="number"`));
  }
  assert.match(budgetPage, /id="weeklyBudgetStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(budgetPage, /Calculations run locally in this page/);
  assert.doesNotMatch(budgetPage, /not included in analytics events/);
  assert.match(budgetPage, /if \(!form\.checkValidity\(\)\)/);
  assert.match(budgetPage, /aria-invalid/);
  assert.match(
    budgetPage,
    /initializeWeeklyBudget\(\);\s*document\.addEventListener\('astro:page-load', initializeWeeklyBudget\)/,
  );
});

test('budget planner links only its calculated safe contribution to the simulator', async () => {
  const budgetPage = await readFile(
    new URL('../src/pages/budget.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    budgetPage,
    /id="sendBudgetToSimulator"[^>]*role="link"[^>]*aria-disabled="true"[^>]*tabindex="-1"/,
  );
  assert.match(budgetPage, /\.button\[aria-disabled="true"\][^{]*\{[^}]*pointer-events:\s*none/);
  assert.match(budgetPage, /simulatorLink\.setAttribute\('tabindex', '-1'\)/);
  assert.match(budgetPage, /simulatorLink\.removeAttribute\('tabindex'\)/);
  assert.match(
    budgetPage,
    /simulatorLink\.href = `\/simulator#weeklyContribution=\$\{result\.safeContribution\.toFixed\(2\)\}`/,
  );
  assert.doesNotMatch(budgetPage, /\/simulator\?weeklyContribution=/);
  assert.doesNotMatch(budgetPage, /#weeklyContribution=[^`]*&/);
  assert.doesNotMatch(budgetPage, /#weeklyContribution=[^`]*weeklyIncome/);
  assert.doesNotMatch(budgetPage, /\/simulator[?#][^`]*weeklyIncome/);
});

test('budget examples are rendered from the tested monthly conversion', async () => {
  const budgetPage = await readFile(
    new URL('../src/pages/budget.astro', import.meta.url),
    'utf8',
  );

  assert.match(budgetPage, /monthlyToWeekly\(100\)/);
  assert.match(budgetPage, /monthlyToWeekly\(200\)/);
  assert.doesNotMatch(budgetPage, /monthly, divide (?:it )?by <b>4<\/b>/i);
});

test('monthly and weekly guidance uses the annualized conversion consistently', async () => {
  const pages = await Promise.all(
    ['budget.astro', 'getting-started.astro'].map((page) =>
      readFile(new URL(`../src/pages/${page}`, import.meta.url), 'utf8'),
    ),
  );
  const guidance = pages.join('\n');

  assert.doesNotMatch(guidance, /divide by <b>4<\/b>/i);
  assert.doesNotMatch(guidance, /<td>\$25(?:\/week)?<\/td><td>\$100\/month<\/td>/);
  assert.match(guidance, /<td>\$25(?:\/week)?<\/td><td>≈\$108\.33\/month<\/td>/);
});

test('weekly examples on both guides are derived from the shared conversion', async () => {
  const [budgetPage, gettingStartedPage] = await Promise.all(
    ['budget.astro', 'getting-started.astro'].map((page) =>
      readFile(new URL(`../src/pages/${page}`, import.meta.url), 'utf8'),
    ),
  );

  assert.equal((budgetPage.match(/\$\{weekly100\}/g) ?? []).length, 2);
  assert.equal((budgetPage.match(/\$\{weekly200\}/g) ?? []).length, 2);
  assert.match(gettingStartedPage, /monthlyToWeekly\(100\)/);
  assert.match(gettingStartedPage, /monthlyToWeekly\(200\)/);
  assert.equal((gettingStartedPage.match(/\$\{weekly100\}/g) ?? []).length, 2);
  assert.equal((gettingStartedPage.match(/\$\{weekly200\}/g) ?? []).length, 1);
  assert.doesNotMatch(
    `${budgetPage}\n${gettingStartedPage}`,
    /\$\$\{weekly(?:100|200)\}/,
  );
});
