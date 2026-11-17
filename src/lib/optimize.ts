/**
 * Linear / integer optimization engine, modelled on Excel Solver's Simplex LP:
 *   Set Objective (Max, Min or Value Of) · By Changing Variable Cells · Subject to the Constraints
 *   · "Make Unconstrained Variables Non-Negative".
 * Produces Answer- and Sensitivity-report style output.
 */
import solver from "javascript-lp-solver";

export type Relation = "<=" | ">=" | "=";

export interface OptVariable {
  /** Short identifier used in constraints (no spaces). */
  name: string;
  label: string;
  /** Objective coefficient: contribution of one unit to the objective. */
  objective: number;
  /** Lower bound. null = no lower bound (only when the model allows negative values). */
  min: number | null;
  /** Upper bound. null = no upper bound. */
  max: number | null;
  integer: boolean;
  binary?: boolean;
}

export interface OptConstraint {
  name: string;
  terms: Record<string, number>;
  relation: Relation;
  rhs: number;
  /** Plain-language form of a constraint that was linearised (e.g. a weighted average). */
  note?: string;
}

export interface OptModel {
  title: string;
  direction: "max" | "min" | "target";
  /** Objective value to hit when direction is "target" (Excel's "Value Of"). */
  target?: number;
  objectiveName: string;
  variables: OptVariable[];
  constraints: OptConstraint[];
  /** Excel's "Make Unconstrained Variables Non-Negative" (default on). */
  nonNegative?: boolean;
  /**
   * Fixed amount added to the objective that no decision changes, e.g. the holding cost of stock
   * already on hand. It shifts the reported objective but never the optimal plan.
   */
  objectiveConstant?: number;
  /** The builder description this model was generated from, so it can be reopened and edited. */
  source?: { kind: string; spec: unknown };
  notes?: string;
}

export type OptStatus = "optimal" | "infeasible" | "unbounded";

export interface ConstraintResult {
  name: string;
  lhs: number;
  rhs: number;
  relation: Relation;
  slack: number;
  binding: boolean;
}

export interface OptResult {
  status: OptStatus;
  /** Kept for older callers: status === "optimal". */
  feasible: boolean;
  bounded: boolean;
  objective: number;
  values: Record<string, number>;
  constraints: ConstraintResult[];
  hasIntegers: boolean;
}

const OBJ = "__objective__";

export const isInteger = (v: OptVariable) => v.integer || Boolean(v.binary);

/** Effective lower bound after applying the non-negativity option. */
export function lowerBound(m: OptModel, v: OptVariable): number | null {
  if (v.binary) return 0;
  if (v.min === null || v.min === undefined || !isFinite(v.min)) return m.nonNegative === false ? null : 0;
  return m.nonNegative === false ? v.min : Math.max(0, v.min);
}

export function upperBound(v: OptVariable): number | null {
  if (v.binary) return v.max === null || v.max === undefined ? 1 : Math.min(1, v.max);
  return v.max === null || v.max === undefined || !isFinite(v.max) ? null : v.max;
}

function round(v: number) {
  const r = Math.round(v * 1e9) / 1e9;
  return Math.abs(r) < 1e-9 ? 0 : r;
}

/** Remove float dust relative to the size of the numbers involved (e.g. 2.9999999999996 → 3). */
function clean(v: number, scale = Math.abs(v)) {
  if (!isFinite(v)) return v;
  if (Math.abs(v) <= 1e-10 * Math.max(1, scale)) return 0;
  const digits = Math.max(0, 12 - Math.ceil(Math.log10(Math.max(1, Math.abs(v)))));
  const r = Number(v.toFixed(Math.min(digits, 12)));
  return Math.abs(r - Math.round(r)) <= 1e-10 * Math.max(1, Math.abs(r)) ? Math.round(r) : r;
}

interface BuildOpts {
  costs?: number[];
  rhsDelta?: { index: number; delta: number };
}

function build(m: OptModel, o: BuildOpts = {}) {
  const constraints: Record<string, { min?: number; max?: number; equal?: number }> = {};
  const variables: Record<string, Record<string, number>> = {};
  const ints: Record<string, 1> = {};
  const unrestricted: Record<string, 1> = {};
  const costs = o.costs ?? m.variables.map((v) => v.objective);
  m.variables.forEach((v, j) => {
    variables[v.name] = { [OBJ]: costs[j] };
    if (isInteger(v)) ints[v.name] = 1;
    const lb = lowerBound(m, v);
    const ub = upperBound(v);
    if (lb === null) unrestricted[v.name] = 1;
    else if (lb !== 0) {
      constraints[`__lb_${j}`] = { min: lb };
      variables[v.name][`__lb_${j}`] = 1;
    }
    if (ub !== null) {
      constraints[`__ub_${j}`] = { max: ub };
      variables[v.name][`__ub_${j}`] = 1;
    }
  });
  m.constraints.forEach((c, i) => {
    const key = `c${i}`;
    const rhs = c.rhs + (o.rhsDelta && o.rhsDelta.index === i ? o.rhsDelta.delta : 0);
    constraints[key] = c.relation === "<=" ? { max: rhs } : c.relation === ">=" ? { min: rhs } : { equal: rhs };
    for (const [vn, coef] of Object.entries(c.terms)) {
      if (variables[vn] && coef) variables[vn][key] = (variables[vn][key] ?? 0) + coef;
    }
  });
  let opType: "max" | "min" = m.direction === "min" ? "min" : "max";
  let optimize = OBJ;
  if (m.direction === "target") {
    // "Value Of": the objective must equal the target; any feasible point will do.
    constraints[OBJ] = { equal: (m.target ?? 0) - (m.objectiveConstant ?? 0) };
    optimize = "__none__";
    opType = "max";
  }
  return { optimize, opType, constraints, variables, ints, unrestricted };
}

