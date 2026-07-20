import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  monthlyToWeekly,
  routePillarDistributions,
} from '../src/lib/financial-calculations.mjs';

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
    /id="acShare"[^>]*aria-label="A\/C distribution share \(DRIP on\)"/,
  );
  assert.match(simulatorPage, />Reinvested A\/C distributions</);
  assert.match(simulatorPage, />Spendable B\/D distributions</);
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
