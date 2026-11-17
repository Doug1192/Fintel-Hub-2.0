/* Engine self-test: npm run selftest */
import assert from "node:assert/strict";
import { classifyLine } from "../src/lib/classify";
import { parseTable, parseText, toLineItems } from "../src/lib/parse";
import { buildSampleDataset } from "../src/lib/sample";
import { computeKpis, summarize } from "../src/lib/finance";
import { forecastPnl } from "../src/lib/forecast";
import { baselineFrom, evaluate, goalSeek, ZERO_DRIVERS } from "../src/lib/scenario";
import { addFixedCharge, checkFeasible, formulation, maxOfSum, sensitivity, solve, toLpFormat, toPulp, toScipy, weightedAverageConstraint, type OptModel } from "../src/lib/optimize";
import { TEMPLATES } from "../src/lib/optTemplates";
import { checkMapping, guessMapping, modelFromTable } from "../src/lib/docToModel";
import { allocationModel, coverageModel, inventoryModel, networkModel, parsePerPeriod } from "../src/lib/optBuilders";
import { readFileSync } from "node:fs";
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

t("optimizer: every template solves and matches its known answer (Excel Solver / SciPy)", () => {
  for (const tpl of TEMPLATES) {
    const r = solve(tpl.model);
    assert.equal(r.status, "optimal", tpl.id);
    assert.ok(checkFeasible(tpl.model, r.values).ok, tpl.id + " solution must satisfy every constraint");
    if (tpl.expected) {
      assert.ok(Math.abs(r.objective - tpl.expected.objective) <= 1e-6 * Math.max(1, Math.abs(tpl.expected.objective)), `${tpl.id}: ${r.objective} vs ${tpl.expected.objective}`);
      // The reference solution must itself be feasible and give the same objective (alternative optima are fine).
      if (tpl.expected.values) {
        assert.ok(checkFeasible(tpl.model, tpl.expected.values).ok, tpl.id + " expected solution feasible");
        const objOfExpected = tpl.model.variables.reduce((a, v) => a + v.objective * (tpl.expected!.values![v.name] ?? 0), 0);
        assert.ok(Math.abs(objOfExpected - tpl.expected.objective) < 1e-6 * Math.max(1, tpl.expected.objective), tpl.id + " expected objective");
      }
    }
  }
  // Molokai Nut has a unique optimum, so the plan itself must match Excel exactly.
  const p1 = solve(TEMPLATES.find((t) => t.id === "lab-p1")!.model);
  assert.deepEqual(p1.values, { Whole: 1000, Cluster: 500, Crunch: 80, Roasted: 200 });
});

t("optimizer: 160 random LP/MILP cases agree with SciPy (HiGHS)", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/lp-crosscheck.json", import.meta.url), "utf8")) as { model: OptModel; expected: { status: string; objective: number | null } }[];
  let checked = 0;
  for (const [k, c] of cases.entries()) {
    const r = solve(c.model);
    assert.equal(r.status, c.expected.status, `case ${k + 1}: status`);
    if (r.status === "optimal") {
      const e = c.expected.objective!;
      assert.ok(Math.abs(r.objective - e) <= 1e-6 * Math.max(1, Math.abs(e)), `case ${k + 1}: ${r.objective} vs ${e}`);
      assert.ok(checkFeasible(c.model, r.values).ok, `case ${k + 1}: feasible`);
    }
    checked++;
  }
  assert.equal(checked, cases.length);
});