type RawResult = { feasible: boolean; bounded?: boolean; result: number; [k: string]: number | boolean | undefined };

function run(m: OptModel, o: BuildOpts = {}): RawResult {
  return solver.Solve(build(m, o)) as RawResult;
}

function valuesOf(m: OptModel, r: RawResult) {
  const values: Record<string, number> = {};
  m.variables.forEach((v) => (values[v.name] = typeof r[v.name] === "number" ? (r[v.name] as number) : 0));
  return values;
}

/** One linear row a·x (≤, ≥, =) b, covering constraints, bounds and integer fixes. */
interface Row { a: number[]; b: number; rel: Relation }

function rowsOf(m: OptModel, o: BuildOpts, x0: number[]): Row[] {
  const n = m.variables.length;
  const idx = new Map(m.variables.map((v, j) => [v.name, j]));
  const rows: Row[] = [];
  m.constraints.forEach((c, i) => {
    const a = new Array(n).fill(0);
    for (const [vn, coef] of Object.entries(c.terms)) {
      const j = idx.get(vn);
      if (j !== undefined) a[j] += coef;
    }
    rows.push({ a, b: c.rhs + (o.rhsDelta && o.rhsDelta.index === i ? o.rhsDelta.delta : 0), rel: c.relation });
  });
  if (m.direction === "target") {
    // "Value Of": Σ c·x + constant = target must hold at the polished point too.
    const costs = o.costs ?? m.variables.map((v) => v.objective);
    rows.push({ a: [...costs], b: (m.target ?? 0) - (m.objectiveConstant ?? 0), rel: "=" });
  }
  m.variables.forEach((v, j) => {
    const unit = () => { const a = new Array(n).fill(0); a[j] = 1; return a; };
    if (isInteger(v)) {
      rows.push({ a: unit(), b: Math.round(x0[j]), rel: "=" }); // integers stay where branch-and-bound put them
      return;
    }
    const lb = lowerBound(m, v), ub = upperBound(v);
    if (lb !== null) rows.push({ a: unit(), b: lb, rel: ">=" });
    if (ub !== null) rows.push({ a: unit(), b: ub, rel: "<=" });
  });
  return rows;
}

const rowScale = (r: Row, x: number[]) => Math.max(1, Math.abs(r.b), r.a.reduce((s, aj, j) => s + Math.abs(aj * x[j]), 0));
const rowValue = (r: Row, x: number[]) => r.a.reduce((s, aj, j) => s + aj * x[j], 0);

/**
 * The LP library is accurate to roughly 1e-8. An optimal LP solution is a vertex: the point where
 * n of the constraints/bounds hold with equality. We find those active rows and solve them exactly
 * (Gaussian elimination with pivoting), which removes round-off such as 480.00000004 and makes the
 * re-solves used for sensitivity ranging exact. Returns null when no unique vertex can be identified.
 */
function polish(m: OptModel, o: BuildOpts, x0: number[]): number[] | null {
  const n = m.variables.length;
  if (!n) return x0;
  const rows = rowsOf(m, o, x0);
  const cand = rows
    .map((r, i) => ({ r, i, gap: Math.abs(rowValue(r, x0) - r.b) / rowScale(r, x0) }))
    .filter((c) => c.r.rel === "=" || c.gap <= 1e-6)
    .sort((p, q) => (p.r.rel === "=" ? 0 : 1) - (q.r.rel === "=" ? 0 : 1) || p.gap - q.gap);
  // Greedy selection of n independent active rows; each kept row is reduced against earlier pivots.
  const piv: { v: number[]; b: number; col: number }[] = [];
  for (const { r } of cand) {
    if (piv.length === n) break;
    const v = [...r.a];
    let b = r.b;
    for (const p of piv) {
      const f = v[p.col];
      if (f !== 0) { for (let j = 0; j < n; j++) v[j] -= f * p.v[j]; b -= f * p.b; }
    }
    let col = -1, best = 0;
    const norm = Math.max(...r.a.map(Math.abs));
    for (let j = 0; j < n; j++) if (Math.abs(v[j]) > best) { best = Math.abs(v[j]); col = j; }
    if (col < 0 || best <= 1e-10 * norm) continue;
    const f = v[col];
    for (let j = 0; j < n; j++) v[j] /= f;
    piv.push({ v, b: b / f, col });
  }
  if (piv.length < n) return null;
  const x = new Array(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    const p = piv[k];
    let sum = p.b;
    for (let j = 0; j < n; j++) if (j !== p.col) sum -= p.v[j] * x[j];
    x[p.col] = sum;
  }
  for (let j = 0; j < n; j++) {
    const r = Math.round(x[j]);
    if (Math.abs(x[j] - r) <= 1e-9 * Math.max(1, Math.abs(x[j]))) x[j] = r;
  }
  // Accept only if feasible and at least as good as the solver's own point.
  for (const r of rows) {
    const g = rowValue(r, x) - r.b, tol = 1e-9 * rowScale(r, x);
    if ((r.rel === "<=" && g > tol) || (r.rel === ">=" && g < -tol) || (r.rel === "=" && Math.abs(g) > tol)) return null;
  }
  const costs = o.costs ?? m.variables.map((v) => v.objective);
  if (m.direction !== "target") {
    const sign = m.direction === "min" ? -1 : 1;
    const f0 = costs.reduce((s, c, j) => s + c * x0[j], 0), f1 = costs.reduce((s, c, j) => s + c * x[j], 0);
    if (sign * (f1 - f0) < -1e-7 * Math.max(1, Math.abs(f0))) return null;
  }
  return x;
}

type Solved = { status: OptStatus; values: Record<string, number> };

