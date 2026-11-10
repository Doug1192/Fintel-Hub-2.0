import solver from "javascript-lp-solver";

export interface OptVariable {
  name: string;
  label: string;
  objective: number;
  min: number;
  max: number | null;
  integer: boolean;
}

export interface OptConstraint {
  name: string;
  terms: Record<string, number>;
  relation: "<=" | ">=" | "=";
  rhs: number;
}

export interface OptModel {
  title: string;
  direction: "max" | "min";
  objectiveName: string;
  variables: OptVariable[];
  constraints: OptConstraint[];
  notes?: string;
}

export interface OptResult {
  feasible: boolean;
  bounded: boolean;
  objective: number;
  values: Record<string, number>;
  constraints: { name: string; lhs: number; rhs: number; relation: string; slack: number; binding: boolean; shadow: number | null }[];
}

const OBJ = "__objective__";

function build(m: OptModel, rhsOverride?: { name: string; delta: number }) {
  const constraints: Record<string, { min?: number; max?: number; equal?: number }> = {};
  const variables: Record<string, Record<string, number>> = {};
  const ints: Record<string, 1> = {};
  m.variables.forEach((v) => {
    variables[v.name] = { [OBJ]: v.objective };
    if (v.integer) ints[v.name] = 1;
    const bmin = `__min_${v.name}`;
    constraints[bmin] = { min: v.min };
    variables[v.name][bmin] = 1;
    if (v.max !== null && v.max !== undefined && isFinite(v.max)) {
      const bmax = `__max_${v.name}`;
      constraints[bmax] = { max: v.max };
      variables[v.name][bmax] = 1;
    }
  });
  m.constraints.forEach((c, i) => {
    const key = `c${i}`;
    const rhs = c.rhs + (rhsOverride && rhsOverride.name === c.name ? rhsOverride.delta : 0);
    constraints[key] = c.relation === "<=" ? { max: rhs } : c.relation === ">=" ? { min: rhs } : { equal: rhs };
    for (const [vn, coef] of Object.entries(c.terms)) {
      if (variables[vn] && coef) variables[vn][key] = coef;
    }
  });
  return { optimize: OBJ, opType: m.direction, constraints, variables, ints };
}

function run(m: OptModel, rhsOverride?: { name: string; delta: number }) {
  const r = solver.Solve(build(m, rhsOverride)) as { feasible: boolean; bounded?: boolean; result: number; [k: string]: number | boolean | undefined };
  return r;
}

export function solve(m: OptModel): OptResult {
  const r = run(m);
  const values: Record<string, number> = {};
  m.variables.forEach((v) => (values[v.name] = typeof r[v.name] === "number" ? (r[v.name] as number) : 0));
  const objective = m.variables.reduce((a, v) => a + v.objective * values[v.name], 0);
  const hasInts = m.variables.some((v) => v.integer);
  const constraints = m.constraints.map((c) => {
    const lhs = Object.entries(c.terms).reduce((a, [vn, coef]) => a + coef * (values[vn] ?? 0), 0);
    const slack = c.relation === "<=" ? c.rhs - lhs : c.relation === ">=" ? lhs - c.rhs : 0;
    const binding = Math.abs(slack) < 1e-6 * Math.max(1, Math.abs(c.rhs));
    let shadow: number | null = null;
    if (r.feasible && !hasInts) {
      const step = Math.max(1, Math.abs(c.rhs) * 0.001);
      const r2 = run(m, { name: c.name, delta: step });
      if (r2.feasible) {
        const obj2 = m.variables.reduce((a, v) => a + v.objective * ((r2[v.name] as number) || 0), 0);
        shadow = (obj2 - objective) / step;
      }
    }
    return { name: c.name, lhs, rhs: c.rhs, relation: c.relation, slack, binding, shadow };
  });
  return { feasible: Boolean(r.feasible), bounded: r.bounded !== false, objective, values, constraints };
}

export const TEMPLATES: { id: string; label: string; model: OptModel }[] = [
  {
    id: "mix",
    label: "Product mix (maximise profit)",
    model: {
      title: "Product mix",
      direction: "max",
      objectiveName: "Monthly contribution profit ($)",
      variables: [
        { name: "trail_pack", label: "Trail backpack", objective: 38, min: 0, max: 1800, integer: true },
        { name: "rain_shell", label: "Rain shell jacket", objective: 52, min: 200, max: 1200, integer: true },
        { name: "camp_stove", label: "Camp stove", objective: 27, min: 0, max: 2500, integer: true },
      ],
      constraints: [
        { name: "Sewing hours", terms: { trail_pack: 0.8, rain_shell: 1.2, camp_stove: 0 }, relation: "<=", rhs: 2400 },
        { name: "Assembly hours", terms: { trail_pack: 0.4, rain_shell: 0.3, camp_stove: 0.9 }, relation: "<=", rhs: 2100 },
        { name: "Warehouse space (m³)", terms: { trail_pack: 0.05, rain_shell: 0.02, camp_stove: 0.04 }, relation: "<=", rhs: 150 },
      ],
    },
  },
  {
    id: "marketing",
    label: "Marketing budget allocation",
    model: {
      title: "Marketing budget allocation",
      direction: "max",
      objectiveName: "Expected gross profit from campaigns ($)",
      variables: [
        { name: "search", label: "Paid search ($)", objective: 1.9, min: 5000, max: 40000, integer: false },
        { name: "social", label: "Paid social ($)", objective: 1.6, min: 5000, max: 35000, integer: false },
        { name: "email", label: "Email & CRM ($)", objective: 3.1, min: 1000, max: 8000, integer: false },
        { name: "events", label: "Trade events ($)", objective: 1.3, min: 0, max: 30000, integer: false },
      ],
      constraints: [
        { name: "Total budget", terms: { search: 1, social: 1, email: 1, events: 1 }, relation: "<=", rhs: 75000 },
        { name: "Brand channels ≥ 30% of budget", terms: { search: -0.3, social: 0.7, email: -0.3, events: 0.7 }, relation: ">=", rhs: 0 },
      ],
    },
  },
  {
    id: "staffing",
    label: "Staffing plan (minimise cost)",
    model: {
      title: "Staffing plan",
      direction: "min",
      objectiveName: "Monthly labour cost ($)",
      variables: [
        { name: "full_time", label: "Full-time staff", objective: 6200, min: 10, max: null, integer: true },
        { name: "part_time", label: "Part-time staff", objective: 2700, min: 0, max: 25, integer: true },
        { name: "contractors", label: "Contractors", objective: 7400, min: 0, max: 10, integer: true },
      ],
      constraints: [
        { name: "Hours of work required", terms: { full_time: 160, part_time: 80, contractors: 150 }, relation: ">=", rhs: 5600 },
        { name: "Supervisor ratio (FT ≥ 40% of team)", terms: { full_time: 0.6, part_time: -0.4, contractors: -0.4 }, relation: ">=", rhs: 0 },
        { name: "Weekend coverage (PT + contractors)", terms: { part_time: 1, contractors: 1 }, relation: ">=", rhs: 8 },
      ],
    },
  },
];
