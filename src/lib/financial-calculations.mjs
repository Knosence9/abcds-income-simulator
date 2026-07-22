const projectionScenarios = {
  conservative: {
    dividendYield: 8,
    acDistributionShare: 75,
    dividendGrowth: 1,
    inflation: 3,
  },
  base: {
    dividendYield: 12,
    acDistributionShare: 50,
    dividendGrowth: 2,
    inflation: 3,
  },
  stress: {
    dividendYield: 8,
    acDistributionShare: 25,
    dividendGrowth: -10,
    inflation: 7,
  },
};

export function getProjectionScenario(name) {
  if (!Object.hasOwn(projectionScenarios, name)) {
    throw new RangeError(`Unknown projection scenario: ${name}`);
  }
  return { ...projectionScenarios[name] };
}

export function calculateMarginAccount({ marketValue, marginDebt }) {
  const netEquity = marketValue - marginDebt;

  return {
    grossMarketValue: marketValue,
    marginDebt,
    netEquity,
    marginEquityPercent: marketValue === 0 ? 0 : (netEquity / marketValue) * 100,
  };
}

export function calculateMarginInterest({ marginDebt, annualRate, months }) {
  const monthlyInterestCents = Math.round(marginDebt * (annualRate / 100) / 12 * 100);
  const cumulativeInterestCents = Math.round(
    marginDebt * (annualRate / 100) * (months / 12) * 100,
  );

  return {
    monthlyInterest: monthlyInterestCents / 100,
    cumulativeInterest: cumulativeInterestCents / 100,
  };
}

export function monthlyToWeekly(monthlyAmount) {
  return monthlyAmount * 12 / 52;
}

export function parseWeeklyContribution(value, { fallback, max }) {
  if (value === null || String(value).trim() === '') return fallback;
  const contribution = Number(value);
  if (!Number.isFinite(contribution)) return fallback;

  const boundedContribution = Math.min(max, Math.max(0, contribution));
  return Math.round((boundedContribution + Number.EPSILON) * 100) / 100;
}

export function calculateWeeklyBudget({
  income,
  essentials,
  flexible,
  sinkingFunds,
  breathingRoom,
}) {
  const toCents = (amount) => Math.round(amount * 100);
  const totalOutflowCents = [essentials, flexible, sinkingFunds, breathingRoom]
    .map(toCents)
    .reduce((total, amount) => total + amount, 0);
  const surplusOrDeficitCents = toCents(income) - totalOutflowCents;

  return {
    totalOutflow: totalOutflowCents / 100,
    surplusOrDeficit: surplusOrDeficitCents / 100,
    safeContribution: Math.max(0, surplusOrDeficitCents) / 100,
  };
}

export function classifyMarginRepairState(marginEquityPercent) {
  if (marginEquityPercent < 60) return 'repair-immediately';
  if (marginEquityPercent <= 70) return 'repair-band';
  return 'eligible-to-resume';
}

export function routePillarDistributions({
  marketValue,
  anchor,
  booster,
  closedEnd,
  dynamo,
}) {
  const reinvestedDistributions = anchor + closedEnd;
  const spendableDistributions = booster + dynamo;

  return {
    grossDistributions: reinvestedDistributions + spendableDistributions,
    reinvestedDistributions,
    spendableDistributions,
    endingMarketValue: marketValue + reinvestedDistributions,
  };
}
