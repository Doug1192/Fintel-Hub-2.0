import type { Granularity, PeriodSummary } from "./types";

export type ForecastMethod = "auto" | "holt-winters" | "holt" | "linear" | "cagr";

export interface SeriesForecast {
  fitted: number[];
  forecast: number[];
  lower: number[];
  upper: number[];
  method: Exclude<ForecastMethod, "auto">;
  mape: number;
}

const Z80 = 1.2816; // 80% prediction interval

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function linear(ys: number[], h: number): { fitted: number[]; fc: number[] } {
  const n = ys.length;
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0, den = 0;
  ys.forEach((y, x) => { num += (x - mx) * (y - my); den += (x - mx) ** 2; });
  const b = den ? num / den : 0;
  const a = my - b * mx;
  return { fitted: ys.map((_, x) => a + b * x), fc: Array.from({ length: h }, (_, i) => a + b * (n + i)) };
}

function holt(ys: number[], h: number, alpha = 0.5, beta = 0.2, phi = 0.95) {
  let level = ys[0];
  let trend = ys.length > 1 ? ys[1] - ys[0] : 0;
  const fitted: number[] = [ys[0]];
  for (let t = 1; t < ys.length; t++) {
    const pred = level + phi * trend;
    fitted.push(pred);
    const newLevel = alpha * ys[t] + (1 - alpha) * pred;
    trend = beta * (newLevel - level) + (1 - beta) * phi * trend;
    level = newLevel;
  }
  const fc: number[] = [];
  let damp = 0;
  for (let i = 1; i <= h; i++) {
    damp += Math.pow(phi, i);
    fc.push(level + damp * trend);
  }
  return { fitted, fc };
}

/** Additive Holt-Winters with damped trend. */
function holtWinters(ys: number[], h: number, m: number, alpha = 0.35, beta = 0.1, gamma = 0.3, phi = 0.97) {
  const seasons = Math.floor(ys.length / m);
  const seasonAvg = Array.from({ length: seasons }, (_, s) => mean(ys.slice(s * m, s * m + m)));
  const season = Array.from({ length: m }, (_, i) => mean(Array.from({ length: seasons }, (_, s) => ys[s * m + i] - seasonAvg[s])));
  let level = seasonAvg[0];
  let trend = seasons > 1 ? (seasonAvg[1] - seasonAvg[0]) / m : 0;
  const fitted: number[] = [];
  for (let t = 0; t < ys.length; t++) {
    const s = season[t % m];
    const pred = level + phi * trend + s;
    fitted.push(pred);
    const newLevel = alpha * (ys[t] - s) + (1 - alpha) * (level + phi * trend);
    trend = beta * (newLevel - level) + (1 - beta) * phi * trend;
    season[t % m] = gamma * (ys[t] - newLevel) + (1 - gamma) * s;
    level = newLevel;
  }
  const fc: number[] = [];
  let damp = 0;
  for (let i = 1; i <= h; i++) {
    damp += Math.pow(phi, i);
    fc.push(level + damp * trend + season[(ys.length + i - 1) % m]);
  }
  return { fitted, fc };
}

function cagr(ys: number[], h: number, perYear: number) {
  const n = ys.length;
  const w = Math.min(perYear, Math.max(1, Math.floor(n / 2)));
  const first = mean(ys.slice(0, w));
  const last = mean(ys.slice(-w));
  const steps = n - w;
  const g = first > 0 && last > 0 && steps > 0 ? Math.pow(last / first, 1 / steps) - 1 : 0;
  const fitted = ys.map((_, i) => first * Math.pow(1 + g, i - (w - 1) / 2));
  const fc = Array.from({ length: h }, (_, i) => last * Math.pow(1 + g, i + 1 + (w - 1) / 2));
  return { fitted, fc };
}

function mapeOf(ys: number[], fitted: number[], skip = 1) {
  const errs = ys.slice(skip).map((y, i) => (y ? Math.abs((y - fitted[i + skip]) / y) : 0));
  return mean(errs);
}

export function seasonLength(g: Granularity) {
  return g === "month" ? 12 : g === "quarter" ? 4 : 1;
}

