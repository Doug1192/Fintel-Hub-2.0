/* Engine self-test: npm run selftest */
import assert from "node:assert/strict";
import { classifyLine } from "../src/lib/classify";
import { parseTable, parseText, toLineItems } from "../src/lib/parse";
import { buildSampleDataset } from "../src/lib/sample";
import { computeKpis, summarize } from "../src/lib/finance";
import { forecastPnl } from "../src/lib/forecast";
import { baselineFrom, evaluate, goalSeek, ZERO_DRIVERS } from "../src/lib/scenario";
import { solve, TEMPLATES } from "../src/lib/optimize";
import { simulate, STRATEGIES } from "../src/lib/pricing";
import { analyzeWorkflowRules } from "../src/lib/workflow";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("classifier", () => {
  const cases: [string, string][] = [
    ["Product sales", "revenue"], ["Cost of sales", "cogs"], ["Sales commissions", "opex_variable"], ["Rent expense", "opex_fixed"],
    ["Rental income", "other_income"], ["Interest income", "other_income"], ["Interest expense", "non_operating"], ["Salaries & wages", "opex_fixed"],
    ["Payroll taxes", "opex_fixed"], ["Income tax expense", "tax"], ["Total operating expenses", "ignore"], ["Gross profit", "ignore"],
    ["Shipping & delivery", "opex_variable"], ["Depreciation", "opex_fixed"], ["Merchant fees", "opex_variable"],
  ];
  for (const [name, cat] of cases) assert.equal(classifyLine(name).category, cat, name);
});

t("wide CSV with numeric data rows and Total column", () => {
  const r = parseTable([
    ["Account", "Jan 2025", "Feb 2025", "Mar 2025", "Total"],
    ["Sales revenue", "$12,000", "$13,500", "$14,100", "$39,600"],
    ["Office rent", "2000", "2000", "2000", "6000"],
    ["Cost of sales", "(5000)", "(5600)", "(5900)", "(16500)"],
  ]);
  assert.deepEqual(r.periods, ["2025-01", "2025-02", "2025-03"]);
  const items = toLineItems(r, "t");
  assert.deepEqual(items.find((i) => i.name === "Cost of sales")!.values, [5000, 5600, 5900]);
});

t("quarter headers & long format", () => {
  assert.deepEqual(parseTable([["", "Q1 2025", "Q2 2025"], ["Revenue", 10, 20]]).periods, ["2025-Q1", "2025-Q2"]);
  const long = parseTable([["Date", "Account", "Amount"], ["2025-01-15", "Sales", 100], ["2025-01-20", "Sales", 50], ["2025-02-03", "Rent", 30]]);
  assert.equal(long.layout, "long");
  assert.deepEqual(long.lines.find((l) => l.name === "Sales")!.values, [150, 0]);
});

t("single-period text statement", () => {
  const r = parseText("Revenue   1,250,000\nCost of sales   (610,000)\nRent expense  48,000", "2025");
  assert.equal(r.lines.length, 3);
  assert.equal(r.lines[0].values[0], 1250000);
});

const ds = buildSampleDataset();
t("sample dataset & KPIs", () => {
  const k = computeKpis(ds);
  assert.ok(k.revenue > 1e6 && k.grossMargin > 0.3 && k.grossMargin < 0.8);
  assert.ok(k.operatingMargin > 0, "demo should be profitable");
  const q = summarize(ds, "quarter");
  assert.equal(q.length, 8);
  const sumM = summarize(ds).reduce((a, r) => a + r.revenue, 0);
  assert.ok(Math.abs(sumM - q.reduce((a, r) => a + r.revenue, 0)) < 1);
});

t("forecast", () => {
  const f = forecastPnl(summarize(ds), "month", 12, { method: "auto", growthAdj: 0, fixedInflation: 0.03, variableRatioAdj: 0, taxRate: 0.24 });
  const fut = f.rows.filter((r) => !r.actual);
  assert.equal(fut.length, 12);
  assert.equal(fut[0].period, "2026-10");
  assert.ok(fut.every((r) => r.revenue > 0 && r.revenueLow <= r.revenue && r.revenueHigh >= r.revenue));
  assert.ok(f.revenueModel.mape < 0.15, "fit error " + f.revenueModel.mape);
});

t("goal seek reaches target", () => {
  const b = baselineFrom(ds);
  const target = evaluate(b, ZERO_DRIVERS).operatingIncome * 2;
  for (const r of goalSeek(b, ZERO_DRIVERS, "operatingIncome", target)) {
    if (!r.feasible || r.lever.key === "headcount") continue;
    assert.ok(Math.abs(r.outcome!.operatingIncome - target) / target < 0.01, r.lever.key);
  }
});

