import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { monthlyToWeekly } from '../src/lib/financial-calculations.mjs';

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
