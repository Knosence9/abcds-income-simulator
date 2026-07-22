import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  calculatePillarAllocationSnapshot,
  preparePillarSnapshotForProjection,
  calculateExpenseCrossoverPeriod,
  calculateProjectionContributionPeriod,
  calculateExpenseCoverage,
  calculateMarginAccount,
  calculateMarginInterest,
  calculateMarginRepairPeriod,
  calculatePillarDistributions,
  calculatePeriodicMarketReturn,
  calculateWeeklyBudget,
  classifyMarginRepairState,
  getProjectionScenario,
  monthlyToWeekly,
  parseWeeklyContribution,
  routeInvestmentContribution,
  routePillarDistributions,
  validatePillarAllocations,
} from '../src/lib/financial-calculations.mjs';

test('prepares a synthetic aggregate snapshot as exact projection starting values', () => {
  const balances = {
    anchor: 3_000,
    booster: 2_000,
    closedEnd: 3_000,
    dynamo: 2_000,
  };

  assert.deepEqual(preparePillarSnapshotForProjection(balances, { maxStartingValue: 250_000 }), {
    startingValue: 10_000,
    allocations: {
      anchor: 30,
      booster: 20,
      closedEnd: 30,
      dynamo: 20,
    },
  });
  assert.deepEqual(balances, {
    anchor: 3_000,
    booster: 2_000,
    closedEnd: 3_000,
    dynamo: 2_000,
  });
});

test('rejects empty and out-of-range aggregate totals for projection', () => {
  assert.throws(
    () => preparePillarSnapshotForProjection(
      { anchor: 0, booster: 0, closedEnd: 0, dynamo: 0 },
      { maxStartingValue: 250_000 },
    ),
    new RangeError('Enter at least one pillar balance before applying this snapshot.'),
  );
  assert.throws(
    () => preparePillarSnapshotForProjection(
      { anchor: 250_000, booster: 1, closedEnd: 0, dynamo: 0 },
      { maxStartingValue: 250_000 },
    ),
    new RangeError('Snapshot total must not exceed the projection maximum of 250000.'),
  );
});

test('calculates ABCD weights from synthetic aggregate pillar balances', () => {
  const balances = {
    anchor: 3_000,
    booster: 2_000,
    closedEnd: 3_000,
    dynamo: 2_000,
  };

  assert.deepEqual(calculatePillarAllocationSnapshot(balances), {
    totalValue: 10_000,
    weights: {
      anchor: 30,
      booster: 20,
      closedEnd: 30,
      dynamo: 20,
    },
  });
  assert.deepEqual(balances, {
    anchor: 3_000,
    booster: 2_000,
    closedEnd: 3_000,
    dynamo: 2_000,
  });
});

test('reports an empty allocation snapshot without misleading percentages', () => {
  assert.deepEqual(
    calculatePillarAllocationSnapshot({ anchor: 0, booster: 0, closedEnd: 0, dynamo: 0 }),
    { totalValue: 0, weights: null },
  );
});

test('rejects incomplete, negative, and non-finite pillar balances', () => {
  for (const balances of [
    { anchor: 3_000, booster: 2_000, closedEnd: 3_000 },
    { anchor: 3_000, booster: -1, closedEnd: 3_000, dynamo: 2_000 },
    { anchor: 3_000, booster: Number.NaN, closedEnd: 3_000, dynamo: 2_000 },
  ]) {
    assert.throws(
      () => calculatePillarAllocationSnapshot(balances),
      new RangeError('Pillar balances must contain four finite, non-negative values.'),
    );
  }
});

test('rejects pillar balances whose finite values overflow the total', () => {
  assert.throws(
    () => calculatePillarAllocationSnapshot({
      anchor: Number.MAX_VALUE,
      booster: Number.MAX_VALUE,
      closedEnd: 0,
      dynamo: 0,
    }),
    new RangeError('Pillar balance total must be finite.'),
  );
});