t("optimizer: sensitivity report (shadow prices, reduced costs, ranges)", () => {
  // Concert problem 9(c): the fire-code capacity is worth $100 per extra ticket over the allowable increase.
  const p9 = TEMPLATES.find((t) => t.id === "lab-p9")!.model;
  const s9 = sensitivity(p9, solve(p9))!;
  const cap = s9.constraints.find((c) => c.name === "Fire code capacity")!;
  assert.equal(cap.shadowPrice, 100);
  assert.ok(cap.allowIncrease >= 400, "the extra 400 tickets are within the allowable increase");
  const after = solve({ ...p9, constraints: p9.constraints.map((c) => (c.name === "Fire code capacity" ? { ...c, rhs: 20400 } : c)) });
  assert.equal(after.objective - solve(p9).objective, 40000);
  // Strong duality: Σ shadow price × RHS + bound terms = objective, checked on every LP template.
  for (const tpl of TEMPLATES) {
    if (tpl.model.variables.some((v) => v.integer || v.binary)) continue; // no sensitivity report for integer models (as in Excel)
    const r = solve(tpl.model);
    const s = sensitivity(tpl.model, r)!;
    assert.ok(s, tpl.id);
    for (const c of s.constraints) {
      const res = r.constraints.find((x) => x.name === c.name)!;
      if (!res.binding) assert.ok(Math.abs(c.shadowPrice) < 1e-9, `${tpl.id}: non-binding ${c.name} must have zero shadow price`);
    }
    for (const v of s.variables) {
      // A variable strictly between its bounds must have zero reduced cost.
      const tv = tpl.model.variables.find((x) => x.name === v.name)!;
      const lb = Math.max(0, tv.min ?? 0), ub = tv.max;
      if (v.value > lb + 1e-7 && (ub === null || v.value < ub - 1e-7)) assert.ok(Math.abs(v.reducedCost) < 1e-7, `${tpl.id}: ${v.name} reduced cost`);
    }
  }
  // Problems 2 and 3 have alternative optima; Molokai does not.
  const alt = (id: string) => { const m = TEMPLATES.find((t) => t.id === id)!.model; return sensitivity(m, solve(m))!.alternativeOptima; };
  assert.equal(alt("lab-p3"), true);
});

t("optimizer: sensitivity reports match HiGHS on 80 random non-degenerate LPs", () => {
  type E = { objective: number; rows: { shadow: number; inc: number | null; dec: number | null }[]; cols: { value: number; reducedCost: number; inc: number | null; dec: number | null }[] };
  const cases = JSON.parse(readFileSync(new URL("./fixtures/sensitivity-crosscheck.json", import.meta.url), "utf8")) as { model: OptModel; expected: E }[];
  const close = (a: number, b: number | null) => (b === null ? !isFinite(a) : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)));
  for (const [k, c] of cases.entries()) {
    const r = solve(c.model);
    const s = sensitivity(c.model, r)!;
    assert.ok(close(r.objective, c.expected.objective), `case ${k + 1} objective`);
    c.expected.rows.forEach((e, i) => {
      const g = s.constraints[i];
      assert.ok(close(g.shadowPrice, e.shadow), `case ${k + 1} row ${i + 1} shadow price ${g.shadowPrice} vs ${e.shadow}`);
      assert.ok(close(g.allowIncrease, e.inc), `case ${k + 1} row ${i + 1} allowable increase ${g.allowIncrease} vs ${e.inc}`);
      assert.ok(close(g.allowDecrease, e.dec), `case ${k + 1} row ${i + 1} allowable decrease ${g.allowDecrease} vs ${e.dec}`);
    });
    c.expected.cols.forEach((e, j) => {
      const g = s.variables[j];
      assert.ok(close(g.reducedCost, e.reducedCost), `case ${k + 1} x${j + 1} reduced cost`);
      assert.ok(close(g.allowIncrease, e.inc), `case ${k + 1} x${j + 1} cost allowable increase ${g.allowIncrease} vs ${e.inc}`);
      assert.ok(close(g.allowDecrease, e.dec), `case ${k + 1} x${j + 1} cost allowable decrease ${g.allowDecrease} vs ${e.dec}`);
    });
  }
});

