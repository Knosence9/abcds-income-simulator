import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  downloadProjectionSummaryCsv,
  serializeProjectionSummaryCsv,
} from '../src/lib/projection-summary-export.mjs';

const syntheticSummary = {
  assumptions: {
    projectionYears: 10,
    startingGrossMarketValue: 10000,
    startingMarginDebt: 2000,
    weeklyContribution: 100,
    weeklyMarginRepair: 25,
    marginAprPercent: 8.5,
    anchorAllocationPercent: 30,
    anchorYieldPercent: 4,
    boosterAllocationPercent: 20,
    boosterYieldPercent: 9,
    closedEndAllocationPercent: 30,
    closedEndYieldPercent: 12,
    dynamoAllocationPercent: 20,
    dynamoYieldPercent: 18,
    marketShockPercent: 20,
    distributionCutPercent: 25,
    dividendGrowthPercent: 4,
    navReturnPercent: 3,
    inflationPercent: 2.5,
    monthlyExpenses: 500,
  },
  results: {
    endingGrossMarketValue: 25000,
    endingMarginDebt: 0,
    endingNetEquity: 25000,
    marginEquityPercent: 100,
    grossDistributions: 12000,
    reinvestedDistributions: 7000,
    spendableDistributions: 5000,
    expensesPaid: 4500,
    uncoveredExpenses: 1500,
    remainingSpendableCash: 500,
    cumulativePrincipalPaid: 2000,
    pausedContributions: 300,
    cumulativeMarginInterest: 400,
    cumulativeMarketShock: 2000,
  },
};

test('serializes a deterministic sanitized projection summary CSV', () => {
  assert.equal(
    serializeProjectionSummaryCsv(syntheticSummary),
    [
      'section,metric,value,unit',
      'notice,disclaimer,"Educational planning model, not financial advice.",text',
      'assumption,projection_years,10,years',
      'assumption,starting_gross_market_value,10000,USD',
      'assumption,starting_margin_debt,2000,USD',
      'assumption,weekly_contribution,100,USD_per_week',
      'assumption,weekly_margin_repair,25,USD_per_week',
      'assumption,margin_apr,8.5,percent',
      'assumption,anchor_allocation,30,percent',
      'assumption,anchor_yield,4,percent',
      'assumption,booster_allocation,20,percent',
      'assumption,booster_yield,9,percent',
      'assumption,closed_end_allocation,30,percent',
      'assumption,closed_end_yield,12,percent',
      'assumption,dynamo_allocation,20,percent',
      'assumption,dynamo_yield,18,percent',
      'assumption,market_shock,20,percent',
      'assumption,distribution_cut,25,percent',
      'assumption,dividend_growth,4,percent',
      'assumption,nav_price_return,3,percent',
      'assumption,inflation,2.5,percent',
      'assumption,monthly_expenses,500,USD_per_month',
      'result,ending_gross_market_value,25000,USD',
      'result,ending_margin_debt,0,USD',
      'result,ending_net_equity,25000,USD',
      'result,margin_equity,100,percent',
      'result,gross_distributions,12000,USD',
      'result,reinvested_distributions,7000,USD',
      'result,spendable_distributions,5000,USD',
      'result,expenses_paid,4500,USD',
      'result,uncovered_expenses,1500,USD',
      'result,remaining_spendable_cash,500,USD',
      'result,cumulative_principal_paid,2000,USD',
      'result,paused_contributions,300,USD',
      'result,cumulative_margin_interest,400,USD',
      'result,cumulative_market_shock,2000,USD',
    ].join('\r\n'),
  );
});

test('rejects incomplete or non-finite projection summaries', () => {
  assert.equal(serializeProjectionSummaryCsv(), null);
  assert.equal(
    serializeProjectionSummaryCsv({
      ...syntheticSummary,
      results: { ...syntheticSummary.results, endingNetEquity: Number.NaN },
    }),
    null,
  );
});

test('downloads a validated projection CSV through injected browser boundaries', () => {
  const blobs = [];
  const clicks = [];
  const revoked = [];
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
      blobs.push(this);
    }
  }
  const link = {
    href: '',
    download: '',
    click() { clicks.push({ href: this.href, download: this.download }); },
  };

  assert.equal(downloadProjectionSummaryCsv(syntheticSummary, {
    BlobClass: FakeBlob,
    createObjectUrl: (blob) => {
      assert.equal(blob, blobs[0]);
      return 'blob:synthetic-projection-csv';
    },
    revokeObjectUrl: (url) => revoked.push(url),
    createLink: () => link,
  }), true);
  assert.match(blobs[0].parts[0], /result,ending_net_equity,25000,USD/);
  assert.deepEqual(blobs[0].options, { type: 'text/csv;charset=utf-8' });
  assert.deepEqual(clicks, [{
    href: 'blob:synthetic-projection-csv',
    download: 'abcds-projection-summary.csv',
  }]);
  assert.deepEqual(revoked, ['blob:synthetic-projection-csv']);
  assert.equal(downloadProjectionSummaryCsv(), false);
});

test('simulator exports only the current valid projection summary in the browser', async () => {
  const page = await readFile(new URL('../src/pages/simulator.astro', import.meta.url), 'utf8');

  assert.match(page, /id="exportProjectionCsv"[^>]*type="button"/);
  assert.match(page, /id="projectionExportStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(page, /serializeProjectionSummaryCsv/);
  assert.match(page, /downloadProjectionSummaryCsv\(currentProjectionSummary\)/);
  assert.match(page, /marketShockPercent: input\.marketShock/);
  assert.match(page, /cumulativeMarketShock: last\.cumulativeMarketShock/);
  assert.match(page, /Projection summary exported as CSV\./);
  assert.match(page, /No holdings, transactions, or account identifiers/);
});

test('simulator clears stale projection export status when results change', async () => {
  const page = await readFile(new URL('../src/pages/simulator.astro', import.meta.url), 'utf8');
  const invalidation = page.slice(
    page.indexOf('function invalidateResults()'),
    page.indexOf('function announceResultsIfValid()'),
  );
  const summaryStart = page.indexOf('currentProjectionSummary = {');
  const renderedSummary = page.slice(
    summaryStart,
    page.indexOf("$('grossMarketValue').textContent", summaryStart),
  );

  assert.match(invalidation, /\$\('projectionExportStatus'\)\.textContent = '';/);
  assert.match(renderedSummary, /\$\('projectionExportStatus'\)\.textContent = '';/);
});
