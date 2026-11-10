export interface PricingInputs {
  price: number;
  unitCost: number;
  fixedMonthly: number;
  newCustomersMonthly: number; // at current price
  unitsPerCustomerMonthly: number;
  startingCustomers: number;
  churnMonthly: number; // 0..1
  elasticity: number; // e.g. -1.3: 1% price rise → 1.3% fewer new customers
  cacPerCustomer: number;
  horizonMonths: number;
  discountRateAnnual: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  priceChange: number;
  churnChange: number; // absolute change in monthly churn
  acquisitionBoost: number; // extra multiplier on new customers beyond elasticity
  rampMonths?: number; // penetration → normalise price after N months
  rampTo?: number;
  costChange?: number;
}

export const STRATEGIES: Strategy[] = [
  { id: "current", name: "Current pricing", description: "Keep prices where they are.", priceChange: 0, churnChange: 0, acquisitionBoost: 0 },
  { id: "premium", name: "Premium (+15%)", description: "Position as higher quality. Fewer new customers, but more margin per unit.", priceChange: 0.15, churnChange: 0.002, acquisitionBoost: 0 },
  { id: "penetration", name: "Penetration (−15% then normalise)", description: "Win market share with a lower price for 6 months, then move back to list price.", priceChange: -0.15, churnChange: 0.004, acquisitionBoost: 0.1, rampMonths: 6, rampTo: 0 },
  { id: "value", name: "Value-based (+8%, bundled)", description: "Bundle extra value (service, warranty, features) to justify a moderate increase and lower churn.", priceChange: 0.08, churnChange: -0.006, acquisitionBoost: 0.03, costChange: 0.03 },
  { id: "discount", name: "Discount-led (−10% permanent)", description: "Compete on price permanently to drive volume.", priceChange: -0.1, churnChange: 0.002, acquisitionBoost: 0.05 },
];

export interface StrategyResult {
  strategy: Strategy;
  months: { m: number; customers: number; revenue: number; profit: number; cumNpv: number }[];
  npv: number;
  totalProfit: number;
  endCustomers: number;
  avgPrice: number;
  contributionMarginUnit: number;
  ltv: number;
  ltvToCac: number;
  paybackMonths: number;
  breakEvenUnits: number;
}

export function simulate(inp: PricingInputs, s: Strategy): StrategyResult {
  const r = Math.pow(1 + inp.discountRateAnnual, 1 / 12) - 1;
  const churn = Math.min(0.99, Math.max(0.001, inp.churnMonthly + s.churnChange));
  const unitCost = inp.unitCost * (1 + (s.costChange ?? 0));
  let customers = inp.startingCustomers;
  let cum = 0, totalProfit = 0, priceSum = 0;
  const months: StrategyResult["months"] = [];
  for (let m = 1; m <= inp.horizonMonths; m++) {
    const pc = s.rampMonths && m > s.rampMonths ? s.rampTo ?? s.priceChange : s.priceChange;
    const price = inp.price * (1 + pc);
    priceSum += price;
    const acq = Math.max(0, inp.newCustomersMonthly * (1 + inp.elasticity * pc) * (1 + s.acquisitionBoost));
    customers = customers * (1 - churn) + acq;
    const units = customers * inp.unitsPerCustomerMonthly;
    const revenue = units * price;
    const profit = units * (price - unitCost) - inp.fixedMonthly - acq * inp.cacPerCustomer;
    totalProfit += profit;
    cum += profit / Math.pow(1 + r, m);
    months.push({ m, customers, revenue, profit, cumNpv: cum });
  }
  const steadyPrice = inp.price * (1 + (s.rampMonths ? s.rampTo ?? s.priceChange : s.priceChange));
  const cmUnit = steadyPrice - unitCost;
  const monthlyCm = cmUnit * inp.unitsPerCustomerMonthly;
  const ltv = churn > 0 ? monthlyCm / (churn + r) : 0;
  return {
    strategy: s,
    months,
    npv: cum,
    totalProfit,
    endCustomers: customers,
    avgPrice: priceSum / inp.horizonMonths,
    contributionMarginUnit: cmUnit,
    ltv,
    ltvToCac: inp.cacPerCustomer > 0 ? ltv / inp.cacPerCustomer : Infinity,
    paybackMonths: monthlyCm > 0 ? inp.cacPerCustomer / monthlyCm : Infinity,
    breakEvenUnits: cmUnit > 0 ? inp.fixedMonthly / cmUnit : Infinity,
  };
}

export interface Check {
  label: string;
  status: "pass" | "warn" | "fail";
  value: string;
  advice: string;
}

export function pricingChecks(inp: PricingInputs, cur: StrategyResult, best: StrategyResult): Check[] {
  const cmRatio = inp.price ? (inp.price - inp.unitCost) / inp.price : 0;
  const steadyUnits = (inp.newCustomersMonthly / Math.max(0.001, inp.churnMonthly)) * inp.unitsPerCustomerMonthly;
  const checks: Check[] = [];
  checks.push({
    label: "Contribution margin ratio",
    status: cmRatio >= 0.5 ? "pass" : cmRatio >= 0.3 ? "warn" : "fail",
    value: (cmRatio * 100).toFixed(1) + "%",
    advice: cmRatio >= 0.5 ? "Each sale leaves a healthy amount to cover overhead." : "Each sale leaves little to cover overhead. Raise prices or cut unit costs before scaling volume.",
  });
  checks.push({
    label: "LTV : CAC",
    status: cur.ltvToCac >= 3 ? "pass" : cur.ltvToCac >= 1.5 ? "warn" : "fail",
    value: isFinite(cur.ltvToCac) ? cur.ltvToCac.toFixed(1) + "×" : "∞",
    advice: cur.ltvToCac >= 3 ? "Customer lifetime value comfortably exceeds acquisition cost." : "Customers barely pay back what it costs to win them. Improve retention, raise prices or lower CAC.",
  });
  checks.push({
    label: "CAC payback",
    status: cur.paybackMonths <= 12 ? "pass" : cur.paybackMonths <= 24 ? "warn" : "fail",
    value: isFinite(cur.paybackMonths) ? cur.paybackMonths.toFixed(1) + " mo" : "never",
    advice: cur.paybackMonths <= 12 ? "Acquisition spend comes back within a year." : "Cash is tied up a long time before each customer becomes profitable.",
  });
  checks.push({
    label: "Break-even volume vs steady state",
    status: steadyUnits >= cur.breakEvenUnits * 1.25 ? "pass" : steadyUnits >= cur.breakEvenUnits ? "warn" : "fail",
    value: `${Math.round(cur.breakEvenUnits).toLocaleString()} units/mo needed`,
    advice: `At current acquisition and churn, volume levels off around ${Math.round(steadyUnits).toLocaleString()} units a month.`,
  });
  const e = Math.abs(inp.elasticity);
  checks.push({
    label: "Price elasticity",
    status: e < 1 ? "pass" : e < 1.5 ? "warn" : "fail",
    value: inp.elasticity.toFixed(2),
    advice: e < 1 ? "Demand is inelastic: a moderate price increase should raise revenue." : "Demand is elastic: price increases lose a lot of volume, so compete on value rather than price.",
  });
  checks.push({
    label: "Long-run winner",
    status: best.strategy.id === "current" ? "pass" : "warn",
    value: best.strategy.name,
    advice: best.strategy.id === "current"
      ? "Current pricing already maximises long-run value under these assumptions."
      : `Over ${inp.horizonMonths} months, "${best.strategy.name}" adds about $${Math.round(best.npv - cur.npv).toLocaleString()} of NPV compared with current pricing.`,
  });
  return checks;
}