/** Solve, then polish the vertex to full floating-point accuracy. */
function solveRaw(m: OptModel, o: BuildOpts = {}): Solved {
  const r = run(m, o);
  const status: OptStatus = !r.feasible ? "infeasible" : r.bounded === false ? "unbounded" : "optimal";
  const raw = valuesOf(m, r);
  // Without an optimal solution the library's values are meaningless: report zeros, never stale numbers.
  if (status !== "optimal") return { status, values: Object.fromEntries(m.variables.map((v) => [v.name, 0])) };
  const x0 = m.variables.map((v) => raw[v.name]);
  const x = polish(m, o, x0) ?? x0;
  const values: Record<string, number> = {};
  m.variables.forEach((v, j) => (values[v.name] = Math.abs(x[j]) < 1e-12 ? 0 : x[j]));
  return { status, values };
}

export function lhsOf(c: OptConstraint, values: Record<string, number>) {
  return Object.entries(c.terms).reduce((a, [vn, coef]) => a + coef * (values[vn] ?? 0), 0);
}

export function objectiveOf(m: OptModel, values: Record<string, number>, costs?: number[]) {
  return m.variables.reduce((a, v, j) => a + (costs ? costs[j] : v.objective) * (values[v.name] ?? 0), 0);
}

/** Check a candidate solution against every constraint and bound (used to verify Excel's answers too). */
export function checkFeasible(m: OptModel, values: Record<string, number>, tol = 1e-6): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const v of m.variables) {
    const x = values[v.name] ?? 0;
    const lb = lowerBound(m, v), ub = upperBound(v);
    if (lb !== null && x < lb - tol) violations.push(`${v.label} is below its minimum (${x} < ${lb})`);
    if (ub !== null && x > ub + tol) violations.push(`${v.label} is above its maximum (${x} > ${ub})`);
    if (isInteger(v) && Math.abs(x - Math.round(x)) > 1e-6) violations.push(`${v.label} must be a whole number`);
  }
  for (const c of m.constraints) {
    const lhs = lhsOf(c, values);
    // Scale by the size of the terms too: Σ(grade − 3.75)·x ≥ 0 has a zero limit but large terms.
    const scale = Math.max(1, Math.abs(c.rhs), Object.entries(c.terms).reduce((a, [vn, coef]) => a + Math.abs(coef * (values[vn] ?? 0)), 0));
    if (c.relation === "<=" && lhs > c.rhs + tol * scale) violations.push(`${c.name}: ${round(lhs)} > ${c.rhs}`);
    if (c.relation === ">=" && lhs < c.rhs - tol * scale) violations.push(`${c.name}: ${round(lhs)} < ${c.rhs}`);
    if (c.relation === "=" && Math.abs(lhs - c.rhs) > tol * scale) violations.push(`${c.name}: ${round(lhs)} ≠ ${c.rhs}`);
  }
  return { ok: violations.length === 0, violations };
}

export function validateModel(m: OptModel): string[] {
  const errs: string[] = [];
  const names = new Set<string>();
  if (!m.variables.length) errs.push("Add at least one decision variable.");
  for (const v of m.variables) {
    if (!v.name) errs.push(`A variable has no ID.`);
    if (names.has(v.name)) errs.push(`Two variables share the ID "${v.name}".`);
    names.add(v.name);
    const lb = lowerBound(m, v), ub = upperBound(v);
    if (lb !== null && ub !== null && lb > ub) errs.push(`${v.label}: minimum (${lb}) is greater than maximum (${ub}).`);
    if (!isFinite(v.objective)) errs.push(`${v.label}: objective coefficient is not a number.`);
  }
  for (const c of m.constraints) {
    for (const vn of Object.keys(c.terms)) if (!names.has(vn) && c.terms[vn]) errs.push(`${c.name} refers to an unknown variable "${vn}".`);
    if (!isFinite(c.rhs)) errs.push(`${c.name}: limit is not a number.`);
  }
  if (m.direction === "target" && (m.target === undefined || !isFinite(m.target))) errs.push("Enter the objective value to reach.");
  if (m.objectiveConstant !== undefined && !isFinite(m.objectiveConstant)) errs.push("The objective constant is not a number.");
  return errs;
}

export function solve(m: OptModel): OptResult {
  const hasIntegers = m.variables.some(isInteger);
  const { status, values } = solveRaw(m);
  const objective = status === "optimal" ? clean(objectiveOf(m, values) + (m.objectiveConstant ?? 0)) : 0;
  const constraints: ConstraintResult[] = m.constraints.map((c) => {
    const exact = lhsOf(c, values);
    const scale = Math.max(1, Math.abs(c.rhs), Object.entries(c.terms).reduce((a, [vn, coef]) => a + Math.abs(coef * (values[vn] ?? 0)), 0));
    const slackExact = c.relation === "<=" ? c.rhs - exact : c.relation === ">=" ? exact - c.rhs : 0;
    const binding = status === "optimal" && Math.abs(slackExact) <= 1e-7 * scale;
    return { name: c.name, lhs: binding ? c.rhs : clean(exact, scale), rhs: c.rhs, relation: c.relation, slack: binding ? 0 : clean(slackExact, scale), binding };
  });
  return { status, feasible: status === "optimal", bounded: status !== "unbounded", objective, values, constraints, hasIntegers };
}

// ---------------------------------------------------------------- Sensitivity report

export interface VarSensitivity {
  name: string;
  label: string;
  value: number;
  reducedCost: number;
  objective: number;
  allowIncrease: number;
  allowDecrease: number;
}

export interface ConSensitivity {
  name: string;
  value: number;
  shadowPrice: number;
  rhs: number;
  allowIncrease: number;
  allowDecrease: number;
}

export interface Sensitivity {
  variables: VarSensitivity[];
  constraints: ConSensitivity[];
  /** True when another solution gives the same objective (a non-basic variable has zero reduced cost). */
  alternativeOptima: boolean;
}

/**
 * Shadow prices come from solving the dual LP (so they satisfy complementary slackness exactly);
 * allowable ranges are found by re-solving with the coefficient or right-hand side moved.
 * Like Excel, variable bounds are reported through reduced costs, not as constraints,
 * and no sensitivity report is produced for models with integer variables.
 */
