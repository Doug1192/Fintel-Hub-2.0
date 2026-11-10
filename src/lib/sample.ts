import { classifyLine } from "./classify";
import type { Dataset, LineItem } from "./types";

/** Deterministic pseudo-random so the demo looks identical on every load. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * A fictional, 24-month mid-size consumer-products company used as demo data.
 */
export function buildSampleDataset(): Dataset {
  const rand = rng(42);
  const months = 24;
  const start = new Date(2024, 9, 1); // Oct 2024 → Sep 2026
  const periods: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const season = (i: number) => {
    const m = (start.getMonth() + i) % 12; // 0 = Jan
    return [0.86, 0.84, 0.95, 1.0, 1.04, 1.02, 0.98, 1.0, 1.03, 1.06, 1.18, 1.34][m];
  };
  const noise = (amp: number) => 1 + (rand() - 0.5) * 2 * amp;

  const product = periods.map((_, i) => 410000 * Math.pow(1.014, i) * season(i) * noise(0.04));
  const services = periods.map((_, i) => 62000 * Math.pow(1.022, i) * noise(0.06));
  const subs = periods.map((_, i) => 28000 + i * 1650 * noise(0.1));
  const totalRev = periods.map((_, i) => product[i] + services[i] + subs[i]);

  const spec: [string, (i: number) => number][] = [
    ["Product sales", (i) => product[i]],
    ["Service revenue", (i) => services[i]],
    ["Subscription revenue", (i) => subs[i]],
    ["Sales returns and allowances", (i) => -product[i] * 0.021 * noise(0.2)],
    ["Interest income", () => 2100 * noise(0.15)],
    ["Rental income - sublease", () => 4500],
    ["Cost of goods sold", (i) => product[i] * 0.47 * noise(0.03)],
    ["Direct labor", (i) => services[i] * 0.38 * noise(0.04)],
    ["Freight-in", (i) => product[i] * 0.025 * noise(0.1)],
    ["Sales commissions", (i) => totalRev[i] * 0.035 * noise(0.05)],
    ["Shipping & delivery", (i) => product[i] * 0.041 * noise(0.06)],
    ["Payment processing fees", (i) => totalRev[i] * 0.024 * noise(0.03)],
    ["Advertising & marketing", (i) => totalRev[i] * 0.045 * noise(0.15)],
    ["Packaging supplies", (i) => product[i] * 0.012 * noise(0.08)],
    ["Cloud hosting", (i) => 4200 + subs[i] * 0.08],
    ["Salaries & wages", (i) => 104000 + Math.floor(i / 6) * 5200],
    ["Employee benefits", (i) => (104000 + Math.floor(i / 6) * 5200) * 0.21],
    ["Payroll taxes", (i) => (104000 + Math.floor(i / 6) * 5200) * 0.0765],
    ["Rent - warehouse & office", (i) => (i < 12 ? 21500 : 22800)],
    ["Insurance", () => 3900],
    ["Software subscriptions", (i) => 6200 + i * 60],
    ["Utilities", (i) => 3100 * season(i) * noise(0.05)],
    ["Professional fees - legal & accounting", () => 5200 * noise(0.25)],
    ["Depreciation", () => 7400],
    ["Telephone & internet", () => 1350],
    ["Repairs & maintenance", () => 1800 * noise(0.4)],
    ["Office expenses", () => 1650 * noise(0.2)],
    ["Interest expense", (i) => 5600 - i * 70],
    ["Income tax expense", () => 0], // filled below
  ];

  const lines: LineItem[] = spec.map(([name, f], idx) => {
    const c = classifyLine(name);
    let values = periods.map((_, i) => Math.round(f(i)));
    if (c.group === "Discounts & returns") values = values.map((v) => -Math.abs(v));
    return { id: `s${idx}`, name, category: c.category, group: c.group, values, confidence: c.confidence, source: "Demo dataset" };
  });

  // Tax ≈ 24% of positive pre-tax income.
  const taxLine = lines.find((l) => l.category === "tax")!;
  taxLine.values = periods.map((_, i) => {
    let pre = 0;
    for (const l of lines) {
      if (l === taxLine) continue;
      const v = l.values[i];
      if (l.category === "revenue" || l.category === "other_income") pre += v;
      else if (l.category !== "ignore") pre -= v;
    }
    return Math.max(0, Math.round(pre * 0.24));
  });

  return {
    company: "Northwind Outfitters (demo)",
    currency: "USD",
    periods,
    granularity: "month",
    lines,
    headcount: 38,
    isSample: true,
  };
}