test('simulator exposes a local-only aggregate ABCD allocation snapshot', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  for (const [id, label] of [
    ['anchorBalance', 'Anchor balance'],
    ['boosterBalance', 'Booster balance'],
    ['closedEndBalance', 'Closed-end balance'],
    ['dynamoBalance', 'Dynamo balance'],
  ]) {
    assert.match(simulatorPage, new RegExp(`<label for="${id}">${label}<\\/label>`));
    assert.match(simulatorPage, new RegExp(`<input id="${id}" type="number"`));
  }
  assert.match(simulatorPage, /id="allocationSnapshotSummary"[^>]*aria-live="polite"/);
  assert.match(simulatorPage, /id="applyAllocationSnapshot"/);
  assert.match(simulatorPage, /This tool does not save or export these values\./);
  assert.match(simulatorPage, /attachAllocationSnapshot/);
  assert.match(simulatorPage, /preparePillarSnapshotForProjection/);
  assert.match(simulatorPage, /startingControls: \[\$\('starting'\), \$\('startingNumber'\)\]/);
  assert.match(simulatorPage, /<input id="startingNumber"[^>]*step="0\.01"/);
  assert.match(simulatorPage, /<input id="starting"[^>]*step="0\.01"/);
  assert.match(simulatorPage, /maxStartingValue: Number\(\$\('starting'\)\.max\)/);
  assert.match(simulatorPage, /calculatePillarAllocationSnapshot/);
});

test('reports the first period when spendable distributions cover expenses', () => {
  assert.deepEqual(
    calculateExpenseCrossoverPeriod([
      { spendableDistributions: 40, expenses: 70 },
      { spendableDistributions: 60, expenses: 70 },
      { spendableDistributions: 70, expenses: 70 },
      { spendableDistributions: 80, expenses: 70 },
    ]),
    { status: 'reached', period: 3 },
  );
});

test('reports when spendable distributions never cover expenses', () => {
  assert.deepEqual(
    calculateExpenseCrossoverPeriod([
      { spendableDistributions: 40, expenses: 70 },
      { spendableDistributions: 60, expenses: 70 },
    ]),
    { status: 'not-reached', period: null },
  );
});

test('reports a zero expense target as already covered', () => {
  assert.deepEqual(
    calculateExpenseCrossoverPeriod([
      { spendableDistributions: 0, expenses: 0 },
      { spendableDistributions: 10, expenses: 0 },
    ]),
    { status: 'already-covered', period: 0 },
  );
});

test('simulator displays expense-crossover timing from period cash flow', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /<span>Expense crossover<\/span><strong id="expenseCrossover">—<\/strong>/);
  assert.match(simulatorPage, /periodSpendableDistributions: routed\.spendableDistributions/);
  assert.match(simulatorPage, /periodExpenses/);
  assert.match(simulatorPage, /calculateExpenseCrossoverPeriod\(/);
  assert.match(simulatorPage, /`Month \$\{expenseCrossover\.period\}`/);
  assert.match(simulatorPage, /Already covered \(no expense target\)/);
  assert.match(simulatorPage, /Not reached/);
  assert.match(
    simulatorPage,
    /compares each month’s B\/D distributions with that month’s inflated expense target/,
  );
});

test('allows contributions when no margin debt exists', () => {
  assert.deepEqual(
    routeInvestmentContribution({ marketValue: 0, marginDebt: 0, contribution: 500 }),
    {
      investedContribution: 500,
      pausedContribution: 0,
    },
  );
});

test('invests only above the 70% margin-equity resume threshold', () => {
  assert.deepEqual(
    routeInvestmentContribution({ marketValue: 10_000, marginDebt: 4_001, contribution: 500 }),
    {
      investedContribution: 0,
      pausedContribution: 500,
    },
  );
  assert.deepEqual(
    routeInvestmentContribution({ marketValue: 10_000, marginDebt: 3_000, contribution: 500 }),
    {
      investedContribution: 0,
      pausedContribution: 500,
    },
  );
  assert.deepEqual(
    routeInvestmentContribution({ marketValue: 10_000, marginDebt: 2_999, contribution: 500 }),
    {
      investedContribution: 500,
      pausedContribution: 0,
    },
  );
});