export function sensitivity(m: OptModel, res: OptResult): Sensitivity | null {
  if (res.status !== "optimal" || res.hasIntegers || m.direction === "target") return null;
  const sign = m.direction === "min" ? -1 : 1; // work as a max problem
  const n = m.variables.length;

  // ---- Dual: min b·y + Σ u·s − Σ l·t  s.t.  Aᵀy + s − t = c. For a max primal: y ≥ 0 on ≤ rows,
  // y ≤ 0 on ≥ rows (stored as y' = −y ≥ 0) and free on = rows. Solved (and polished) like any model.
  /** Shadow prices (in the model's own objective units) for a given cost vector. */
  const dualY = (costs: number[]): number[] | null => {
    const dualVars: OptVariable[] = [];
    m.constraints.forEach((con, i) => {
      const flip = con.relation === ">=" ? -1 : 1;
      dualVars.push({ name: `y${i}`, label: `y${i}`, objective: flip * con.rhs, min: con.relation === "=" ? null : 0, max: null, integer: false });
    });
    m.variables.forEach((v, j) => {
      const lb = lowerBound(m, v), ub = upperBound(v);
      if (ub !== null) dualVars.push({ name: `s${j}`, label: `s${j}`, objective: ub, min: 0, max: null, integer: false });
      if (lb !== null) dualVars.push({ name: `t${j}`, label: `t${j}`, objective: -lb, min: 0, max: null, integer: false });
    });
    const names = new Set(dualVars.map((d) => d.name));
    const dualCons: OptConstraint[] = m.variables.map((v, j) => {
      const terms: Record<string, number> = {};
      m.constraints.forEach((con, i) => {
        const a = con.terms[v.name] ?? 0;
        if (a) terms[`y${i}`] = (con.relation === ">=" ? -1 : 1) * a;
      });
      if (names.has(`s${j}`)) terms[`s${j}`] = 1;
      if (names.has(`t${j}`)) terms[`t${j}`] = -1;
      return { name: `v${j}`, terms, relation: "=", rhs: sign * costs[j] };
    });
    const d = solveRaw({ title: "dual", direction: "min", objectiveName: "dual", nonNegative: false, variables: dualVars, constraints: dualCons });
    if (d.status !== "optimal") return null;
    return m.constraints.map((con, i) => (con.relation === ">=" ? -1 : 1) * (d.values[`y${i}`] ?? 0) * sign);
  };
  const costs0 = m.variables.map((v) => v.objective);
  const yy = dualY(costs0);
  if (!yy) return null;
  const y = yy;

  const base = objectiveOf(m, res.values);
  const scaleOf = (x: number) => Math.max(1, Math.abs(x));
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
  /** Snap a breakpoint to the simplest nearby decimal (83.99999999997 → 84) without rounding real repeating decimals. */
  const tidy = (v: number) => {
    if (!isFinite(v) || v === 0) return v;
    for (let k = 0; k <= 8; k++) {
      const c = Math.round(v * 10 ** k) / 10 ** k;
      if (Math.abs(c - v) <= 1e-9 * Math.max(1, Math.abs(v))) return c;
    }
    return clean(v);
  };
  /** Largest step in one direction for which `holds(step)` stays true (∞ if beyond 1e12). */
  const range = (holds: (d: number) => boolean, dir: 1 | -1, scale: number) => {
    let lo = 0;
    let hi = 0;
    for (let d = scale * 1e-4; d <= 1e12; d *= 4) {
      if (holds(dir * d)) lo = d;
      else { hi = d; break; }
    }
    if (!hi) return Infinity;
    if (!lo && !holds(dir * 1e-9 * scale)) return 0;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (holds(dir * mid)) lo = mid; else hi = mid;
    }
    return tidy(lo);
  };

  const xBase = m.variables.map((v) => res.values[v.name]);
  /**
   * Exact right-hand-side ranging (the simplex ratio test). Within its allowable range the optimal
   * vertex moves linearly with the RHS: x(d) = x0 + d·Δx. We measure Δx from one small, verified step,
   * then find the first row (constraint or bound) that the moving vertex would cross.
   */
  const rhsRange = (i: number, dir: 1 | -1): number => {
    const holdsAt = (d: number) => {
      const r = solveRaw(m, { rhsDelta: { index: i, delta: d } });
      return r.status === "optimal" && same(objectiveOf(m, r.values), base + y[i] * d) ? r : null;
    };
    const scale = scaleOf(m.constraints[i].rhs);
    let step = 0, probe: Solved | null = null;
    for (const f of [1e-4, 1e-6, 1e-8]) {
      probe = holdsAt(dir * f * scale);
      if (probe) { step = dir * f * scale; break; }
    }
    if (!probe) return 0;
    const dx = m.variables.map((v, j) => (probe!.values[v.name] - xBase[j]) / step);
    const rows = rowsOf(m, {}, xBase);
    let best = Infinity;
    rows.forEach((r, k) => {
      if (r.rel === "=") return;
      const isSelf = k === i;
      // slack(d) = s0 + d·ds, with slack ≥ 0 meaning the row is satisfied
      const sgn = r.rel === "<=" ? 1 : -1;
      const s0 = sgn * (r.b - rowValue(r, xBase));
      const ds = sgn * ((isSelf ? 1 : 0) - rowValue(r, dx)) * dir;
      const tol = 1e-9 * rowScale(r, xBase);
      if (ds >= -1e-12 * rowScale(r, xBase)) return; // slack grows or stays: never binds
      if (s0 <= tol) { best = 0; return; } // degenerate: already at the limit
      best = Math.min(best, s0 / -ds);
    });
    if (best === 0) return 0;
    // Confirm with a real re-solve just inside the breakpoint; fall back to bisection if it disagrees.
    if (isFinite(best) && !holdsAt(dir * best * (1 - 1e-4))) {
      return range((d) => Boolean(holdsAt(d)), dir, scale);
    }
    return isFinite(best) ? tidy(best) : Infinity;
  };

  const constraints: ConSensitivity[] = m.constraints.map((con, i) => ({
    name: con.name,
    value: res.constraints[i].lhs,
    shadowPrice: clean(y[i], Math.max(...m.variables.map((v) => Math.abs(v.objective)), 1)),
    rhs: con.rhs,
    allowIncrease: rhsRange(i, 1),
    allowDecrease: rhsRange(i, -1),
  }));

  /** Has the optimal vertex stayed exactly where it was? (polished values are exact, so this is crisp) */
  const sameVertex = (vals: Record<string, number>) =>
    m.variables.every((v, j) => Math.abs(vals[v.name] - xBase[j]) <= 1e-9 * Math.max(1, Math.abs(xBase[j])));

  const rcOf = (k: number, costs: number[], yv: number[]) =>
    costs[k] - m.constraints.reduce((a, con, i) => a + (con.terms[m.variables[k].name] ?? 0) * yv[i], 0);
  const lbs = m.variables.map((v) => lowerBound(m, v)), ubs = m.variables.map((v) => upperBound(v));
  const atLb = (k: number) => lbs[k] !== null && Math.abs(xBase[k] - lbs[k]!) <= 1e-9 * Math.max(1, Math.abs(xBase[k]));
  const atUb = (k: number) => ubs[k] !== null && Math.abs(xBase[k] - ubs[k]!) <= 1e-9 * Math.max(1, Math.abs(xBase[k]));
  const bindingRow = (i: number) => res.constraints[i].binding;

  /**
   * Exact objective-coefficient ranging (reduced-cost ratio test). Optimality requires, in max terms:
   * variables at a lower bound have reduced cost ≤ 0, at an upper bound ≥ 0, and shadow prices keep
   * their sign on binding ≤ / ≥ rows. Shadow prices move linearly with c_j: y(d) = y + d·w.
   */
  const costRange = (j: number, dir: 1 | -1, holds: (d: number) => boolean): number => {
    const scale = scaleOf(m.variables[j].objective);
    let w: number[] = m.constraints.map(() => 0);
    if (!atLb(j) && !atUb(j)) {
      const delta = dir * 1e-4 * scale;
      if (!holds(delta)) return range(holds, dir, scale);
      const y2 = dualY(costs0.map((c, k) => c + (k === j ? delta : 0)));
      if (!y2) return range(holds, dir, scale);
      w = y2.map((v, i) => (v - y[i]) / delta);
    }
    let best = Infinity;
    const limit = (value: number, rate: number, mustBe: "<=0" | ">=0") => {
      // value + d·rate must keep its sign as d grows in `dir`
      const r = rate * dir;
      const tol = 1e-10 * Math.max(1, Math.abs(value), scale);
      if (mustBe === "<=0" ? r <= tol : r >= -tol) return;
      const room = mustBe === "<=0" ? -value : value;
      if (room <= tol) { best = 0; return; }
      best = Math.min(best, room / Math.abs(r));
    };
    m.variables.forEach((_, k) => {
      const rc = rcOf(k, costs0, y) * sign; // in max terms
      const rate = (k === j ? 1 : 0) * sign - m.constraints.reduce((a, con, i) => a + (con.terms[m.variables[k].name] ?? 0) * w[i], 0) * sign;
      if (atLb(k) && !atUb(k)) limit(rc, rate, "<=0");
      else if (atUb(k) && !atLb(k)) limit(rc, rate, ">=0");
    });
    m.constraints.forEach((con, i) => {
      if (!bindingRow(i) || con.relation === "=") return;
      const yi = y[i] * sign, rate = w[i] * sign; // in max terms: ≤ rows need y ≥ 0, ≥ rows need y ≤ 0
      limit(yi, rate, con.relation === "<=" ? ">=0" : "<=0");
    });
    // Confirm against a real re-solve; degenerate or tied cases fall back to the search.
    // (checked a little inside the breakpoint: right at it, two vertices tie and either may come back)
    if (best === 0 || (isFinite(best) && !holds(dir * best * (1 - 1e-4)))) return range(holds, dir, scale);
    if (!isFinite(best) && !holds(dir * 1e6 * scale)) return range(holds, dir, scale);
    return isFinite(best) ? tidy(best) : Infinity;
  };

  let alternativeOptima = false;
  const variables: VarSensitivity[] = m.variables.map((v, j) => {
    const reducedCost = clean(rcOf(j, costs0, y), Math.max(1, Math.abs(v.objective)));
    const x = res.values[v.name];
    if ((atLb(j) || atUb(j)) && reducedCost === 0 && n > 1) alternativeOptima = true;
    const holds = (d: number) => {
      const costs = m.variables.map((w, k) => w.objective + (k === j ? d : 0));
      const r = solveRaw(m, { costs });
      if (r.status !== "optimal") return false;
      // The current solution must still be optimal: either the same vertex comes back, or another
      // vertex with exactly the same objective under the new costs (alternative optimum).
      return sameVertex(r.values) || Math.abs(objectiveOf(m, r.values, costs) - objectiveOf(m, res.values, costs)) <= 1e-11 * Math.max(1, Math.abs(base));
    };
    return {
      name: v.name, label: v.label, value: x, reducedCost, objective: v.objective,
      allowIncrease: costRange(j, 1, holds),
      allowDecrease: costRange(j, -1, holds),
    };
  });
  return { variables, constraints, alternativeOptima };
}