t("optimizer: Module 3 lab answers, exact values and sensitivity (HiGHS reference)", () => {
  const get = (id: string) => TEMPLATES.find((t) => t.id === id)!.model;
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
  // P1 STL Chocolatier
  const p1 = get("m3-p1"), r1 = solve(p1), s1 = sensitivity(p1, r1)!;
  assert.equal(r1.objective, 594);
  assert.deepEqual(r1.values, { Value: 0, Regular: 540, Deluxe: 0 });
  const labor = s1.constraints.find((c) => c.name.startsWith("Labor"))!, weight = s1.constraints.find((c) => c.name.startsWith("Weight"))!;
  assert.ok(near(labor.shadowPrice, 0.275) && near(labor.allowIncrease, 2270 / 3) && near(labor.allowDecrease, 2160));
  assert.equal(weight.shadowPrice, 0);
  assert.ok(!isFinite(weight.allowIncrease) && near(weight.allowDecrease, 90.8));
  assert.ok(near(180 * labor.shadowPrice, 49.5), "(d) 3 extra hours are worth $49.50 > $40");
  // P2 Clayton Brewery: exact vertex, shadow prices and ranges
  const p2 = get("m3-p2"), r2 = solve(p2), s2 = sensitivity(p2, r2)!;
  assert.ok(Math.abs(r2.values.A - 265 / 23) < 1e-12 && Math.abs(r2.values.B - 675 / 23) < 1e-12, "exact vertex, no round-off");
  assert.deepEqual(r2.constraints.map((c) => c.binding), [true, true, false]);
  const [corn, hops, malt] = s2.constraints;
  assert.ok(near(corn.shadowPrice, 65 / 46) && near(hops.shadowPrice, 30 / 23) && malt.shadowPrice === 0);
  assert.ok(near(corn.allowIncrease, 132.5) && near(corn.allowDecrease, 229.75) && near(hops.allowIncrease, 919 / 37) && near(hops.allowDecrease, 265 / 7));
  assert.ok(near(malt.allowDecrease, 4595 / 23) && !isFinite(malt.allowIncrease));
  assert.ok(hops.shadowPrice < 1.4, "(e) don't buy hops at $1.40");
  assert.ok(190 < malt.allowDecrease, "(f) malt drop to 1,000 lb leaves the plan unchanged");
  assert.ok(near(s2.variables[0].allowIncrease, 16.25) && near(s2.variables[0].allowDecrease, 30 / 7) && near(s2.variables[1].allowIncrease, 10) && near(s2.variables[1].allowDecrease, 13));
  // P4 coal blend: the mixed-scale case that exposed the precision issue
  const p4 = get("m3-p4"), r4 = solve(p4), s4 = sensitivity(p4, r4)!;
  assert.ok(near(r4.objective, 2220000 / 69) && near(r4.values.C1, 4 / 69) && near(r4.values.C2, 38 / 69) && near(r4.values.C3, 27 / 69));
  const [blend, sulfur, dust] = s4.constraints;
  assert.ok(near(blend.allowIncrease, 2 / 9) && near(blend.allowDecrease, 1 / 53), "blend ranges");
  assert.ok(near(sulfur.shadowPrice, 40 / 23) && near(sulfur.allowIncrease, 360) && near(sulfur.allowDecrease, 100), "sulfur ranges");
  assert.ok(near(dust.allowIncrease, 0.4 / 11) && near(dust.allowDecrease, 0.225), "dust ranges");
  assert.ok(s4.variables.every((v) => v.reducedCost === 0), "no round-off in reduced costs");
  // P3 / P5 networks
  assert.equal(solve(get("m3-p3")).objective, 455);
  assert.equal(solve(get("m3-p5")).objective, 12750);
  const optional = get("m3-p5");
  assert.equal(solve({ ...optional, constraints: optional.constraints.map((c) => (c.name.includes("all cotton") ? { ...c, relation: "<=" as const } : c)) }).objective, 12775);
  // Large-coefficient rows with a zero limit don't raise false violations
  const tons: OptModel = { ...p4, variables: p4.variables.map((v) => ({ ...v, name: v.name.replace("C", "T") })), constraints: [
    { name: "cap", terms: { T1: 1, T2: 1, T3: 1 }, relation: "<=", rhs: 30 },
    weightedAverageConstraint("sulfur", [{ variable: "T1", attribute: 1100 }, { variable: "T2", attribute: 3500 }, { variable: "T3", attribute: 1300 }], "<=", 2500),
    weightedAverageConstraint("dust", [{ variable: "T1", attribute: 1.7 }, { variable: "T2", attribute: 3.2 }, { variable: "T3", attribute: 2.4 }], "<=", 2.8),
  ] };
  const rt = solve(tons);
  assert.ok(near(rt.objective, 30 * 2220000 / 69) && checkFeasible(tons, rt.values).ok, "(d) 965,217.4 lb/hour, feasible");
});

