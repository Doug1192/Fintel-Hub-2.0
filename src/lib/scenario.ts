import type { Dataset } from "./types";
import { periodsPerYear, trailingYear } from "./finance";

export interface Baseline {
  revenue: number;
  variableCosts: number; // COGS + variable opex
  fixedCosts: number;
  otherIncome: number;
  nonOperating: number;
  taxRate: number;
  headcount: number;
  avgEmployeeCost: number;
  payroll: number;
}

export interface Drivers {
  price: number; // fractional change
  volume: number;
  elasticity: number; // % volume change per % price change (usually negative)
  unitCost: number; // change in variable cost per unit
  fixed: number; // change in fixed costs (excluding headcount effect)
  headcount: number; // absolute change in people
  productivity: number; // output per employee change
  otherIncome: number;
}

export const ZERO_DRIVERS: Drivers = { price: 0, volume: 0, elasticity: 0, unitCost: 0, fixed: 0, headcount: 0, productivity: 0, otherIncome: 0 };

export function baselineFrom(ds: Dataset): Baseline {
  const { current: c } = trailingYear(ds);
  const n = periodsPerYear(ds.granularity);
  const payroll = ds.lines
    .filter((l) => l.category === "opex_fixed" && /payroll/i.test(l.group))
    .reduce((a, l) => a + l.values.slice(-n).reduce((x, y) => x + y, 0), 0);
  const headcount = ds.headcount ?? Math.max(1, Math.round(payroll / 70000));
  const pre = c.operatingIncome + c.otherIncome - c.nonOperating;
  return {
    revenue: c.revenue,
    variableCosts: c.cogs + c.variable,
    fixedCosts: c.fixed,
    otherIncome: c.otherIncome,
    nonOperating: c.nonOperating,
    taxRate: pre > 0 ? Math.min(0.5, c.tax / pre) : 0.21,
    headcount,
    avgEmployeeCost: headcount ? payroll / headcount || 65000 : 65000,
    payroll,
  };
}

export interface Outcome {
  revenue: number;
  variableCosts: number;
  fixedCosts: number;
  contribution: number;
  operatingIncome: number;
  netIncome: number;
  operatingMargin: number;
  breakEvenRevenue: number;
  headcount: number;
}

export function evaluate(b: Baseline, d: Drivers): Outcome {
  const volumeFactor = Math.max(0, (1 + d.volume) * (1 + d.elasticity * d.price) * (1 + d.productivity));
  const revenue = b.revenue * (1 + d.price) * volumeFactor;
  const variableCosts = b.variableCosts * (1 + d.unitCost) * volumeFactor;
  const fixedCosts = Math.max(0, b.fixedCosts * (1 + d.fixed) + d.headcount * b.avgEmployeeCost);
  const contribution = revenue - variableCosts;
  const operatingIncome = contribution - fixedCosts;
  const pre = operatingIncome + b.otherIncome * (1 + d.otherIncome) - b.nonOperating;
  const netIncome = pre - Math.max(0, pre) * b.taxRate;
  const cm = revenue ? contribution / revenue : 0;
  return {
    revenue, variableCosts, fixedCosts, contribution, operatingIncome, netIncome,
    operatingMargin: revenue ? operatingIncome / revenue : 0,
    breakEvenRevenue: cm > 0 ? fixedCosts / cm : Infinity,
    headcount: b.headcount + d.headcount,
  };
}

export type TargetMetric = "operatingIncome" | "netIncome" | "revenue" | "operatingMargin";

export const TARGET_LABEL: Record<TargetMetric, string> = {
  operatingIncome: "Operating profit",
  netIncome: "Net income",
  revenue: "Revenue",
  operatingMargin: "Operating margin",
};

export interface Lever {
  key: keyof Drivers | "balanced";
  label: string;
  min: number;
  max: number;
  unit: "pct" | "people";
  explain: (v: number, b: Baseline) => string;
}

export const LEVERS: Lever[] = [
  { key: "volume", label: "Increase sales volume", min: -0.9, max: 5, unit: "pct", explain: (v, b) => `Sell ${(v * 100).toFixed(1)}% more units, about ${fmt(b.revenue * v)} of extra revenue at today's prices.` },
  { key: "price", label: "Raise prices", min: -0.5, max: 1, unit: "pct", explain: (v) => `Raise average selling prices by ${(v * 100).toFixed(1)}%. Price elasticity is included if you set it.` },
  { key: "unitCost", label: "Cut variable cost per unit", min: -0.95, max: 0, unit: "pct", explain: (v, b) => `Reduce COGS and variable costs per unit by ${(-v * 100).toFixed(1)}%, about ${fmt(-b.variableCosts * v)} a year.` },
  { key: "fixed", label: "Cut fixed overhead", min: -0.95, max: 0, unit: "pct", explain: (v, b) => `Reduce fixed costs by ${(-v * 100).toFixed(1)}%, about ${fmt(-b.fixedCosts * v)} a year.` },
  { key: "productivity", label: "Improve workforce productivity", min: 0, max: 3, unit: "pct", explain: (v, b) => `Raise output per employee by ${(v * 100).toFixed(1)}% (to ${fmt((b.revenue * (1 + v)) / b.headcount)} revenue per employee) with the same team, through training, process redesign or AI tools.` },
  { key: "headcount", label: "Adjust headcount", min: -1, max: 5, unit: "people", explain: (v, b) => `${v < 0 ? "Reduce" : "Add"} ${Math.abs(Math.round(v))} people (about ${fmt(Math.abs(v) * b.avgEmployeeCost)} a year at the average loaded cost). Revenue is assumed unchanged.` },
  { key: "balanced", label: "Balanced mix", min: 0, max: 1, unit: "pct", explain: () => "" },
];

