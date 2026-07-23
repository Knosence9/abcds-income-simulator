const ASSUMPTION_FIELDS = [
  ['projectionYears', 'projection_years', 'years'],
  ['startingGrossMarketValue', 'starting_gross_market_value', 'USD'],
  ['startingMarginDebt', 'starting_margin_debt', 'USD'],
  ['weeklyContribution', 'weekly_contribution', 'USD_per_week'],
  ['weeklyMarginRepair', 'weekly_margin_repair', 'USD_per_week'],
  ['marginAprPercent', 'margin_apr', 'percent'],
  ['anchorAllocationPercent', 'anchor_allocation', 'percent'],
  ['anchorYieldPercent', 'anchor_yield', 'percent'],
  ['boosterAllocationPercent', 'booster_allocation', 'percent'],
  ['boosterYieldPercent', 'booster_yield', 'percent'],
  ['closedEndAllocationPercent', 'closed_end_allocation', 'percent'],
  ['closedEndYieldPercent', 'closed_end_yield', 'percent'],
  ['dynamoAllocationPercent', 'dynamo_allocation', 'percent'],
  ['dynamoYieldPercent', 'dynamo_yield', 'percent'],
  ['marketShockPercent', 'market_shock', 'percent'],
  ['distributionCutPercent', 'distribution_cut', 'percent'],
  ['dividendGrowthPercent', 'dividend_growth', 'percent'],
  ['navReturnPercent', 'nav_price_return', 'percent'],
  ['inflationPercent', 'inflation', 'percent'],
  ['monthlyExpenses', 'monthly_expenses', 'USD_per_month'],
];

const RESULT_FIELDS = [
  ['endingGrossMarketValue', 'ending_gross_market_value', 'USD'],
  ['endingMarginDebt', 'ending_margin_debt', 'USD'],
  ['endingNetEquity', 'ending_net_equity', 'USD'],
  ['marginEquityPercent', 'margin_equity', 'percent'],
  ['grossDistributions', 'gross_distributions', 'USD'],
  ['reinvestedDistributions', 'reinvested_distributions', 'USD'],
  ['spendableDistributions', 'spendable_distributions', 'USD'],
  ['expensesPaid', 'expenses_paid', 'USD'],
  ['uncoveredExpenses', 'uncovered_expenses', 'USD'],
  ['remainingSpendableCash', 'remaining_spendable_cash', 'USD'],
  ['cumulativePrincipalPaid', 'cumulative_principal_paid', 'USD'],
  ['pausedContributions', 'paused_contributions', 'USD'],
  ['cumulativeMarginInterest', 'cumulative_margin_interest', 'USD'],
  ['cumulativeMarketShock', 'cumulative_market_shock', 'USD'],
];

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeProjectionSummaryCsv(summary) {
  if (!summary?.assumptions || !summary?.results) return null;
  const values = [
    ...ASSUMPTION_FIELDS.map(([property]) => summary.assumptions[property]),
    ...RESULT_FIELDS.map(([property]) => summary.results[property]),
  ];
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }

  const rows = [
    ['section', 'metric', 'value', 'unit'],
    ['notice', 'disclaimer', 'Educational planning model, not financial advice.', 'text'],
  ];

  for (const [property, metric, unit] of ASSUMPTION_FIELDS) {
    rows.push(['assumption', metric, summary.assumptions[property], unit]);
  }
  for (const [property, metric, unit] of RESULT_FIELDS) {
    rows.push(['result', metric, summary.results[property], unit]);
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadProjectionSummaryCsv(summary, {
  BlobClass = globalThis.Blob,
  createObjectUrl = globalThis.URL.createObjectURL.bind(globalThis.URL),
  revokeObjectUrl = globalThis.URL.revokeObjectURL.bind(globalThis.URL),
  createLink = () => globalThis.document.createElement('a'),
} = {}) {
  const serialized = serializeProjectionSummaryCsv(summary);
  if (!serialized) return false;

  const downloadUrl = createObjectUrl(new BlobClass(
    [serialized],
    { type: 'text/csv;charset=utf-8' },
  ));
  try {
    const link = createLink();
    link.href = downloadUrl;
    link.download = 'abcds-projection-summary.csv';
    link.click();
  } finally {
    revokeObjectUrl(downloadUrl);
  }
  return true;
}