test('uses spendable distributions to pay expenses before retaining cash', () => {
  assert.deepEqual(
    calculateExpenseCoverage({ spendableCash: 100, expenses: 70 }),
    {
      expensesPaid: 70,
      uncoveredExpenses: 0,
      remainingCash: 30,
    },
  );
});

test('reports expenses that spendable distributions cannot cover', () => {
  assert.deepEqual(
    calculateExpenseCoverage({ spendableCash: 40, expenses: 70 }),
    {
      expensesPaid: 40,
      uncoveredExpenses: 30,
      remainingCash: 0,
    },
  );
});

test('applies annual NAV price return over one monthly period', () => {
  const result = calculatePeriodicMarketReturn({
    marketValue: 10_000,
    annualReturn: 12,
    periodsPerYear: 12,
  });

  const expectedReturn = 10_000 * (Math.pow(1.12, 1 / 12) - 1);
  assert.equal(result.marketReturn, expectedReturn);
  assert.equal(result.endingMarketValue, 10_000 + expectedReturn);
  assert.deepEqual(Object.keys(result), ['marketReturn', 'endingMarketValue']);
});

test('calculates periodic and cumulative interest on constant margin debt', () => {
  assert.deepEqual(
    calculateMarginInterest({ marginDebt: 12_000, annualRate: 10, months: 12 }),
    {
      monthlyInterest: 100,
      cumulativeInterest: 1_200,
    },
  );
});

test('applies margin repair to principal after charging simple interest on beginning debt', () => {
  assert.deepEqual(
    calculateMarginRepairPeriod({
      marginDebt: 1_000,
      annualRate: 12,
      periodsPerYear: 12,
      principalPayment: 200,
    }),
    {
      interest: 10,
      principalPaid: 200,
      endingMarginDebt: 800,
    },
  );
});

test('bounds margin principal repair between zero and the remaining debt', () => {
  assert.deepEqual(
    calculateMarginRepairPeriod({
      marginDebt: 1_000,
      annualRate: 12,
      periodsPerYear: 12,
      principalPayment: 1_200,
    }),
    {
      interest: 10,
      principalPaid: 1_000,
      endingMarginDebt: 0,
    },
  );
  assert.deepEqual(
    calculateMarginRepairPeriod({
      marginDebt: 1_000,
      annualRate: 12,
      periodsPerYear: 12,
      principalPayment: -50,
    }),
    {
      interest: 10,
      principalPaid: 0,
      endingMarginDebt: 1_000,
    },
  );
});

test('rounds periodic and cumulative margin interest independently', () => {
  assert.deepEqual(
    calculateMarginInterest({ marginDebt: 100, annualRate: 10, months: 12 }),
    {
      monthlyInterest: 0.83,
      cumulativeInterest: 10,
    },
  );
});

test('provides conservative projection starting assumptions', () => {
  assert.deepEqual(getProjectionScenario('conservative'), {
    anchorAllocation: 45,
    anchorYield: 3,
    boosterAllocation: 15,
    boosterYield: 7,
    closedEndAllocation: 30,
    closedEndYield: 8,
    dynamoAllocation: 10,
    dynamoYield: 10,
    dividendGrowth: 1,
    inflation: 3,
    annualNavReturn: 0,
  });
});

test('provides base projection starting assumptions', () => {
  assert.deepEqual(getProjectionScenario('base'), {
    anchorAllocation: 30,
    anchorYield: 4,
    boosterAllocation: 20,
    boosterYield: 9,
    closedEndAllocation: 30,
    closedEndYield: 12,
    dynamoAllocation: 20,
    dynamoYield: 18,
    dividendGrowth: 2,
    inflation: 3,
    annualNavReturn: 3,
  });
});

