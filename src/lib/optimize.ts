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
const EPS = 1e-7;

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
    constraints[OBJ] = { equal: m.target ?? 0 };
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
  m.variables.forEach((v) => (values[v.name] = typeof r[v.name] === "number" ? round(r[v.name] as number) : 0));
  return values;
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
    const scale = Math.max(1, Math.abs(c.rhs));
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
  return errs;
}

export function solve(m: OptModel): OptResult {
  const hasIntegers = m.variables.some(isInteger);
  const r = run(m);
  const status: OptStatus = !r.feasible ? "infeasible" : r.bounded === false ? "unbounded" : "optimal";
  const values = valuesOf(m, r);
  const objective = status === "optimal" ? round(objectiveOf(m, values)) : 0;
  const constraints: ConstraintResult[] = m.constraints.map((c) => {
    const lhs = round(lhsOf(c, values));
    const slack = c.relation === "<=" ? c.rhs - lhs : c.relation === ">=" ? lhs - c.rhs : 0;
    return { name: c.name, lhs, rhs: c.rhs, relation: c.relation, slack: round(slack), binding: status === "optimal" && Math.abs(slack) <= 1e-6 * Math.max(1, Math.abs(c.rhs)) };
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
  const c = m.variables.map((v) => sign * v.objective);

  // ---- Dual: min b·y + Σ u·s − Σ l·t  s.t.  Aᵀy + s − t = c  (y sign by row type for a max primal)
  const dvars: Record<string, Record<string, number>> = {};
  const dcons: Record<string, { equal: number }> = {};
  const unrestricted: Record<string, 1> = {};
  m.variables.forEach((_, j) => (dcons[`v${j}`] = { equal: c[j] }));
  m.constraints.forEach((con, i) => {
    // ≤ row: y ≥ 0. ≥ row: y ≤ 0 → use y' = −y ≥ 0. = row: free.
    const flip = con.relation === ">=" ? -1 : 1;
    const col: Record<string, number> = { __dobj: flip * con.rhs };
    m.variables.forEach((v, j) => {
      const a = con.terms[v.name] ?? 0;
      if (a) col[`v${j}`] = flip * a;
    });
    dvars[`y${i}`] = col;
    if (con.relation === "=") unrestricted[`y${i}`] = 1;
  });
  m.variables.forEach((v, j) => {
    const lb = lowerBound(m, v), ub = upperBound(v);
    if (ub !== null) dvars[`s${j}`] = { __dobj: ub, [`v${j}`]: 1 };
    if (lb !== null) dvars[`t${j}`] = { __dobj: -lb, [`v${j}`]: -1 };
  });
  const dual = solver.Solve({ optimize: "__dobj", opType: "min", constraints: dcons, variables: dvars, unrestricted }) as RawResult;
  if (!dual.feasible) return null;
  const y = m.constraints.map((con, i) => {
    const raw = typeof dual[`y${i}`] === "number" ? (dual[`y${i}`] as number) : 0;
    return (con.relation === ">=" ? -raw : raw) * sign;
  });

  const scaleOf = (x: number) => Math.max(1, Math.abs(x));
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  /** Ranges are found numerically; snap to the simplest nearby decimal (84.00001 → 84) within 1 part per million. */
  const tidy = (v: number) => {
    if (!isFinite(v) || v === 0) return v;
    for (let k = 0; k <= 8; k++) {
      const c = Math.round(v * 10 ** k) / 10 ** k;
      if (Math.abs(c - v) <= 1e-6 * Math.max(1, Math.abs(v))) return c;
    }
    return v;
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
    return tidy(round(lo));
  };

  const constraints: ConSensitivity[] = m.constraints.map((con, i) => {
    const base = res.objective;
    const holds = (d: number) => {
      const r = run(m, { rhsDelta: { index: i, delta: d } });
      if (!r.feasible || r.bounded === false) return false;
      return same(objectiveOf(m, valuesOf(m, r)), base + y[i] * d);
    };
    return {
      name: con.name,
      value: res.constraints[i].lhs,
      shadowPrice: round(y[i]),
      rhs: con.rhs,
      allowIncrease: range(holds, 1, scaleOf(con.rhs)),
      allowDecrease: range(holds, -1, scaleOf(con.rhs)),
    };
  });

  let alternativeOptima = false;
  const variables: VarSensitivity[] = m.variables.map((v, j) => {
    const colDot = m.constraints.reduce((a, con, i) => a + (con.terms[v.name] ?? 0) * y[i], 0);
    const reducedCost = round(v.objective - colDot);
    const x = res.values[v.name];
    const lb = lowerBound(m, v), ub = upperBound(v);
    const atBound = (lb !== null && Math.abs(x - lb) < EPS) || (ub !== null && Math.abs(x - ub) < EPS);
    if (atBound && Math.abs(reducedCost) < 1e-9 && m.variables.length > 1) alternativeOptima = true;
    const holds = (d: number) => {
      const costs = m.variables.map((w, k) => w.objective + (k === j ? d : 0));
      const r = run(m, { costs });
      if (!r.feasible || r.bounded === false) return false;
      // The current solution must still be optimal under the new costs.
      return same(objectiveOf(m, valuesOf(m, r), costs), objectiveOf(m, res.values, costs));
    };
    return {
      name: v.name, label: v.label, value: x, reducedCost, objective: v.objective,
      allowIncrease: range(holds, 1, scaleOf(v.objective)),
      allowDecrease: range(holds, -1, scaleOf(v.objective)),
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
  const obj = linearText(m.variables.map((v) => [v.objective, sym(v)]));
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
  const objExpr = expr(m.variables.map((v) => [v.objective, v.name]));
  L.push(``, `# Objective: ${m.objectiveName}`);
  if (m.direction === "target") {
    L.push(`model += 0  # "Value Of" objective: any feasible point`, `model += (${objExpr} == ${fmt(m.target ?? 0)}, "Objective_target")`);
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
  if (m.direction === "target") { rowsEq.push(m.variables.map((v) => v.objective)); bEq.push(m.target ?? 0); }
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
    `    objective = ${m.direction === "target" ? `sum(a * x for a, x in zip(${arr(m.variables.map((v) => v.objective))}, res.x))` : `${sign === -1 ? "-" : ""}res.fun`}`,
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
  const L = [`\\ ${m.title} — generated by Fintel Hub`, m.direction === "min" ? "Minimize" : "Maximize", ` obj: ${m.direction === "target" ? "0" : expr(m.variables.map((v) => [v.objective, v.name]))}`, "Subject To"];
  m.constraints.forEach((c, i) => L.push(` c${i + 1}: ${expr(Object.entries(c.terms).map(([n, a]) => [a, n]))} ${c.relation === "=" ? "=" : c.relation} ${fmt(c.rhs)}`));
  if (m.direction === "target") L.push(` target: ${expr(m.variables.map((v) => [v.objective, v.name]))} = ${fmt(m.target ?? 0)}`);
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