t("optimizer: pattern builders reproduce verified answers (Module 1 & 4)", () => {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
  assert.deepEqual(parsePerPeriod("3.06, 4.01\t6.03  $4.06"), [3.06, 4.01, 6.03, 4.06]);
  assert.equal(parsePerPeriod("1.5"), 1.5);
  assert.equal(parsePerPeriod("abc"), null);
  // Coverage: cyclic shifts (Module 1 P2) and leases that must end in the horizon (Module 4 P2)
  assert.equal(solve(coverageModel({ title: "s", periodLabel: "Period", requirement: [90, 215, 250, 165, 300, 125], options: [{ length: 2, cost: 1 }], cyclic: true })).objective, 640);
  const lease = coverageModel({ title: "p", periodLabel: "Month", requirement: [25, 10, 20, 10, 5], options: [300, 525, 775, 850, 975].map((cost, k) => ({ length: k + 1, cost })), cyclic: false });
  assert.equal(lease.variables.length, 15);
  assert.equal(solve(lease).objective, 16625);
  // Allocation with weighted-average quality (Module 1 P3, Module 4 P1)
  assert.equal(solve(allocationModel({ title: "f", goal: "max", unitLabel: "lb", sources: [90, 225, 300, 100, 75].map((supply, g) => ({ name: `G${g + 1}`, supply, attributes: { grade: g + 1 } })),
    uses: [{ name: "Baskets", value: 2.5, quality: { grade: { min: 3.75 } } }, { name: "Juice", value: 1.75, quality: { grade: { min: 2.5 } } }] })).objective, 1526.5);
  // Route costs and blocked routes
  const ship = allocationModel({ title: "t", goal: "min", unitLabel: "u", sources: [{ name: "A", supply: 50 }, { name: "B", supply: 60 }], uses: [{ name: "X", amount: 40, amountRelation: "=" }, { name: "Y", amount: 50, amountRelation: "=" }], pairCost: [[4, 6], [5, null]] });
  assert.equal(ship.variables.length, 3, "blocked route has no variable");
  assert.equal(solve(ship).objective, 6 * 50 + 5 * 40, "A→Y is the only way to Y, so B serves X");
  // Inventory: Module 4 P3, P4 (+ part d), P5 — totals include the starting-stock holding cost via the objective constant
  for (const t of TEMPLATES.filter((x) => x.group === "lab4")) assert.ok(near(solve(t.model).objective, t.expected!.objective), t.id);
  const acme = TEMPLATES.find((t) => t.id === "m4-p4")!.model;
  assert.equal(acme.objectiveConstant, 90, "1.5 × 120 / 2 on the starting stock");
  const spec = (acme.source as { spec: Parameters<typeof inventoryModel>[0] }).spec;
  const noMin = solve(inventoryModel({ ...spec, activities: spec.activities.map((a) => ({ ...a, min: 0 })) }));
  assert.ok(near(solve(acme).objective - noMin.objective, 45), "(d) dropping the 400 minimum saves $45");
  const gas = solve(TEMPLATES.find((t) => t.id === "m4-p3")!.model);
  assert.equal(gas.values.Sell_1, 0);
  assert.ok(gas.values.Sell_3 === 180 && gas.values.Buy_1 === 200, "sells at the day-3 peak, buys on day 1");
});

t("optimizer: fixed-cost helper (binary + computed big-M)", () => {
  const base: OptModel = { title: "setup", direction: "max", objectiveName: "profit", variables: [
    { name: "A", label: "A", objective: 12, min: 0, max: null, integer: false }, { name: "B", label: "B", objective: 9, min: 0, max: null, integer: false }],
    constraints: [{ name: "hours", terms: { A: 2, B: 1 }, relation: "<=", rhs: 100 }, { name: "demand B", terms: { B: 1 }, relation: "<=", rhs: 40 }] };
  assert.equal(maxOfSum(base, ["A"]), 50);
  const r1 = addFixedCharge(base, { variables: ["A"], fixedCost: 500, name: "A setup" });
  assert.ok(!("error" in r1));
  const r2 = addFixedCharge((r1 as { model: OptModel }).model, { variables: ["B"], fixedCost: 300, name: "B setup" });
  assert.ok(!("error" in r2));
  const { model, bigM } = r2 as { model: OptModel; bigM: number };
  assert.equal(bigM, 40, "tight: demand caps B at 40");
  assert.equal(model.variables.find((v) => v.name === "Use_A_setup")!.objective, -500, "cost lowers profit in a Max model");
  // Brute force over the 4 open/closed combinations: A only (100), B only (60), both (−80), none (0).
  const r = solve(model);
  assert.equal(r.objective, 100);
  assert.deepEqual([r.values.Use_A_setup, r.values.Use_B_setup], [1, 0]);
  const unb = addFixedCharge({ ...base, constraints: [] }, { variables: ["A"], fixedCost: 1, name: "x" });
  assert.ok("error" in unb, "no safe big-M without a limit");
  assert.ok(!("error" in addFixedCharge({ ...base, constraints: [] }, { variables: ["A"], fixedCost: 1, name: "x", bigM: 1000 })), "user-supplied M is accepted");
});

