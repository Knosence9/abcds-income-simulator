import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  classifyMarginRepairState,
  monthlyToWeekly,
  routePillarDistributions,
} from '../src/lib/financial-calculations.mjs';

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
    ['starting', 'startingNumber', 'Starting portfolio'],
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
  assert.match(simulatorPage, /addEventListener\('change', announceResults\)/);
  assert.match(simulatorPage, /Projection updated\. Final portfolio/);
});

test('simulator reinitializes its controls after ClientRouter navigation', async () => {
  const simulatorPage = await readFile(
    new URL('../src/pages/simulator.astro', import.meta.url),
    'utf8',
  );

  assert.match(simulatorPage, /document\.addEventListener\('astro:page-load', initializeSimulator\)/);
  assert.match(simulatorPage, /function initializeSimulator\(\)/);
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

  assert.match(simulatorPage, /if \(!simulatorShell \|\| !controlsToggle\) return;/);
});

test('menu lab reinitializes drag controls after ClientRouter navigation', async () => {
  const menuLabPage = await readFile(
    new URL('../src/pages/menu-lab.astro', import.meta.url),
    'utf8',
  );

  assert.match(menuLabPage, /document\.addEventListener\('astro:page-load', initializeMenuLab\)/);
  assert.match(menuLabPage, /function initializeMenuLab\(\)/);
});

test('menu lab initializer ignores ClientRouter visits to other routes', async () => {
  const menuLabPage = await readFile(
    new URL('../src/pages/menu-lab.astro', import.meta.url),
    'utf8',
  );

  assert.match(
    menuLabPage,
    /function initializeMenuLab\(\) \{[\s\S]*if \(!lab\) \{[\s\S]*return;/,
  );
});

test('converts a $100 monthly amount to approximately $23.08 per week', () => {
  const weeklyAmount = monthlyToWeekly(100);

  assert.equal(weeklyAmount, 100 * 12 / 52);
  assert.equal(weeklyAmount.toFixed(2), '23.08');
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