// ---------------------------------------------------------------- Constraint helpers (linearisation)

const fmt = (x: number) => String(Math.round(x * 1e6) / 1e6);
const relText: Record<Relation, string> = { "<=": "≤", ">=": "≥", "=": "=" };

/**
 * Weighted average of an attribute (quality grade, octane, …) across some variables:
 *   Σ aᵢxᵢ / Σ xᵢ ⋚ k   ⇔   Σ (aᵢ − k)·xᵢ ⋚ 0     (valid because Σ xᵢ ≥ 0)
 */
export function weightedAverageConstraint(name: string, items: { variable: string; attribute: number }[], relation: Relation, k: number, attributeLabel = "attribute"): OptConstraint {
  const terms: Record<string, number> = {};
  for (const it of items) terms[it.variable] = (terms[it.variable] ?? 0) + round(it.attribute - k);
  return { name, terms, relation, rhs: 0, note: `Weighted average ${attributeLabel} ${relText[relation]} ${fmt(k)}, written linearly as Σ(${attributeLabel} − ${fmt(k)})·x ${relText[relation]} 0` };
}

/** Share of a total: Σ subset ⋚ p · Σ all   ⇔   Σ (1[in subset] − p)·x ⋚ 0 */
export function shareConstraint(name: string, subset: string[], all: string[], relation: Relation, p: number): OptConstraint {
  const terms: Record<string, number> = {};
  for (const v of all) terms[v] = round((subset.includes(v) ? 1 : 0) - p);
  for (const v of subset) if (!(v in terms)) terms[v] = round(1 - p);
  return { name, terms, relation, rhs: 0, note: `${subset.join(" + ")} ${relText[relation]} ${fmt(p * 100)}% of (${all.join(" + ")})` };
}