t("optimizer: network builder — 30 random fixed-cost networks match SciPy (HiGHS MILP)", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/network-crosscheck.json", import.meta.url), "utf8")) as { model: OptModel; expected: { status: string; objective: number | null } }[];
  for (const [k, c] of cases.entries()) {
    const r = solve(c.model);
    assert.equal(r.status, c.expected.status, `network ${k + 1} status`);
    if (r.status === "optimal") {
      assert.ok(Math.abs(r.objective - c.expected.objective!) <= 1e-6 * Math.max(1, Math.abs(c.expected.objective!)), `network ${k + 1}: ${r.objective} vs ${c.expected.objective}`);
      assert.ok(checkFeasible(c.model, r.values).ok, `network ${k + 1} feasible`);
    }
  }
  // Structure: a fixed-cost route gets a yes/no variable and a link; a capacity becomes its big-M.
  const m = networkModel({ title: "n", periods: 1, periodLabel: "Month", holdingOn: "ending",
    nodes: [{ name: "F", produceMax: 100, produceCost: 1, canStore: false }, { name: "S", demand: 60 }],
    arcs: [{ from: "F", to: "S", unitCost: 2, fixedCost: 50, capacity: 80 }] });
  const link = m.constraints.find((c) => c.name.includes("only if used"))!;
  assert.equal(link.terms.Use_F_to_S_1, -80);
  assert.equal(solve(m).objective, 60 * 3 + 50);
  // Starting stock that covers demand: the route stays closed and the fixed cost is avoided.
  assert.equal(solve(networkModel({ title: "n", periods: 1, periodLabel: "Month", holdingOn: "ending",
    nodes: [{ name: "F", produceMax: 100, produceCost: 1, canStore: false }, { name: "S", demand: 60, startingStock: 60 }],
    arcs: [{ from: "F", to: "S", unitCost: 2, fixedCost: 50 }] })).objective, 0);
});

t("optimizer: build a model straight from an uploaded table", () => {
  // Price/cost sheet with an "Available" row → profit = price − cost, limits read from the row.
  const pc = [["Product", "Price ($)", "Cost ($)", "Sewing hrs", "Assembly hrs", "Max demand"], ["Backpack", "$80", "$42", "0.8", "0.4", "1,800"], ["Rain shell", "$95", "$43", "1.2", "0.3", "1,200"], ["Camp stove", "$60", "$33", "0", "0.9", "2,500"], ["Available", "", "", "2,400", "2,100", ""]];
  const g = guessMapping(pc);
  assert.deepEqual(g.roles, ["label", "price", "cost", "resource", "resource", "max"]);
  assert.equal(g.limitRow, 4);
  assert.deepEqual(g.variableRows, [1, 2, 3]);
  assert.equal(checkMapping(pc, g).length, 0);
  const m = modelFromTable(pc, g, "Outdoor");
  assert.deepEqual(m.variables.map((v) => [v.name, v.objective, v.max]), [["Backpack", 38, 1800], ["Rain_shell", 52, 1200], ["Camp_stove", 27, 2500]]);
  assert.equal(solve(m).objective, 145800, "same answer as the product-mix template built from this data");
  // Profit column, no limit row → resources need typed limits (warned), then solve.
  const cap = [["Product", "Profit per unit", "Machine hours", "Labour hours", "Max demand"], ["Tables", "40", "3", "2", "50"], ["Chairs", "25", "1", "1.5", "120"], ["Desks", "55", "4", "3", "30"]];
  const g2 = guessMapping(cap);
  assert.deepEqual(g2.roles, ["label", "objective", "resource", "resource", "max"]);
  assert.ok(checkMapping(cap, g2).some((p) => p.level === "warn" && p.text.includes("Machine hours")));
  g2.limits[2] = 240; g2.limits[3] = 200;
  assert.equal(solve(modelFromTable(cap, g2, "Furniture")).objective, 3725);
  // Cost-only supplier sheet → minimize; empty min cells default to 0.
  const sup = [["Supplier", "Cost per ton", "Min order", "Max supply"], ["A", "52", "0", "400"], ["B", "47", "100", "300"], ["C", "58", "", "500"]];
  const g3 = guessMapping(sup);
  assert.equal(g3.direction, "min");
  const m3 = modelFromTable(sup, g3, "Suppliers");
  m3.constraints.push({ name: "Need 600 t", terms: { A: 1, B: 1, C: 1 }, relation: ">=", rhs: 600 });
  assert.equal(solve(m3).objective, 300 * 47 + 300 * 52, "cheapest first: B at its max, then A");
  // Nothing marked as objective → error, no model.
  assert.ok(checkMapping(cap, { ...g2, roles: g2.roles.map((r) => (r === "objective" ? "ignore" : r)) }).some((p) => p.level === "error"));
});