test('provides distribution stress starting assumptions', () => {
  assert.deepEqual(getProjectionScenario('stress'), {
    anchorAllocation: 45,
    anchorYield: 2,
    boosterAllocation: 15,
    boosterYield: 5,
    closedEndAllocation: 30,
    closedEndYield: 7,
    dynamoAllocation: 10,
    dynamoYield: 8,
    dividendGrowth: -10,
    inflation: 7,
    annualNavReturn: -12,
  });
});

test('returns a defensive copy of projection assumptions', () => {
  const scenario = getProjectionScenario('base');
  scenario.anchorYield = 80;

  assert.equal(getProjectionScenario('base').anchorYield, 4);
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

test('simulator models annual NAV price return as an accessible preset assumption', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /calculatePeriodicMarketReturn/);
  assert.match(
    simulatorPage,
    /<label id="navReturnLabel" for="navReturnNumber">Annual NAV\/price return/,
  );
  assert.match(
    simulatorPage,
    /<input id="navReturn" type="range" aria-labelledby="navReturnLabel"/,
  );
  assert.match(simulatorPage, /annualNavReturn: \[\$\('navReturn'\), \$\('navReturnNumber'\)\]/);
  assert.match(simulatorPage, /navReturn: Number\(\$\('navReturn'\)\.value\)/);
  assert.match(
    simulatorPage,
    /calculatePeriodicMarketReturn\(\{ marketValue: portfolio, annualReturn: input\.navReturn, periodsPerYear: periods \}\)/,
  );
  assert.match(
    simulatorPage,
    /marketReturn\.endingMarketValue[\s\S]*routed\.reinvestedDistributions[\s\S]*contribution/,
  );
  assert.match(simulatorPage, /smooth user-selected estimate, not a forecast/i);
  assert.match(simulatorPage, /stress preset includes a synthetic NAV\/price decline/i);
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
  assert.match(simulatorPage, /weekly margin repair/i);
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
  assert.match(
    simulatorPage,
    /<label id="weeklyMarginRepairLabel" for="weeklyMarginRepairNumber">Weekly margin repair/,
  );
  assert.match(
    simulatorPage,
    /<input id="weeklyMarginRepair" type="range" aria-labelledby="weeklyMarginRepairLabel"/,
  );
  assert.match(simulatorPage, /id="cumulativePrincipalPaid"/);
  assert.match(simulatorPage, /smooth principal-only planning assumption/i);
});

test('simulator reduces principal and accumulates unpaid interest from beginning debt', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /calculateMarginRepairPeriod/);
  assert.match(
    simulatorPage,
    /<label id="marginAprLabel" for="marginAprNumber">Margin APR/,
  );
  assert.match(
    simulatorPage,
    /<input id="marginApr" type="range" aria-labelledby="marginAprLabel"/,
  );
  assert.match(simulatorPage, /id="cumulativeMarginInterest"/);
  assert.match(simulatorPage, /principalPayment: marginRepairPerPeriod/);
  assert.match(simulatorPage, /marginDebt = repairPeriod\.endingMarginDebt/);
  assert.match(simulatorPage, /cumulativePrincipalPaid \+= repairPeriod\.principalPaid/);
  assert.match(simulatorPage, /cumulativeMarginInterest \+= repairPeriod\.interest/);
  assert.match(simulatorPage, /marginDebt: last\.marginDebt/);
  assert.match(simulatorPage, /interest is not capitalized or paid/i);
  assert.match(simulatorPage, /real brokerage timing may differ/i);
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