/** Ratio between two quantities: A ⋚ k·B   ⇔   A − k·B ⋚ 0 */
export function ratioConstraint(name: string, a: string[], b: string[], relation: Relation, k: number): OptConstraint {
  const terms: Record<string, number> = {};
  for (const v of a) terms[v] = (terms[v] ?? 0) + 1;
  for (const v of b) terms[v] = round((terms[v] ?? 0) - k);
  return { name, terms, relation, rhs: 0, note: `${a.join(" + ")} ${relText[relation]} ${fmt(k)} × (${b.join(" + ")})` };
}

/**
 * The largest value Σ x can take in the model's feasible region, ignoring the objective (an LP relaxation:
 * integer/binary restrictions are dropped, which can only make the bound larger, so it stays safe).
 * Returns null when Σ x is unbounded.
 */
export function maxOfSum(m: OptModel, vars: string[]): number | null {
  const relaxed: OptModel = {
    ...m, direction: "max", target: undefined, objectiveConstant: undefined,
    variables: m.variables.map((v) => ({ ...v, objective: vars.includes(v.name) ? 1 : 0, integer: false, binary: false, min: v.binary ? 0 : v.min, max: v.binary ? 1 : v.max })),
  };
  const r = solveRaw(relaxed);
  if (r.status === "unbounded") return null;
  if (r.status !== "optimal") return 0;
  return vars.reduce((a, n) => a + (r.values[n] ?? 0), 0);
}

export interface FixedChargeResult {
  model: OptModel;
  bigM: number;
  /** How big-M was chosen, for display. */
  basis: string;
}

/**
 * Fixed cost that is paid only if an activity is used (a route shipped on, a plant opened, a machine set up):
 * adds a binary variable y with objective = fixed cost and the link Σ x ≤ M·y, so any positive x forces y = 1.
 * M is the largest Σ x the rest of the model allows (computed, not guessed), unless one is given.
 */
export function addFixedCharge(m: OptModel, opts: { variables: string[]; fixedCost: number; name: string; bigM?: number }): FixedChargeResult | { error: string } {
  if (!opts.variables.length) return { error: "Pick at least one variable." };
  const idBase = "Use_" + opts.name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  let yName = idBase || "Use";
  for (let k = 2; m.variables.some((v) => v.name === yName); k++) yName = `${idBase}_${k}`;
  let bigM = opts.bigM ?? NaN;
  let basis = "entered by you";
  if (!(bigM > 0)) {
    const ubs = opts.variables.map((n) => upperBoundOf(m, n));
    const lpMax = maxOfSum(m, opts.variables);
    const sumUb = ubs.every((u) => u !== null) ? (ubs as number[]).reduce((a, b) => a + b, 0) : null;
    const candidates = [lpMax, sumUb].filter((x): x is number => x !== null && isFinite(x));
    if (!candidates.length) return { error: "These variables have no upper limit in the model, so a safe big-M can't be worked out. Add a capacity or enter M yourself." };
    bigM = Math.min(...candidates);
    basis = bigM === lpMax ? "largest total the other constraints allow" : "sum of the variables' upper bounds";
    if (!(bigM > 0)) { bigM = 1; basis = "the variables can't be positive anyway"; }
  }
  const model: OptModel = {
    ...m,
    // The fixed cost is entered as a positive cost: it lowers profit in a Max model and adds to cost in a Min model.
    variables: [...m.variables, { name: yName, label: `${opts.name} used? (yes = 1)`, objective: m.direction === "max" ? -Math.abs(opts.fixedCost) : Math.abs(opts.fixedCost), min: 0, max: 1, integer: false, binary: true }],
    constraints: [...m.constraints, {
      name: `${opts.name}: only if used`,
      terms: { ...Object.fromEntries(opts.variables.map((n) => [n, 1])), [yName]: -bigM },
      relation: "<=", rhs: 0,
      note: `Fixed cost ${fmt(opts.fixedCost)} applies when ${opts.variables.join(" + ")} > 0: ${opts.variables.join(" + ")} ≤ ${fmt(bigM)} × ${yName} (big-M = ${basis})`,
    }],
  };
  return { model, bigM, basis };
}

function upperBoundOf(m: OptModel, name: string): number | null {
  const v = m.variables.find((x) => x.name === name);
  return v ? upperBound(v) : null;
}