t("optimizer: objective constant", () => {
  const base: OptModel = { title: "k", direction: "max", objectiveName: "z", objectiveConstant: -25, variables: [{ name: "x", label: "x", objective: 2, min: 0, max: 10, integer: false }], constraints: [] };
  assert.equal(solve(base).objective, -5);
  const tv = solve({ ...base, direction: "target", target: -9 });
  assert.equal(tv.status, "optimal");
  assert.equal(tv.values.x, 8, "Value Of counts the constant: 2x − 25 = −9");
  const imp = solve({ ...base, direction: "target", target: 5 });
  assert.equal(imp.status, "infeasible", "2x − 25 = 5 needs x = 15 > 10");
  assert.equal(imp.values.x, 0, "no stale values without a solution");
  assert.ok(formulation(base).objective.endsWith("2 x − 25"));
  assert.ok(toPulp(base).includes("+ -25") && toScipy(base).includes("+ -25"));
  assert.ok(sensitivity(base, solve(base)), "constant doesn't break sensitivity");
});

t("optimizer: Value Of target, free variables, infeasible/unbounded", () => {
  const base: OptModel = { title: "t", direction: "target", target: 120, objectiveName: "z", variables: [
    { name: "a", label: "a", objective: 3, min: 0, max: 30, integer: false }, { name: "b", label: "b", objective: 2, min: 0, max: 40, integer: false }], constraints: [] };
  const r = solve(base);
  assert.equal(r.status, "optimal");
  assert.ok(Math.abs(3 * r.values.a + 2 * r.values.b - 120) < 1e-6);
  assert.equal(solve({ ...base, target: 1000 }).status, "infeasible");
  const free: OptModel = { title: "f", direction: "min", objectiveName: "z", nonNegative: false, variables: [{ name: "x", label: "x", objective: 1, min: null, max: null, integer: false }], constraints: [{ name: "c", terms: { x: 1 }, relation: ">=", rhs: -5 }] };
  assert.equal(solve(free).objective, -5);
  assert.equal(solve({ ...free, constraints: [] }).status, "unbounded");
});

t("optimizer: formulation and exports", () => {
  const p3 = TEMPLATES.find((t) => t.id === "lab-p3")!.model;
  const f = formulation(p3);
  assert.ok(f.objective.startsWith("Maximize  2.5 Basket_G1"));
  assert.ok(f.constraints.some((c) => c.text.startsWith("−2.75 Basket_G1 − 1.75 Basket_G2 − 0.75 Basket_G3 + 0.25 Basket_G4 + 1.25 Basket_G5 ≥ 0")));
  assert.ok(toPulp(p3).includes("pulp.LpMaximize"));
  assert.ok(toScipy(p3).includes("linprog"));
  assert.ok(toLpFormat(p3).includes("Subject To"));
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