function fmt(v: number) {
  return "$" + Math.round(v).toLocaleString();
}

function metricOf(o: Outcome, m: TargetMetric) {
  return o[m];
}

/** Balanced plan: split the effort across four levers at scale t (0..1 of their "reasonable max"). */
export function balancedDrivers(base: Drivers, t: number): Drivers {
  return { ...base, volume: base.volume + 0.3 * t, price: base.price + 0.15 * t, unitCost: base.unitCost - 0.15 * t, fixed: base.fixed - 0.15 * t };
}

export interface GoalResult {
  lever: Lever;
  feasible: boolean;
  value: number;
  outcome?: Outcome;
  note: string;
}

/** Reverse sensitivity: for each lever, the smallest move that reaches the target. */
export function goalSeek(b: Baseline, base: Drivers, metric: TargetMetric, target: number): GoalResult[] {
  return LEVERS.map((lever) => {
    const range = lever.key === "headcount" ? [-b.headcount * 0.9, b.headcount * 5] : [lever.min, lever.max];
    const apply = (v: number): Drivers =>
      lever.key === "balanced" ? balancedDrivers(base, v) : { ...base, [lever.key]: (base[lever.key as keyof Drivers] as number) + v };
    const f = (v: number) => metricOf(evaluate(b, apply(v)), metric) - target;
    if (Math.abs(f(0)) < 1e-6 || f(0) >= 0) {
      return { lever, feasible: true, value: 0, outcome: evaluate(b, base), note: "Target already met at current settings." };
    }
    // Scan outward from 0 in both directions; pick the smallest |v| that crosses zero.
    const steps = 600;
    let bestV: number | null = null;
    for (const dir of [1, -1]) {
      const lim = dir > 0 ? range[1] : range[0];
      if (lim * dir <= 0) continue;
      let prevV = 0, prevF = f(0);
      for (let i = 1; i <= steps; i++) {
        const v = (lim * i) / steps;
        const fv = f(v);
        if (prevF < 0 && fv >= 0) {
          let lo = prevV, hi = v;
          for (let k = 0; k < 60; k++) {
            const mid = (lo + hi) / 2;
            if (f(mid) >= 0) hi = mid; else lo = mid;
          }
          if (bestV === null || Math.abs(hi) < Math.abs(bestV)) bestV = hi;
          break;
        }
        prevV = v; prevF = fv;
      }
    }
    if (bestV === null) return { lever, feasible: false, value: 0, note: "This lever alone can't reach the target within a realistic range." };
    const value = lever.key === "headcount" ? Math.round(bestV) : bestV;
    const note = lever.key === "balanced"
      ? `About ${(0.3 * value * 100).toFixed(1)}% more volume, a ${(0.15 * value * 100).toFixed(1)}% price increase, and ${(0.15 * value * 100).toFixed(1)}% lower unit costs and fixed overhead.`
      : lever.explain(value, b);
    return { lever, feasible: true, value, outcome: evaluate(b, apply(value)), note };
  });
}

export interface TornadoBar {
  driver: string;
  low: number;
  high: number;
  lowLabel: string;
  highLabel: string;
}

export function tornado(b: Baseline, base: Drivers, delta: number, metric: TargetMetric = "operatingIncome"): TornadoBar[] {
  const baseVal = metricOf(evaluate(b, base), metric);
  const items: { key: keyof Drivers; label: string; step: number; unit?: string }[] = [
    { key: "price", label: "Selling price", step: delta },
    { key: "volume", label: "Sales volume", step: delta },
    { key: "unitCost", label: "Variable cost / unit", step: delta },
    { key: "fixed", label: "Fixed costs", step: delta },
    { key: "productivity", label: "Workforce productivity", step: delta },
    { key: "otherIncome", label: "Other income", step: delta },
  ];
  return items
    .map((it) => {
      const lo = metricOf(evaluate(b, { ...base, [it.key]: base[it.key] - it.step }), metric) - baseVal;
      const hi = metricOf(evaluate(b, { ...base, [it.key]: base[it.key] + it.step }), metric) - baseVal;
      return { driver: it.label, low: lo, high: hi, lowLabel: `−${Math.round(it.step * 100)}%`, highLabel: `+${Math.round(it.step * 100)}%` };
    })
    .sort((a, b2) => Math.max(Math.abs(b2.low), Math.abs(b2.high)) - Math.max(Math.abs(a.low), Math.abs(a.high)));
}

/** Two-way data table on price × volume. */
export function dataTable(b: Baseline, base: Drivers, steps: number[], metric: TargetMetric = "operatingIncome") {
  return steps.map((pv) => ({
    price: pv,
    cells: steps.map((vv) => ({ volume: vv, value: metricOf(evaluate(b, { ...base, price: base.price + pv, volume: base.volume + vv }), metric) })),
  }));
}