// ---------------------------------------------------------------- Formulation & exports

function termText(coef: number, label: string, first: boolean) {
  const abs = Math.abs(coef);
  const sign = coef < 0 ? (first ? "−" : " − ") : first ? "" : " + ";
  return `${sign}${abs === 1 ? "" : fmt(abs) + " "}${label}`;
}

function linearText(terms: [number, string][]) {
  const nz = terms.filter(([c]) => c !== 0);
  if (!nz.length) return "0";
  return nz.map(([c, l], i) => termText(c, l, i === 0)).join("");
}

export interface Formulation {
  variables: string[];
  objective: string;
  constraints: { name: string; text: string; note?: string }[];
  bounds: string[];
}

/** The algebraic LP formulation (what part (a) of a modelling question asks for). */
export function formulation(m: OptModel): Formulation {
  const sym = (v: OptVariable) => v.name;
  const k = m.objectiveConstant ?? 0;
  const obj = linearText(m.variables.map((v) => [v.objective, sym(v)])) + (k ? ` ${k < 0 ? "−" : "+"} ${fmt(Math.abs(k))}` : "");
  const head = m.direction === "max" ? "Maximize" : m.direction === "min" ? "Minimize" : "Find values so that";
  const objective = m.direction === "target" ? `${head}  ${obj} = ${fmt(m.target ?? 0)}` : `${head}  ${obj}`;
  const constraints = m.constraints.map((c) => ({
    name: c.name,
    text: `${linearText(m.variables.map((v) => [c.terms[v.name] ?? 0, sym(v)]))} ${relText[c.relation]} ${fmt(c.rhs)}`,
    note: c.note,
  }));
  const bounds: string[] = [];
  for (const v of m.variables) {
    const lb = lowerBound(m, v), ub = upperBound(v);
    const kind = v.binary ? ", binary" : v.integer ? ", integer" : "";
    if (lb !== null && ub !== null) bounds.push(`${fmt(lb)} ≤ ${sym(v)} ≤ ${fmt(ub)}${kind}`);
    else if (lb !== null) bounds.push(`${sym(v)} ≥ ${fmt(lb)}${kind}`);
    else if (ub !== null) bounds.push(`${sym(v)} ≤ ${fmt(ub)} (free below)${kind}`);
    else bounds.push(`${sym(v)} free${kind}`);
  }
  return { variables: m.variables.map((v) => `${sym(v)} = ${v.label}`), objective, constraints, bounds };
}

const pyStr = (s: string) => JSON.stringify(s);
const pyNum = (x: number | null) => (x === null ? "None" : fmt(x));
const pyId = (s: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !["lambda", "def", "class", "if", "in", "is", "or", "and", "not", "for", "from", "import", "None", "True", "False"].includes(s) ? s : "v_" + s.replace(/\W/g, "_"));

/** A runnable PuLP script reproducing the model. */
export function toPulp(m: OptModel): string {
  const sense = m.direction === "min" ? "LpMinimize" : "LpMaximize";
  const L: string[] = [
    `# ${m.title} — generated by Fintel Hub`,
    `# pip install pulp`,
    `import pulp`,
    ``,
    `model = pulp.LpProblem(${pyStr(m.title.replace(/\s+/g, "_"))}, pulp.${sense})`,
    ``,
    ``,
    `def var(name, low, up, cat):`,
    `    """Create a variable in PuLP 4+ (model.add_variable) or PuLP 2.x (pulp.LpVariable)."""`,
    `    if hasattr(model, "add_variable"):`,
    `        return model.add_variable(name, lowBound=low, upBound=up, cat=cat)`,
    `    return pulp.LpVariable(name, lowBound=low, upBound=up, cat=cat)`,
    ``,
    ``,
    `# Decision variables`,
  ];
  for (const v of m.variables) {
    const cat = v.binary ? `"Binary"` : v.integer ? `"Integer"` : `"Continuous"`;
    L.push(`${pyId(v.name)} = var(${pyStr(v.name)}, ${pyNum(lowerBound(m, v))}, ${pyNum(upperBound(v))}, ${cat})  # ${v.label}`);
  }
  const expr = (pairs: [number, string][]) => pairs.filter(([c]) => c !== 0).map(([c, n]) => `${fmt(c)} * ${pyId(n)}`).join(" + ") || "0";
  const kConst = m.objectiveConstant ?? 0;
  const objExpr = expr(m.variables.map((v) => [v.objective, v.name])) + (kConst ? ` + ${fmt(kConst)}  # constant: fixed amount no decision changes` : "");
  L.push(``, `# Objective: ${m.objectiveName}`);
  if (m.direction === "target") {
    L.push(`model += 0  # "Value Of" objective: any feasible point`, `model += (${expr(m.variables.map((v) => [v.objective, v.name]))} == ${fmt((m.target ?? 0) - kConst)}, "Objective_target")`);
  } else L.push(`model += ${objExpr}`);
  L.push(``, `# Constraints`);
  m.constraints.forEach((c, i) => {
    const op = c.relation === "<=" ? "<=" : c.relation === ">=" ? ">=" : "==";
    if (c.note) L.push(`# ${c.note}`);
    L.push(`model += (${expr(Object.entries(c.terms).map(([n, a]) => [a, n]))} ${op} ${fmt(c.rhs)}, ${pyStr(`C${i + 1}_` + c.name.replace(/\W+/g, "_"))})`);
  });
  L.push(
    ``,
    `# Use whichever solver is installed: CBC ships with PuLP 2.x; for PuLP 4+ run "pip install highspy".`,
    `for solver_name in ("PULP_CBC_CMD", "HiGHS", "HiGHS_CMD"):`,
    `    solver_class = getattr(pulp, solver_name, None)`,
    `    if solver_class is not None and solver_class(msg=False).available():`,
    `        result = model.solve(solver_class(msg=False))`,
    `        break`,
    `else:`,
    `    raise RuntimeError("No LP solver found: pip install highspy")`,
    ``, `status_names = getattr(pulp, "LpStatus", {1: "Optimal", 0: "Not Solved", -1: "Infeasible", -2: "Unbounded", -3: "Undefined"})`, `code = getattr(result, "status", result)  # PuLP 4 returns a stats object, PuLP 2 an int`, `code = getattr(code, "value", code)`, `print("Status:", status_names.get(int(code), code))`, `print("Objective (${m.objectiveName.replace(/"/g, "'")}):", pulp.value(model.objective))`, `for v in model.variables():`, `    print(f"  {v.name} = {v.varValue}")`);
  return L.join("\n") + "\n";
}

