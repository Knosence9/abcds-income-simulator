import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const simulatorPage = await readFile(
  new URL('../src/pages/simulator.astro', import.meta.url),
  'utf8',
);
const financialCalculations = await readFile(
  new URL('../src/lib/financial-calculations.mjs', import.meta.url),
  'utf8',
);

test('places a labeled projection methodology below the simulator outputs', () => {
  assert.match(
    simulatorPage,
    /<section[^>]*aria-labelledby="projection-methodology-title"[^>]*>/,
  );
  const chartPosition = simulatorPage.indexOf('<svg id="chart"');
  const legendPosition = simulatorPage.indexOf('<div class="legend">');
  assert.ok(chartPosition >= 0);
  assert.ok(legendPosition > chartPosition);
  assert.match(
    simulatorPage,
    /<div class="legend">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<section class="methodology"/,
  );
  assert.match(
    simulatorPage,
    /<h2 id="projection-methodology-title">Projection methodology and limitations<\/h2>/,
  );
  assert.match(
    simulatorPage,
    /beginning gross market value[\s\S]*A\/C distributions are reinvested[\s\S]*eligible external contribution[\s\S]*B\/D cash pays[\s\S]*margin principal repair[\s\S]*interest is estimated separately/i,
  );
  assert.match(
    simulatorPage,
    /returns, yields, dividend growth, inflation, and distribution behavior are smooth user-selected assumptions, not forecasts/i,
  );
  assert.match(
    simulatorPage,
    /does not model taxes, fund or trading fees, slippage, brokerage-specific margin rules, or distribution timing and cuts beyond the assumptions you select/i,
  );
  assert.match(simulatorPage, /Educational planning tool—not financial advice/i);
});

test('methodology remains tied to the implemented monthly sequence and responsive layout', () => {
  const simulation = simulatorPage.slice(simulatorPage.indexOf('function simulate()'));
  const sequence = [
    'calculatePillarDistributions({',
    'calculatePeriodicMarketReturn({',
    'calculateProjectionContributionPeriod({',
    'calculateExpenseCoverage({',
    'calculateMarginRepairPeriod({',
  ].map((marker) => simulation.indexOf(marker));

  assert.ok(sequence.every((index) => index >= 0));
  assert.deepEqual(sequence, [...sequence].sort((left, right) => left - right));
  assert.match(
    simulation,
    /beginningMarketValue: portfolio[\s\S]*reinvestedDistributions: routed\.reinvestedDistributions/,
  );
  assert.match(simulation, /cumulativeMarginInterest \+= repairPeriod\.interest/);
  assert.match(
    financialCalculations,
    /endingMarketValue: marketValueAfterReturn[\s\S]*\+ reinvestedDistributions[\s\S]*\+ contributionRoute\.investedContribution/,
  );
  assert.match(
    financialCalculations,
    /const interestCents = Math\.round\(marginDebt \* \(annualRate \/ 100\) \/ periodsPerYear \* 100\)/,
  );
  assert.match(
    simulatorPage,
    /\.methodology-grid \{ display:grid; grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    simulatorPage,
    /@media \(max-width: 900px\) \{ \.stats, \.methodology-grid \{ grid-template-columns:1fr; \}/,
  );
});