test('reserves weekly margin repair before recommending a simulator contribution', () => {
  assert.deepEqual(
    calculateWeeklyBudget({
      income: 1_000,
      essentials: 500,
      flexible: 150,
      sinkingFunds: 100,
      breathingRoom: 50,
      marginRepair: 100,
    }),
    {
      marginRepair: 100,
      totalOutflow: 900,
      surplusOrDeficit: 100,
      safeContribution: 100,
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
      marginRepair: 0,
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
      marginRepair: 0,
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

test('calculates periodic pillar distributions from explicit allocations and yields', () => {
  const result = calculatePillarDistributions({
    marketValue: 10_000,
    periodsPerYear: 12,
    pillars: {
      anchor: { allocation: 40, annualYield: 3 },
      booster: { allocation: 20, annualYield: 9 },
      closedEnd: { allocation: 30, annualYield: 12 },
      dynamo: { allocation: 10, annualYield: 18 },
    },
  });

  assert.deepEqual(result, {
    anchor: 10,
    booster: 15,
    closedEnd: 30,
    dynamo: 15,
  });
});

test('requires the four pillar allocations to total 100%', () => {
  assert.equal(validatePillarAllocations({ anchor: 40, booster: 20, closedEnd: 30, dynamo: 10 }), true);
  assert.equal(validatePillarAllocations({ anchor: 40, booster: 20, closedEnd: 20, dynamo: 10 }), false);
  assert.equal(validatePillarAllocations({ anchor: 40, booster: 20, closedEnd: Number.NaN, dynamo: 40 }), false);
});

test('simulator accumulates spendable cash expense coverage in separate ledgers', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /calculateExpenseCoverage/);
  assert.match(simulatorPage, /id="expensesPaid"/);
  assert.match(simulatorPage, /id="uncoveredExpenses"/);
  assert.match(simulatorPage, /id="remainingCash"/);
  assert.match(
    simulatorPage,
    /calculateExpenseCoverage\(\{ spendableCash: remainingCash \+ routed\.spendableDistributions, expenses: periodExpenses \}\)/,
  );
  assert.match(simulatorPage, /expensesPaid \+= expenseCoverage\.expensesPaid/);
  assert.match(simulatorPage, /uncoveredExpenses \+= expenseCoverage\.uncoveredExpenses/);
  assert.match(simulatorPage, /remainingCash = expenseCoverage\.remainingCash/);
  assert.match(simulatorPage, /interest is not capitalized or paid/i);
});

test('simulator keeps repair-band contributions outside projected market value', async () => {
  assert.deepEqual(
    calculateProjectionContributionPeriod({
      beginningMarketValue: 10_000,
      marginDebt: 3_000,
      contribution: 500,
      marketValueAfterReturn: 10_100,
      reinvestedDistributions: 25,
      cumulativePausedContributions: 100,
    }),
    {
      endingMarketValue: 10_125,
      cumulativePausedContributions: 600,
    },
  );

  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /calculateProjectionContributionPeriod/);
  assert.match(simulatorPage, /id="pausedContributions"/);
  assert.match(simulatorPage, /held outside this projection/i);
  assert.match(simulatorPage, /not assumed to pay margin debt/i);
});

test('projection contribution period invests above 70% without changing paused total', () => {
  assert.deepEqual(
    calculateProjectionContributionPeriod({
      beginningMarketValue: 10_000,
      marginDebt: 2_000,
      contribution: 500,
      marketValueAfterReturn: 10_100,
      reinvestedDistributions: 25,
      cumulativePausedContributions: 100,
    }),
    {
      endingMarketValue: 10_625,
      cumulativePausedContributions: 100,
    },
  );
});

test('simulator exposes explicit pillar assumptions and uses their distribution ledgers', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /calculatePillarDistributions/);
  assert.match(simulatorPage, /validatePillarAllocations/);
  assert.match(simulatorPage, /id="grossDistributions"/);
  assert.match(simulatorPage, /id="reinvestedDistributions"/);
  assert.match(simulatorPage, /id="spendableDistributions"/);
  for (const pillar of ['anchor', 'booster', 'closedEnd', 'dynamo']) {
    assert.match(simulatorPage, new RegExp(`id="${pillar}AllocationNumber"`));
    assert.match(simulatorPage, new RegExp(`id="${pillar}YieldNumber"`));
  }
  assert.match(simulatorPage, /Pillar allocations must total 100%/);
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
    ['marginApr', 'marginAprNumber', 'Margin APR'],
    ['paycheck', 'paycheckNumber', 'Weekly paycheck contribution'],
    ['anchorAllocation', 'anchorAllocationNumber', 'Anchor allocation %'],
    ['anchorYield', 'anchorYieldNumber', 'Anchor annual yield %'],
    ['boosterAllocation', 'boosterAllocationNumber', 'Booster allocation %'],
    ['boosterYield', 'boosterYieldNumber', 'Booster annual yield %'],
    ['closedEndAllocation', 'closedEndAllocationNumber', 'Closed-end allocation %'],
    ['closedEndYield', 'closedEndYieldNumber', 'Closed-end annual yield %'],
    ['dynamoAllocation', 'dynamoAllocationNumber', 'Dynamo allocation %'],
    ['dynamoYield', 'dynamoYieldNumber', 'Dynamo annual yield %'],
    ['growth', 'growthNumber', 'Dividend growth %'],
    ['navReturn', 'navReturnNumber', 'Annual NAV/price return %'],
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
  assert.match(simulatorPage, /paycheckNumber\.value = String\(appliedContribution\)/);
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
    /function announceResultsIfValid\(\)[\s\S]*hasInvalidInputs\(\)[\s\S]*resultsStatus\.textContent = invalidInputMessage\(\);[\s\S]*return;[\s\S]*announceResults\(\)/,
  );
  assert.match(
    simulatorPage,
    /number\.removeAttribute\('aria-invalid'\);[\s\S]*if \(hasInvalidInputs\(\)\)[\s\S]*invalidInputMessage\(\)[\s\S]*return;[\s\S]*resultsStatus\.textContent = '';[\s\S]*render\(\)/,
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
    /number\.setAttribute\('aria-invalid', 'true'\);[\s\S]*invalidateResults\(\);[\s\S]*resultsStatus\.textContent = invalidInputMessage\(\)/,
  );
  assert.match(
    simulatorPage,
    /function render\(\)[\s\S]*chart\.setAttribute\('aria-label', 'Line plot of projected dividend income'\)/,
  );
});

