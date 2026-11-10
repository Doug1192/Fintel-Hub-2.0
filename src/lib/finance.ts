import type { Category, Dataset, Granularity, PeriodSummary } from "./types";

const GRAN_RANK: Record<Granularity, number> = { month: 0, quarter: 1, year: 2 };

export function canAggregate(from: Granularity, to: Granularity) {
  return GRAN_RANK[to] >= GRAN_RANK[from];
}

export function bucketKey(period: string, to: Granularity): string {
  const year = period.slice(0, 4);
  if (to === "year") return year;
  if (to === "quarter") {
    const q = /^\d{4}-Q([1-4])$/.exec(period);
    if (q) return period;
    const m = Number(period.slice(5, 7));
    return `${year}-Q${Math.floor((m - 1) / 3) + 1}`;
  }
  return period;
}

/** Sum each line's values into coarser buckets. */
export function aggregate(ds: Dataset, to: Granularity): { periods: string[]; values: Map<string, number[]> } {
  if (!canAggregate(ds.granularity, to) || to === ds.granularity) {
    return { periods: ds.periods, values: new Map(ds.lines.map((l) => [l.id, l.values])) };
  }
  const keys: string[] = [];
  const index = ds.periods.map((p) => {
    const k = bucketKey(p, to);
    let i = keys.indexOf(k);
    if (i < 0) {
      keys.push(k);
      i = keys.length - 1;
    }
    return i;
  });
  const values = new Map<string, number[]>();
  for (const l of ds.lines) {
    const out = new Array(keys.length).fill(0);
    l.values.forEach((v, i) => (out[index[i]] += v || 0));
    values.set(l.id, out);
  }
  return { periods: keys, values };
}

export function summarize(ds: Dataset, to: Granularity = ds.granularity): PeriodSummary[] {
  const { periods, values } = aggregate(ds, to);
  return periods.map((period, i) => {
    const sum = (c: Category) =>
      ds.lines.filter((l) => l.category === c).reduce((a, l) => a + (values.get(l.id)?.[i] || 0), 0);
    const revenue = sum("revenue");
    const otherIncome = sum("other_income");
    const cogs = sum("cogs");
    const variable = sum("opex_variable");
    const fixed = sum("opex_fixed");
    const nonOperating = sum("non_operating");
    const tax = sum("tax");
    const grossProfit = revenue - cogs;
    const contribution = revenue - cogs - variable;
    const operatingIncome = contribution - fixed;
    const netIncome = operatingIncome + otherIncome - nonOperating - tax;
    return { period, revenue, otherIncome, cogs, variable, fixed, nonOperating, tax, grossProfit, contribution, operatingIncome, netIncome };
  });
}

export function totals(rows: PeriodSummary[]): PeriodSummary {
  const z: PeriodSummary = { period: "Total", revenue: 0, otherIncome: 0, cogs: 0, variable: 0, fixed: 0, nonOperating: 0, tax: 0, grossProfit: 0, contribution: 0, operatingIncome: 0, netIncome: 0 };
  for (const r of rows) {
    for (const k of Object.keys(z) as (keyof PeriodSummary)[]) {
      if (k !== "period") (z[k] as number) += r[k] as number;
    }
  }
  return z;
}

/** Number of base periods that make up one year. */
export function periodsPerYear(g: Granularity) {
  return g === "month" ? 12 : g === "quarter" ? 4 : 1;
}

/** Trailing-twelve-months (or last full year) totals plus the prior-year comparison. */
export function trailingYear(ds: Dataset) {
  const rows = summarize(ds);
  const n = periodsPerYear(ds.granularity);
  const cur = rows.slice(-n);
  const prev = rows.length >= 2 * n ? rows.slice(-2 * n, -n) : null;
  return { current: totals(cur), previous: prev ? totals(prev) : null, periodsUsed: cur.length };
}

export interface Kpis {
  revenue: number;
  revenueGrowth: number | null;
  grossMargin: number;
  contributionMargin: number;
  operatingMargin: number;
  netMargin: number;
  netIncome: number;
  netIncomeGrowth: number | null;
  fixedShare: number;
  variableShare: number;
  breakEvenRevenue: number;
  marginOfSafety: number;
  operatingLeverage: number;
  otherIncomeShare: number;
  revenuePerEmployee: number | null;
  opexRatio: number;
}

export function computeKpis(ds: Dataset): Kpis {
  const { current: c, previous: p } = trailingYear(ds);
  const safe = (a: number, b: number) => (b ? a / b : 0);
  const cmRatio = safe(c.contribution, c.revenue);
  const totalCost = c.cogs + c.variable + c.fixed;
  const breakEven = cmRatio > 0 ? c.fixed / cmRatio : Infinity;
  return {
    revenue: c.revenue,
    revenueGrowth: p && p.revenue ? c.revenue / p.revenue - 1 : null,
    grossMargin: safe(c.grossProfit, c.revenue),
    contributionMargin: cmRatio,
    operatingMargin: safe(c.operatingIncome, c.revenue),
    netMargin: safe(c.netIncome, c.revenue),
    netIncome: c.netIncome,
    netIncomeGrowth: p && p.netIncome ? (c.netIncome - p.netIncome) / Math.abs(p.netIncome) : null,
    fixedShare: safe(c.fixed, totalCost),
    variableShare: safe(c.cogs + c.variable, totalCost),
    breakEvenRevenue: breakEven,
    marginOfSafety: isFinite(breakEven) ? safe(c.revenue - breakEven, c.revenue) : -1,
    operatingLeverage: c.operatingIncome > 0 ? c.contribution / c.operatingIncome : Infinity,
    otherIncomeShare: safe(c.otherIncome, c.revenue + c.otherIncome),
    revenuePerEmployee: ds.headcount ? c.revenue / ds.headcount : null,
    opexRatio: safe(c.variable + c.fixed, c.revenue),
  };
}