/** A runnable SciPy (HiGHS) script reproducing the model. */
export function toScipy(m: OptModel): string {
  const sign = m.direction === "min" ? 1 : -1; // linprog minimises
  const rowsUb: number[][] = [], bUb: number[] = [], rowsEq: number[][] = [], bEq: number[] = [];
  for (const c of m.constraints) {
    const row = m.variables.map((v) => c.terms[v.name] ?? 0);
    if (c.relation === "<=") { rowsUb.push(row); bUb.push(c.rhs); }
    else if (c.relation === ">=") { rowsUb.push(row.map((a) => -a)); bUb.push(-c.rhs); }
    else { rowsEq.push(row); bEq.push(c.rhs); }
  }
  const kc = m.objectiveConstant ?? 0;
  if (m.direction === "target") { rowsEq.push(m.variables.map((v) => v.objective)); bEq.push((m.target ?? 0) - kc); }
  const arr = (a: number[]) => `[${a.map(fmt).join(", ")}]`;
  const mat = (r: number[][]) => (r.length ? `[\n    ${r.map(arr).join(",\n    ")},\n]` : "None");
  const cost = m.direction === "target" ? m.variables.map(() => 0) : m.variables.map((v) => sign * v.objective);
  const integrality = m.variables.map((v) => (isInteger(v) ? 1 : 0));
  return [
    `# ${m.title} — generated by Fintel Hub`,
    `# pip install scipy`,
    `from scipy.optimize import linprog`,
    ``,
    `names = [${m.variables.map((v) => pyStr(v.name)).join(", ")}]`,
    `labels = [${m.variables.map((v) => pyStr(v.label)).join(", ")}]`,
    `c = ${arr(cost)}  # ${m.direction === "max" ? "negated for maximization" : m.direction === "target" ? "no objective (Value Of)" : "minimize"}`,
    `A_ub = ${mat(rowsUb)}`,
    `b_ub = ${rowsUb.length ? arr(bUb) : "None"}`,
    `A_eq = ${mat(rowsEq)}`,
    `b_eq = ${rowsEq.length ? arr(bEq) : "None"}`,
    `bounds = [${m.variables.map((v) => `(${pyNum(lowerBound(m, v))}, ${pyNum(upperBound(v))})`).join(", ")}]`,
    `integrality = ${arr(integrality)}`,
    ``,
    `res = linprog(c, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq, bounds=bounds, integrality=integrality, method="highs")`,
    `print("Status:", res.message)`,
    `if res.status == 0:`,
    `    objective = ${m.direction === "target" ? `sum(a * x for a, x in zip(${arr(m.variables.map((v) => v.objective))}, res.x))` : `${sign === -1 ? "-" : ""}res.fun`}${kc ? ` + ${fmt(kc)}  # objective constant` : ""}`,
    `    print("Objective (${m.objectiveName.replace(/"/g, "'")}):", round(objective, 6))`,
    `    for name, label, x in zip(names, labels, res.x):`,
    `        print(f"  {name} ({label}) = {round(x, 6)}")`,
    ``,
  ].join("\n");
}

/** CPLEX LP format, readable by most solvers (Gurobi, CPLEX, HiGHS, GLPK, CBC). */
export function toLpFormat(m: OptModel): string {
  const id = (s: string) => s.replace(/[^A-Za-z0-9_.]/g, "_");
  const expr = (pairs: [number, string][]) => pairs.filter(([c]) => c !== 0).map(([c, n], i) => `${c < 0 ? "- " : i ? "+ " : ""}${fmt(Math.abs(c))} ${id(n)}`).join(" ") || "0";
  const L = [`\\ ${m.title} — generated by Fintel Hub`, ...(m.objectiveConstant ? [`\\ Objective constant ${fmt(m.objectiveConstant)} not included below: add it to the reported objective`] : []), m.direction === "min" ? "Minimize" : "Maximize", ` obj: ${m.direction === "target" ? "0" : expr(m.variables.map((v) => [v.objective, v.name]))}`, "Subject To"];
  m.constraints.forEach((c, i) => L.push(` c${i + 1}: ${expr(Object.entries(c.terms).map(([n, a]) => [a, n]))} ${c.relation === "=" ? "=" : c.relation} ${fmt(c.rhs)}`));
  if (m.direction === "target") L.push(` target: ${expr(m.variables.map((v) => [v.objective, v.name]))} = ${fmt((m.target ?? 0) - (m.objectiveConstant ?? 0))}`);
  L.push("Bounds");
  for (const v of m.variables) {
    const lb = lowerBound(m, v), ub = upperBound(v);
    L.push(` ${lb === null ? "-inf" : fmt(lb)} <= ${id(v.name)} <= ${ub === null ? "+inf" : fmt(ub)}`);
  }
  const ints = m.variables.filter((v) => v.integer && !v.binary).map((v) => id(v.name));
  const bins = m.variables.filter((v) => v.binary).map((v) => id(v.name));
  if (ints.length) L.push("General", " " + ints.join(" "));
  if (bins.length) L.push("Binary", " " + bins.join(" "));
  L.push("End");
  return L.join("\n") + "\n";
}