t("optimizer templates", () => {
  for (const tpl of TEMPLATES) {
    const r = solve(tpl.model);
    assert.ok(r.feasible, tpl.id);
    for (const c of r.constraints) {
      if (c.relation === "<=") assert.ok(c.lhs <= c.rhs + 1e-6, `${tpl.id}:${c.name}`);
      if (c.relation === ">=") assert.ok(c.lhs >= c.rhs - 1e-6, `${tpl.id}:${c.name}`);
    }
  }
  const mix = solve(TEMPLATES[0].model);
  assert.ok(mix.objective > 0);
});

t("pricing simulation", () => {
  const inp = { price: 100, unitCost: 40, fixedMonthly: 10000, newCustomersMonthly: 100, unitsPerCustomerMonthly: 1, startingCustomers: 1000, churnMonthly: 0.05, elasticity: -1, cacPerCustomer: 50, horizonMonths: 24, discountRateAnnual: 0.1 };
  const r = STRATEGIES.map((s) => simulate(inp, s));
  assert.ok(r.every((x) => isFinite(x.npv)));
  assert.ok(Math.abs(r[0].ltv - 60 / (0.05 + (Math.pow(1.1, 1 / 12) - 1))) < 1);
});

t("workflow rules", () => {
  const a = analyzeWorkflowRules("- Manually enter vendor invoices into QuickBooks\n- Prepare the monthly KPI report in slides\n- Negotiate contracts with key suppliers", 40);
  assert.equal(a.tasks.length, 3);
  assert.ok(a.tasks[0].automationPotential > a.tasks[2].automationPotential);
});


// ---- aliases & vault
import { attachDocToDataset, detachDocFromDataset, emptyDataset, generalVault, migrateV1, newAlias } from "../src/lib/aliases";
import type { VaultDoc } from "../src/lib/types";

const mkDoc = (id: string, periods: string[], rows: [string, number[]][], gran: "month" | "quarter" | "year" = "month"): VaultDoc => {
  const parsed = { periods, granularity: gran, lines: rows.map(([name, values]) => ({ name, values })), warnings: [], layout: "wide" as const };
  return { id, name: id + ".csv", size: 1, kind: "income_statement", addedAt: "", via: "parser", periods, granularity: gran, items: toLineItems(parsed, id) };
};

t("aliases: attach, merge, detach, vault", () => {
  const h1 = mkDoc("h1", ["2025-01", "2025-02"], [["Sales", [100, 110]], ["Rent", [20, 20]]]);
  const h2 = mkDoc("h2", ["2025-03"], [["Sales", [120]], ["Rent", [20]]]);
  let ds = attachDocToDataset(emptyDataset(), h1).dataset;
  assert.deepEqual(ds.periods, ["2025-01", "2025-02"]);
  const r2 = attachDocToDataset(ds, h2);
  assert.equal(r2.warnings.length, 0);
  ds = r2.dataset;
  assert.deepEqual(ds.periods, ["2025-01", "2025-02", "2025-03"]);
  assert.equal(summarize(ds).reduce((a, r) => a + r.revenue, 0), 330);
  // Same document twice → double-counting warning.
  assert.equal(attachDocToDataset(ds, mkDoc("dup", ["2025-01"], [["Sales", [100]]])).warnings.length, 1);
  // Different granularity → refused, data unchanged.
  const yr = attachDocToDataset(ds, mkDoc("y", ["2024"], [["Sales", [1000]]], "year"));
  assert.ok(yr.error);
  assert.equal(yr.dataset, ds);
  // Detach h2 → back to two periods.
  const back = detachDocFromDataset(ds, "h2");
  assert.deepEqual(back.periods, ["2025-01", "2025-02"]);
  assert.equal(summarize(back).reduce((a, r) => a + r.revenue, 0), 210);
  // Reference docs leave data alone.
  const ref: VaultDoc = { ...mkDoc("ref", [], []), preview: [["Product", "Hours"], ["A", "3"]] };
  assert.equal(attachDocToDataset(back, ref).dataset, back);
  // General vault = docs in no alias.
  const a = newAlias("A");
  a.docIds = ["h1"];
  assert.deepEqual(generalVault([h1, h2, ref], [a]).map((d) => d.id), ["h2", "ref"]);
});

t("aliases: migrate v1 storage", () => {
  const sample = migrateV1({ dataset: buildSampleDataset(), docs: [] });
  assert.equal(sample.aliases.length, 1);
  const real = { ...buildSampleDataset(), isSample: false, company: "Acme" };
  const m = migrateV1({ dataset: real, docs: [{ id: "d1", name: "pl.csv", size: 1, kind: "income_statement", addedAt: "", linesExtracted: 3 }] });
  assert.equal(m.aliases[0].name, "Acme");
  assert.deepEqual(m.aliases[0].docIds, ["d1"]);
  assert.equal(m.activeAliasId, m.aliases[0].id);
  assert.equal(m.aliases[0].dataset.lines.length, real.lines.length);
});

console.log(`\nAll ${n} test groups passed.`);