/** Totals per line group within a category over the trailing year. */
export function groupBreakdown(ds: Dataset, cats: Category[]) {
  const n = periodsPerYear(ds.granularity);
  const map = new Map<string, { group: string; category: Category; value: number }>();
  for (const l of ds.lines) {
    if (!cats.includes(l.category)) continue;
    const v = l.values.slice(-n).reduce((a, b) => a + (b || 0), 0);
    const key = l.category + "|" + l.group;
    const cur = map.get(key) ?? { group: l.group, category: l.category, value: 0 };
    cur.value += v;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

/** Simple ordinary-least-squares slope for a series, used for trend direction. */
export function slope(ys: number[]) {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return den ? num / den : 0;
}

export interface Insight {
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  detail: string;
}

/** Rule-based narrative insights so the dashboard is useful without AI. */
export function ruleInsights(ds: Dataset): Insight[] {
  const k = computeKpis(ds);
  const rows = summarize(ds);
  const out: Insight[] = [];
  const pct = (v: number) => (v * 100).toFixed(1) + "%";

  if (k.revenueGrowth !== null) {
    out.push(
      k.revenueGrowth >= 0.1
        ? { tone: "good", title: `Revenue up ${pct(k.revenueGrowth)} year over year`, detail: "Growth is healthy. Check that variable costs are not growing faster than revenue." }
        : k.revenueGrowth >= 0
          ? { tone: "info", title: `Revenue growth is modest (${pct(k.revenueGrowth)})`, detail: "Look at pricing, upsell and channel expansion to speed up the top line." }
          : { tone: "bad", title: `Revenue down ${pct(-k.revenueGrowth)} year over year`, detail: "Find which revenue streams are shrinking (see the breakdown) and test retention or pricing changes." },
    );
  }
  out.push(
    k.grossMargin >= 0.5
      ? { tone: "good", title: `Strong gross margin of ${pct(k.grossMargin)}`, detail: "Production and purchasing costs are well controlled compared with selling prices." }
      : k.grossMargin >= 0.3
        ? { tone: "info", title: `Gross margin of ${pct(k.grossMargin)}`, detail: "Typical for products. Supplier renegotiation or price increases could add margin." }
        : { tone: "warn", title: `Thin gross margin (${pct(k.grossMargin)})`, detail: "Little room for operating costs. Review pricing and the cost of goods sold first." },
  );
  if (isFinite(k.breakEvenRevenue)) {
    out.push(
      k.marginOfSafety > 0.2
        ? { tone: "good", title: `${pct(k.marginOfSafety)} margin of safety`, detail: `Revenue could fall to about ${Math.round(k.breakEvenRevenue).toLocaleString()} a year before the business stops covering fixed costs.` }
        : k.marginOfSafety > 0
          ? { tone: "warn", title: `Only ${pct(k.marginOfSafety)} margin of safety`, detail: "A small fall in sales would wipe out operating profit. Consider turning some fixed costs into variable ones." }
          : { tone: "bad", title: "Operating below break-even", detail: `Break-even revenue is about ${Math.round(k.breakEvenRevenue).toLocaleString()} a year. Use Scenarios → Goal seek to find a path there.` },
    );
  }
  if (k.fixedShare > 0.55) {
    out.push({ tone: "warn", title: `High fixed-cost base (${pct(k.fixedShare)} of costs)`, detail: `Operating leverage is ${isFinite(k.operatingLeverage) ? k.operatingLeverage.toFixed(1) + "×" : "very high"}: profit swings sharply when sales change. Growth pays off well, but downturns hurt.` });
  } else {
    out.push({ tone: "info", title: `Cost base is ${pct(k.variableShare)} variable`, detail: "A flexible cost structure keeps profit steadier through downturns, but each extra sale earns less." });
  }
  if (k.otherIncomeShare > 0.08) {
    out.push({ tone: "warn", title: `${pct(k.otherIncomeShare)} of income is non-operating`, detail: "Profit depends a lot on interest, rental or one-off income. Judge core performance on operating income." });
  }
  // Fastest-growing cost group vs revenue growth.
  const n = periodsPerYear(ds.granularity);
  if (ds.periods.length >= 2 * n) {
    const groups = new Map<string, [number, number]>();
    for (const l of ds.lines) {
      if (!["cogs", "opex_variable", "opex_fixed"].includes(l.category)) continue;
      const cur = l.values.slice(-n).reduce((a, b) => a + b, 0);
      const prev = l.values.slice(-2 * n, -n).reduce((a, b) => a + b, 0);
      const g = groups.get(l.group) ?? [0, 0];
      groups.set(l.group, [g[0] + cur, g[1] + prev]);
    }
    let worst: { g: string; growth: number; cur: number } | null = null;
    for (const [g, [cur, prev]] of groups) {
      if (prev <= 0 || cur < 0.02 * k.revenue) continue;
      const growth = cur / prev - 1;
      if (!worst || growth > worst.growth) worst = { g, growth, cur };
    }
    if (worst && k.revenueGrowth !== null && worst.growth > k.revenueGrowth + 0.05) {
      out.push({ tone: "warn", title: `${worst.g} grew ${pct(worst.growth)}, faster than revenue`, detail: "This cost line is outpacing sales. Check whether it is buying growth or just creeping up." });
    }
  }
  const lastQ = rows.slice(-3).reduce((a, r) => a + r.netIncome, 0);
  if (lastQ < 0) out.push({ tone: "bad", title: "Net loss in the latest periods", detail: "Recent periods are loss-making. Look at the forecast to see whether this is seasonal or a trend." });
  return out;
}
