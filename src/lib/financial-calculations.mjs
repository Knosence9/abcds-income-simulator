export function monthlyToWeekly(monthlyAmount) {
  return monthlyAmount * 12 / 52;
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
