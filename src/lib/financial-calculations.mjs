const projectionScenarios = {
  conservative: {
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
  },
  base: {
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
  },
  stress: {
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
  },
};

export function getProjectionScenario(name) {
  if (!Object.hasOwn(projectionScenarios, name)) {
    throw new RangeError(`Unknown projection scenario: ${name}`);
  }
  return { ...projectionScenarios[name] };
}

export function calculatePeriodicMarketReturn({ marketValue, annualReturn, periodsPerYear }) {
  const periodicRate = Math.pow(1 + annualReturn / 100, 1 / periodsPerYear) - 1;
  const marketReturn = marketValue * periodicRate;

  return {
    marketReturn,
    endingMarketValue: marketValue + marketReturn,
  };
}

export function calculateExpenseCoverage({ spendableCash, expenses }) {
  const expensesPaid = Math.min(spendableCash, expenses);

  return {
    expensesPaid,
    uncoveredExpenses: expenses - expensesPaid,
    remainingCash: spendableCash - expensesPaid,
  };
}

export function calculateExpenseCrossoverPeriod(periods) {
  if (periods.length > 0 && periods.every(({ expenses }) => expenses === 0)) {
    return { status: 'already-covered', period: 0 };
  }

  const crossoverIndex = periods.findIndex(
    ({ spendableDistributions, expenses }) => spendableDistributions >= expenses,
  );

  return crossoverIndex === -1
    ? { status: 'not-reached', period: null }
    : { status: 'reached', period: crossoverIndex + 1 };
}