export function forecastSeries(ys: number[], h: number, g: Granularity, method: ForecastMethod = "auto"): SeriesForecast {
  const m = seasonLength(g);
  const candidates: Exclude<ForecastMethod, "auto">[] =
    method === "auto" ? (m > 1 && ys.length >= 2 * m ? ["holt-winters", "holt", "linear"] : ["holt", "linear", "cagr"]) : [method];
  let best: SeriesForecast | null = null;
  for (const c of candidates) {
    if (ys.length < 2) break;
    let r: { fitted: number[]; fc: number[] };
    if (c === "holt-winters") {
      if (m <= 1 || ys.length < 2 * m) r = holt(ys, h);
      else r = holtWinters(ys, h, m);
    } else if (c === "holt") r = holt(ys, h);
    else if (c === "cagr") r = cagr(ys, h, m);
    else r = linear(ys, h);
    const skip = c === "holt-winters" ? Math.min(m, ys.length - 1) : 1;
    const mape = mapeOf(ys, r.fitted, skip);
    const resid = ys.slice(skip).map((y, i) => y - r.fitted[i + skip]);
    const sd = Math.sqrt(mean(resid.map((e) => e * e)));
    const lower = r.fc.map((v, i) => v - Z80 * sd * Math.sqrt(1 + i * 0.15));
    const upper = r.fc.map((v, i) => v + Z80 * sd * Math.sqrt(1 + i * 0.15));
    const cand: SeriesForecast = { fitted: r.fitted, forecast: r.fc, lower, upper, method: c, mape };
    if (!best || cand.mape < best.mape) best = cand;
  }
  if (!best) {
    const v = ys[0] ?? 0;
    return { fitted: ys.slice(), forecast: Array(h).fill(v), lower: Array(h).fill(v), upper: Array(h).fill(v), method: "linear", mape: 0 };
  }
  return best;
}

export function nextPeriods(last: string, g: Granularity, h: number): string[] {
  const out: string[] = [];
  if (g === "year") {
    for (let i = 1; i <= h; i++) out.push(String(Number(last) + i));
  } else if (g === "quarter") {
    let y = Number(last.slice(0, 4));
    let q = Number(last.slice(-1));
    for (let i = 0; i < h; i++) {
      q++;
      if (q > 4) { q = 1; y++; }
      out.push(`${y}-Q${q}`);
    }
  } else {
    let y = Number(last.slice(0, 4));
    let m = Number(last.slice(5, 7));
    for (let i = 0; i < h; i++) {
      m++;
      if (m > 12) { m = 1; y++; }
      out.push(`${y}-${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

export interface PnlForecastRow {
  period: string;
  actual: boolean;
  revenue: number;
  revenueLow: number;
  revenueHigh: number;
  cogs: number;
  variable: number;
  fixed: number;
  otherIncome: number;
  operatingIncome: number;
  netIncome: number;
}

export interface ForecastOptions {
  method: ForecastMethod;
  growthAdj: number; // extra growth per year on revenue, e.g. 0.05
  fixedInflation: number; // per year
  variableRatioAdj: number; // change in variable cost ratio, e.g. -0.01 = 1pt better
  taxRate: number;
}

/**
 * Driver-based P&L forecast: revenue is forecast statistically; variable costs
 * follow revenue at the recent cost ratio; fixed costs follow their own trend plus inflation.
 */
export function forecastPnl(rows: PeriodSummary[], g: Granularity, h: number, o: ForecastOptions) {
  const perYear = seasonLength(g);
  const rev = forecastSeries(rows.map((r) => r.revenue), h, g, o.method);
  const recent = rows.slice(-Math.min(rows.length, perYear));
  const sum = (k: keyof PeriodSummary) => recent.reduce((a, r) => a + (r[k] as number), 0);
  const recentRev = sum("revenue") || 1;
  const cogsRatio = sum("cogs") / recentRev;
  const varRatio = sum("variable") / recentRev + o.variableRatioAdj;
  const fixedBase = sum("fixed") / recent.length;
  const otherBase = sum("otherIncome") / recent.length;
  const nonOpBase = sum("nonOperating") / recent.length;
  const periodGrowth = Math.pow(1 + o.growthAdj, 1 / perYear);
  const periodInfl = Math.pow(1 + o.fixedInflation, 1 / perYear);
  const future = nextPeriods(rows[rows.length - 1].period, g, h);

  const out: PnlForecastRow[] = rows.map((r) => ({
    period: r.period, actual: true, revenue: r.revenue, revenueLow: r.revenue, revenueHigh: r.revenue,
    cogs: r.cogs, variable: r.variable, fixed: r.fixed, otherIncome: r.otherIncome, operatingIncome: r.operatingIncome, netIncome: r.netIncome,
  }));
  future.forEach((p, i) => {
    const adj = Math.pow(periodGrowth, i + 1);
    const revenue = Math.max(0, rev.forecast[i] * adj);
    const cogs = revenue * cogsRatio;
    const variable = revenue * Math.max(0, varRatio);
    const fixed = fixedBase * Math.pow(periodInfl, i + 1);
    const operatingIncome = revenue - cogs - variable - fixed;
    const pre = operatingIncome + otherBase - nonOpBase;
    const netIncome = pre - Math.max(0, pre) * o.taxRate;
    out.push({
      period: p, actual: false, revenue,
      revenueLow: Math.max(0, rev.lower[i] * adj), revenueHigh: rev.upper[i] * adj,
      cogs, variable, fixed, otherIncome: otherBase, operatingIncome, netIncome,
    });
  });
  return { rows: out, revenueModel: rev, ratios: { cogsRatio, varRatio, fixedBase } };
}