test('invalid allocation numbers replace the stale allocation-total status', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    simulatorPage,
    /number\.setAttribute\('aria-invalid', 'true'\);[\s\S]*invalidateResults\(\);[\s\S]*if \(a\.endsWith\('Allocation'\)\)[\s\S]*allocationStatus[\s\S]*Enter a value within the allowed range\./,
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
    /function initializeSimulator\(\) \{[\s\S]*document\.getElementById\('simulatorShell'\)[\s\S]*if \(!simulatorShell \|\| !controlsToggle\) \{[\s\S]*return;/,
  );
});

test('simulator keyboard cleanup ignores routes without simulator controls', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    simulatorPage,
    /function closeSimulatorControls[\s\S]*document\.getElementById\('simulatorShell'\)[\s\S]*if \(!simulatorShell \|\| !controlsToggle\) return;/,
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

test('budget planner reserves a weekly margin repair obligation before simulator contributions', async () => {
  const budgetPage = await readFile(
    new URL('../src/pages/budget.astro', import.meta.url),
    'utf8',
  );

  assert.match(budgetPage, /<label for="weeklyMarginRepair">Weekly margin repair<\/label>/);
  assert.match(budgetPage, /<input id="weeklyMarginRepair"[^>]*type="number"[^>]*min="0"/);
  assert.match(budgetPage, /marginRepair: weeklyValue\('weeklyMarginRepair'\)/);
  assert.match(budgetPage, /id="weeklyMarginRepairReserved"/);
  assert.match(
    budgetPage,
    /marginRepairReserved\.textContent = weeklyCurrency\.format\(result\.marginRepair\)/,
  );
});

test('budget planner links its calculated safe contribution and margin repair to the simulator', async () => {
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
    /simulatorLink\.href = `\/simulator#weeklyContribution=\$\{result\.safeContribution\.toFixed\(2\)\}&weeklyMarginRepair=\$\{result\.marginRepair\.toFixed\(2\)\}`/,
  );
  assert.doesNotMatch(budgetPage, /\/simulator\?weeklyContribution=/);
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