export function calculateMarginResumeTarget({ marketValue, marginDebt }) {
  if (
    !Number.isFinite(marketValue)
    || !Number.isFinite(marginDebt)
    || marketValue < 0
    || marginDebt < 0
  ) {
    throw new RangeError('Market value and margin debt must be finite and non-negative.');
  }
  const marketValueCents = Math.round(marketValue * 100);
  const marginDebtCents = Math.round(marginDebt * 100);
  if (!Number.isSafeInteger(marketValueCents) || !Number.isSafeInteger(marginDebtCents)) {
    throw new RangeError('Market value and margin debt must be safe cent-denominated values.');
  }
  if (marginDebtCents > marketValueCents) {
    throw new RangeError('Margin debt must not exceed gross market value.');
  }
  if (marketValueCents === 0) {
    return { maximumDebtToResume: null, principalToResume: null };
  }
  const marketValueWholeTens = Math.floor(marketValueCents / 10);
  const marketValueRemainder = marketValueCents % 10;
  const maximumDebtToResumeCents = marketValueWholeTens * 3
    + Math.ceil((marketValueRemainder * 3) / 10)
    - 1;

  return {
    maximumDebtToResume: maximumDebtToResumeCents / 100,
    principalToResume: Math.max(0, marginDebtCents - maximumDebtToResumeCents) / 100,
  };
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

export function calculateMarginRepairPeriod({
  marginDebt,
  annualRate,
  periodsPerYear,
  principalPayment,
}) {
  const debtCents = Math.round(marginDebt * 100);
  const interestCents = Math.round(marginDebt * (annualRate / 100) / periodsPerYear * 100);
  const principalPaidCents = Math.min(
    debtCents,
    Math.max(0, Math.round(principalPayment * 100)),
  );

  return {
    interest: interestCents / 100,
    principalPaid: principalPaidCents / 100,
    endingMarginDebt: (debtCents - principalPaidCents) / 100,
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
  marginRepair = 0,
}) {
  const toCents = (amount) => Math.round(amount * 100);
  const totalOutflowCents = [essentials, flexible, sinkingFunds, breathingRoom, marginRepair]
    .map(toCents)
    .reduce((total, amount) => total + amount, 0);
  const surplusOrDeficitCents = toCents(income) - totalOutflowCents;

  return {
    marginRepair,
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

export function routeInvestmentContribution({ marketValue, marginDebt, contribution }) {
  const { marginEquityPercent } = calculateMarginAccount({ marketValue, marginDebt });
  const buyingIsEligible = marginDebt === 0
    || classifyMarginRepairState(marginEquityPercent) === 'eligible-to-resume';

  return {
    investedContribution: buyingIsEligible ? contribution : 0,
    pausedContribution: buyingIsEligible ? 0 : contribution,
  };
}

export function calculateProjectionContributionPeriod({
  beginningMarketValue,
  marginDebt,
  contribution,
  marketValueAfterReturn,
  reinvestedDistributions,
  cumulativePausedContributions,
}) {
  const contributionRoute = routeInvestmentContribution({
    marketValue: beginningMarketValue,
    marginDebt,
    contribution,
  });

  return {
    endingMarketValue: marketValueAfterReturn
      + reinvestedDistributions
      + contributionRoute.investedContribution,
    cumulativePausedContributions: cumulativePausedContributions
      + contributionRoute.pausedContribution,
  };
}

export function calculatePillarMarginSnapshot(balances, marginDebt) {
  const allocationSnapshot = calculatePillarAllocationSnapshot(balances);
  const normalizedMarginDebt = Number.isFinite(marginDebt)
    ? Math.round((marginDebt + Number.EPSILON) * 100) / 100
    : marginDebt;
  if (
    !Number.isFinite(marginDebt)
    || marginDebt < 0
    || normalizedMarginDebt > allocationSnapshot.totalValue
  ) {
    throw new RangeError(
      'Margin debt must be finite, non-negative, and no greater than gross market value.',
    );
  }
  if (!allocationSnapshot.weights) {
    return {
      ...allocationSnapshot,
      marginDebt: normalizedMarginDebt,
      netEquity: 0,
      marginEquityPercent: null,
      marginState: null,
      maximumDebtToResume: null,
      principalToResume: null,
    };
  }
  const marginAccount = calculateMarginAccount({
    marketValue: allocationSnapshot.totalValue,
    marginDebt: normalizedMarginDebt,
  });
  const resumeTarget = calculateMarginResumeTarget({
    marketValue: allocationSnapshot.totalValue,
    marginDebt: normalizedMarginDebt,
  });

  return {
    ...allocationSnapshot,
    marginDebt: normalizedMarginDebt,
    netEquity: marginAccount.netEquity,
    marginEquityPercent: marginAccount.marginEquityPercent,
    marginState: classifyMarginRepairState(marginAccount.marginEquityPercent),
    ...resumeTarget,
  };
}

export function calculatePillarAllocationSnapshot(balances) {
  const pillarNames = ['anchor', 'booster', 'closedEnd', 'dynamo'];
  const balanceKeys = Object.keys(balances);
  const values = pillarNames.map((name) => balances[name]);
  if (
    balanceKeys.length !== pillarNames.length
    || !pillarNames.every((name) => Object.hasOwn(balances, name))
    || !values.every((value) => Number.isFinite(value) && value >= 0)
  ) {
    throw new RangeError('Pillar balances must contain four finite, non-negative values.');
  }
  const rawTotalValue = values.reduce((total, balance) => total + balance, 0);
  if (!Number.isFinite(rawTotalValue)) {
    throw new RangeError('Pillar balance total must be finite.');
  }
  const totalValue = Math.round((rawTotalValue + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(totalValue)) {
    throw new RangeError('Pillar balance total must be finite.');
  }
  if (totalValue === 0) return { totalValue, weights: null };

  return {
    totalValue,
    weights: Object.fromEntries(
      pillarNames.map((name) => [name, (balances[name] / totalValue) * 100]),
    ),
  };
}

export function preparePillarMarginSnapshotForProjection(
  balances,
  marginDebt,
  { maxStartingValue },
) {
  const marginSnapshot = calculatePillarMarginSnapshot(balances, marginDebt);
  const projectionSnapshot = preparePillarSnapshotForProjection(
    balances,
    { maxStartingValue },
  );

  return {
    ...projectionSnapshot,
    startingMarginDebt: marginSnapshot.marginDebt,
  };
}

export function preparePillarSnapshotForProjection(balances, { maxStartingValue }) {
  if (
    maxStartingValue !== Number.POSITIVE_INFINITY
    && (!Number.isFinite(maxStartingValue) || maxStartingValue < 0)
  ) {
    throw new RangeError(
      'Projection maximum must be non-negative and finite or positive infinity.',
    );
  }
  const snapshot = calculatePillarAllocationSnapshot(balances);
  if (!snapshot.weights) {
    throw new RangeError('Enter at least one pillar balance before applying this snapshot.');
  }
  if (snapshot.totalValue > maxStartingValue) {
    throw new RangeError(
      `Snapshot total must not exceed the projection maximum of ${maxStartingValue}.`,
    );
  }

  return {
    startingValue: snapshot.totalValue,
    allocations: snapshot.weights,
  };
}

export function validatePillarAllocations(allocations) {
  const values = Object.values(allocations);
  return values.length === 4
    && values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
    && Math.abs(values.reduce((total, value) => total + value, 0) - 100) < 1e-9;
}

export function calculatePillarDistributions({ marketValue, periodsPerYear, pillars }) {
  return Object.fromEntries(
    Object.entries(pillars).map(([name, { allocation, annualYield }]) => [
      name,
      marketValue * (allocation / 100) * (annualYield / 100) / periodsPerYear,
    ]),
  );
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
