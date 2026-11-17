/**
 * Structured model builders. Each turns a compact, table-like description of a common model shape into a
 * complete (flat) OptModel, the way you'd write an indexed model in PuLP with loops over months or products.
 *
 *  1. inventoryModel  — activities over periods with stock carried between them (production, buy/sell, trading)
 *  2. allocationModel — sources × uses (blending, grading, transport), with weighted-average quality rules
 *  3. coverageModel   — options that start in a period and last several periods (leases, shifts)
 */
import { weightedAverageConstraint, type OptConstraint, type OptModel, type OptVariable, type Relation } from "./optimize";

const id = (s: string) => s.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "x";
/** A value per period: one number for every period, or a list (missing entries repeat the last). */
export type PerPeriod = number | number[];
export const at = (v: PerPeriod, t: number) => (Array.isArray(v) ? (v.length ? v[Math.min(t, v.length - 1)] : 0) : v);

/** Parse "3.06, 4.01 6.03\t4.06" or a single number. Empty → null. */
export function parsePerPeriod(text: string): PerPeriod | null {
  const parts = text.split(/[\s,;]+/).map((p) => p.replace(/[$£€]/g, "")).filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !isFinite(n))) return null;
  return nums.length === 1 ? nums[0] : nums;
}

export const formatPerPeriod = (v: PerPeriod | null | undefined) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v));

// ------------------------------------------------------------------------------------- 1. Inventory over time

export interface InventoryActivity {
  name: string; // e.g. "Produce", "Buy", "Sell"
  /** "in" adds to stock (produce, buy, inject); "out" removes from stock (sell, extract). */
  flow: "in" | "out";
  /** Money per unit in each period: a cost (paid) or revenue (received). */
  cash: "cost" | "revenue";
  amount: PerPeriod;
  min?: PerPeriod | null;
  max?: PerPeriod | null;
  /** Only stock on hand at the start of the period can be used (e.g. sell in the morning, buy in the evening). */
  fromStartingStock?: boolean;
}

export interface InventorySpec {
  title: string;
  periods: number;
  periodLabel: string; // "Month", "Day", "Week"
  goal: "max" | "min"; // maximize profit or minimize cost
  activities: InventoryActivity[];
  /** Fixed amount that leaves stock each period (customer demand). */
  demand?: PerPeriod | null;
  startingStock: number;
  minStock?: PerPeriod | null;
  maxStock?: PerPeriod | null;
  holdingCost: PerPeriod; // per unit per period
  /** "ending": cost on each period's ending stock; "average": on (beginning + ending) / 2. */
  holdingOn: "ending" | "average";
  integer?: boolean;
}

export function inventoryModel(s: InventorySpec): OptModel {
  const T = Math.max(1, Math.floor(s.periods));
  const sign = (cash: "cost" | "revenue") => (s.goal === "max" ? (cash === "revenue" ? 1 : -1) : cash === "cost" ? 1 : -1);
  const hold = s.goal === "max" ? -1 : 1; // holding is a cost
  const vars: OptVariable[] = [];
  const cons: OptConstraint[] = [];
  const inv = (t: number) => `Stock_${t}`;
  let constant = 0;
  for (let t = 0; t < T; t++) {
    const n = t + 1;
    for (const a of s.activities) {
      vars.push({
        name: `${id(a.name)}_${n}`,
        label: `${s.periodLabel} ${n} · ${a.name}`,
        objective: sign(a.cash) * at(a.amount, t),
        min: a.min === null || a.min === undefined ? 0 : at(a.min, t),
        max: a.max === null || a.max === undefined ? null : at(a.max, t),
        integer: Boolean(s.integer),
      });
    }
    // Holding cost: ending stock of period t is also the beginning stock of period t+1.
    const h = at(s.holdingCost, t);
    const hNext = t + 1 < T ? at(s.holdingCost, t + 1) : 0;
    const invCost = s.holdingOn === "ending" ? h : h / 2 + hNext / 2;
    vars.push({
      name: inv(n), label: `${s.periodLabel} ${n} · ending stock`,
      objective: hold * invCost,
      min: s.minStock === null || s.minStock === undefined ? 0 : at(s.minStock, t),
      max: s.maxStock === null || s.maxStock === undefined ? null : at(s.maxStock, t),
      integer: Boolean(s.integer),
    });
    // Balance: begin + in − out − demand = end
    const terms: Record<string, number> = { [inv(n)]: -1 };
    if (t > 0) terms[inv(t)] = 1;
    for (const a of s.activities) terms[`${id(a.name)}_${n}`] = a.flow === "in" ? 1 : -1;
    const d = s.demand === null || s.demand === undefined ? 0 : at(s.demand, t);
    cons.push({ name: `${s.periodLabel} ${n} stock balance`, terms, relation: "=", rhs: d - (t === 0 ? s.startingStock : 0), note: `stock at start + ${s.activities.filter((a) => a.flow === "in").map((a) => a.name).join(" + ") || "0"} − ${[...s.activities.filter((a) => a.flow === "out").map((a) => a.name), ...(d ? ["demand"] : [])].join(" − ") || "0"} = ending stock` });
    // Outflows limited to starting stock
    const early = s.activities.filter((a) => a.flow === "out" && a.fromStartingStock);
    if (early.length) {
      const t2: Record<string, number> = {};
      for (const a of early) t2[`${id(a.name)}_${n}`] = 1;
      if (t > 0) t2[inv(t)] = -1;
      cons.push({ name: `${s.periodLabel} ${n} ${early.map((a) => a.name).join("/")} ≤ starting stock`, terms: t2, relation: "<=", rhs: t === 0 ? s.startingStock : 0 });
    }
  }
  // The starting stock's share of period-1 holding cost is fixed: it goes into the objective constant.
  if (s.holdingOn === "average") constant += hold * (at(s.holdingCost, 0) / 2) * s.startingStock;
  return {
    title: s.title,
    direction: s.goal,
    objectiveName: s.goal === "max" ? "Profit" : "Total cost",
    nonNegative: true,
    objectiveConstant: constant || undefined,
    variables: vars,
    constraints: cons,
    notes: `Built with the inventory-over-time builder: ${T} ${s.periodLabel.toLowerCase()}s, starting stock ${s.startingStock}, holding cost on ${s.holdingOn === "average" ? "the average of beginning and ending stock" : "ending stock"}.${constant ? ` The holding cost of the starting stock (${Math.abs(constant)}) is a fixed amount, added as the objective constant.` : ""}`,
  };
}

// ------------------------------------------------------------------------------------- 2. Sources × uses

export interface AllocationSource {
  name: string;
  cost?: number; // per unit taken from this source
  supply?: number | null; // available
  supplyRelation?: Relation; // default "<="
  attributes?: Record<string, number>;
}

export interface AllocationUse {
  name: string;
  value?: number; // revenue / profit per unit delivered to this use
  amount?: number | null; // requirement
  amountRelation?: Relation; // default "="
  /** Weighted-average rules, e.g. { octane: { min: 90 } } */
  quality?: Record<string, { min?: number | null; max?: number | null }>;
}

export interface AllocationSpec {
  title: string;
  goal: "max" | "min";
  unitLabel: string; // e.g. "barrels (000s)"
  sources: AllocationSource[];
  uses: AllocationUse[];
  /** Extra per-unit cost of sending source i to use j (e.g. shipping); same orientation as sources × uses. */
  pairCost?: (number | null)[][];
  integer?: boolean;
}

export function allocationModel(s: AllocationSpec): OptModel {
  const v = (i: number, j: number) => `${id(s.sources[i].name)}_to_${id(s.uses[j].name)}`;
  const vars: OptVariable[] = [];
  const allowed = (i: number, j: number) => s.pairCost?.[i]?.[j] !== null; // null = route not available
  s.sources.forEach((src, i) => s.uses.forEach((use, j) => {
    if (!allowed(i, j)) return;
    const unit = (use.value ?? 0) - (src.cost ?? 0) - (s.pairCost?.[i]?.[j] ?? 0);
    vars.push({ name: v(i, j), label: `${src.name} → ${use.name}`, objective: s.goal === "max" ? unit : -unit, min: 0, max: null, integer: Boolean(s.integer) });
  }));
  const has = new Set(vars.map((x) => x.name));
  const cons: OptConstraint[] = [];
  s.sources.forEach((src, i) => {
    if (src.supply === null || src.supply === undefined) return;
    const terms = Object.fromEntries(s.uses.map((_, j) => v(i, j)).filter((n) => has.has(n)).map((n) => [n, 1]));
    cons.push({ name: `${src.name} supply`, terms, relation: src.supplyRelation ?? "<=", rhs: src.supply });
  });
  s.uses.forEach((use, j) => {
    const cols = s.sources.map((_, i) => i).filter((i) => has.has(v(i, j)));
    if (use.amount !== null && use.amount !== undefined) {
      cons.push({ name: `${use.name} requirement`, terms: Object.fromEntries(cols.map((i) => [v(i, j), 1])), relation: use.amountRelation ?? "=", rhs: use.amount });
    }
    for (const [attr, rule] of Object.entries(use.quality ?? {})) {
      const items = cols.map((i) => ({ variable: v(i, j), attribute: s.sources[i].attributes?.[attr] ?? 0 }));
      if (rule.min !== null && rule.min !== undefined) cons.push(weightedAverageConstraint(`${use.name} average ${attr} ≥ ${rule.min}`, items, ">=", rule.min, attr));
      if (rule.max !== null && rule.max !== undefined) cons.push(weightedAverageConstraint(`${use.name} average ${attr} ≤ ${rule.max}`, items, "<=", rule.max, attr));
    }
  });
  return {
    title: s.title,
    direction: s.goal,
    objectiveName: s.goal === "max" ? "Profit" : "Total cost",
    nonNegative: true,
    variables: vars,
    constraints: cons,
    notes: `Built with the sources × uses builder: one variable per ${s.sources.length} × ${s.uses.length} route (${s.unitLabel}). Each coefficient = ${s.goal === "max" ? "use value − source cost − route cost" : "source cost + route cost − use value"}. Quality rules are weighted averages written linearly.`,
  };
}

// ------------------------------------------------------------------------------------- 3. Coverage

export interface CoverageOption {
  length: number; // periods covered
  cost: number; // per unit started
}

export interface CoverageSpec {
  title: string;
  periodLabel: string;
  requirement: number[]; // per period
  options: CoverageOption[];
  /** true: periods wrap around (24-hour shifts, weekly rosters); false: options must end within the horizon. */
  cyclic: boolean;
  integer?: boolean;
  /** Optional names for the periods (e.g. "12 a.m.", "4 a.m."). */
  periodNames?: string[];
}

export function coverageModel(s: CoverageSpec): OptModel {
  const T = s.requirement.length;
  const pname = (t: number) => s.periodNames?.[t] ?? `${s.periodLabel} ${t + 1}`;
  const vars: OptVariable[] = [];
  const covers: Record<number, string[]> = {};
  for (let t = 0; t < T; t++) covers[t] = [];
  for (let start = 0; start < T; start++) {
    for (const o of s.options) {
      if (o.length < 1) continue;
      if (!s.cyclic && start + o.length > T) continue;
      const name = s.options.length > 1 ? `Start${start + 1}_Len${o.length}` : `Start${start + 1}`;
      vars.push({ name, label: `Start ${pname(start)}${s.options.length > 1 ? `, ${o.length} ${s.periodLabel.toLowerCase()}(s)` : ""}`, objective: o.cost, min: 0, max: null, integer: Boolean(s.integer) });
      for (let k = 0; k < o.length; k++) covers[(start + k) % T].push(name);
    }
  }
  const cons: OptConstraint[] = s.requirement.map((r, t) => {
    const terms: Record<string, number> = {};
    for (const n of covers[t]) terms[n] = (terms[n] ?? 0) + 1; // an option longer than the cycle can cover a period twice
    return { name: `${pname(t)} covered`, terms, relation: ">=" as const, rhs: r };
  });
  return {
    title: s.title,
    direction: "min",
    objectiveName: "Total cost",
    nonNegative: true,
    variables: vars,
    constraints: cons,
    notes: `Built with the coverage builder: an option can start in any ${s.periodLabel.toLowerCase()}${s.cyclic ? " and wraps around the cycle" : " and must end within the horizon"}; each ${s.periodLabel.toLowerCase()}'s requirement is met by every option active in it.`,
  };
}

// ------------------------------------------------------------------------------------- 4. Network over time

export interface NetworkNode {
  name: string;
  /** Production available here each period (blank = this node doesn't produce). */
  produceMax?: PerPeriod | null;
  produceCost?: PerPeriod | null;
  /** Units withdrawn here each period (customer demand). */
  demand?: PerPeriod | null;
  startingStock?: number;
  /** Holding cost per unit per period; blank or 0 = free storage. */
  holdingCost?: PerPeriod | null;
  maxStock?: PerPeriod | null;
  /** false = nothing can be kept here between periods (pure cross-dock). Default true. */
  canStore?: boolean;
}

export interface NetworkArc {
  from: string;
  to: string;
  unitCost?: PerPeriod | null;
  capacity?: PerPeriod | null;
  /** Fixed cost for each period the route is used (avoided when nothing is shipped). */
  fixedCost?: PerPeriod | null;
}

export interface NetworkSpec {
  title: string;
  periods: number;
  periodLabel: string;
  nodes: NetworkNode[];
  arcs: NetworkArc[];
  holdingOn: "ending" | "average";
  integer?: boolean;
}

const nz = (v: PerPeriod | null | undefined, t: number) => (v === null || v === undefined ? 0 : at(v, t));
const has = (v: PerPeriod | null | undefined) => v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : true);

/**
 * Minimum-cost flow over several periods with storage, production and optional fixed (per-use) route costs.
 * Balance at each node and period: stock at start + production + inflow − outflow − demand = ending stock.
 * A route with a fixed cost gets a binary "used" variable and the link flow ≤ M·used, where M is the most
 * the route could ever need to carry: its capacity, or everything that can exist in the network by then.
 */
export function networkModel(s: NetworkSpec): OptModel {
  const T = Math.max(1, Math.floor(s.periods));
  const nodeId = new Map(s.nodes.map((n) => [n.name, id(n.name)]));
  const vars: OptVariable[] = [];
  const cons: OptConstraint[] = [];
  let constant = 0;
  const arcName = (a: NetworkArc) => `${nodeId.get(a.from)}_to_${nodeId.get(a.to)}`;
  const stores = (n: NetworkNode) => n.canStore !== false;

  // Everything that can exist in the network up to and including period t (for safe big-M values).
  const unlimited = s.nodes.some((n) => has(n.produceMax) && !isFinite(at(n.produceMax as PerPeriod, 0)));
  const totalStart = s.nodes.reduce((a, n) => a + (n.startingStock ?? 0), 0);
  const totalDemand = Array.from({ length: T }, (_, t) => s.nodes.reduce((a, n) => a + nz(n.demand, t), 0)).reduce((a, b) => a + b, 0);
  const available = (t: number) => totalStart + Array.from({ length: t + 1 }, (_, k) => s.nodes.reduce((a, n) => a + (has(n.produceMax) ? nz(n.produceMax, k) : 0), 0)).reduce((a, b) => a + b, 0);

  for (let t = 0; t < T; t++) {
    const p = t + 1;
    for (const n of s.nodes) {
      const nid = nodeId.get(n.name)!;
      if (has(n.produceMax)) vars.push({ name: `Make_${nid}_${p}`, label: `${s.periodLabel} ${p} · produce at ${n.name}`, objective: nz(n.produceCost, t), min: 0, max: nz(n.produceMax, t), integer: Boolean(s.integer) });
      if (stores(n)) {
        const h = nz(n.holdingCost, t), hNext = t + 1 < T ? nz(n.holdingCost, t + 1) : 0;
        vars.push({ name: `Stock_${nid}_${p}`, label: `${s.periodLabel} ${p} · ending stock at ${n.name}`, objective: s.holdingOn === "ending" ? h : h / 2 + hNext / 2, min: 0, max: has(n.maxStock) ? nz(n.maxStock, t) : null, integer: Boolean(s.integer) });
      }
    }
    for (const a of s.arcs) {
      if (!nodeId.has(a.from) || !nodeId.has(a.to)) continue;
      const an = arcName(a);
      const cap = has(a.capacity) ? nz(a.capacity, t) : null;
      vars.push({ name: `Ship_${an}_${p}`, label: `${s.periodLabel} ${p} · ${a.from} → ${a.to}`, objective: nz(a.unitCost, t), min: 0, max: cap, integer: Boolean(s.integer) });
      const f = nz(a.fixedCost, t);
      if (f > 0) {
        const M = cap ?? (unlimited ? totalStart + totalDemand : available(t));
        vars.push({ name: `Use_${an}_${p}`, label: `${s.periodLabel} ${p} · use ${a.from} → ${a.to}? (yes = 1)`, objective: f, min: 0, max: 1, integer: false, binary: true });
        cons.push({ name: `${s.periodLabel} ${p} ${a.from} → ${a.to}: only if used`, terms: { [`Ship_${an}_${p}`]: 1, [`Use_${an}_${p}`]: -M }, relation: "<=", rhs: 0, note: `Fixed cost ${f} applies when anything ships: flow ≤ ${M} × used (M = ${cap !== null ? "route capacity" : unlimited ? "starting stock + total demand" : "all stock that can exist by then"})` });
      }
    }
    for (const n of s.nodes) {
      const nid = nodeId.get(n.name)!;
      const terms: Record<string, number> = {};
      if (stores(n)) { terms[`Stock_${nid}_${p}`] = -1; if (t > 0) terms[`Stock_${nid}_${t}`] = 1; }
      if (has(n.produceMax)) terms[`Make_${nid}_${p}`] = 1;
      for (const a of s.arcs) {
        if (!nodeId.has(a.from) || !nodeId.has(a.to)) continue;
        if (a.to === n.name) terms[`Ship_${arcName(a)}_${p}`] = (terms[`Ship_${arcName(a)}_${p}`] ?? 0) + 1;
        if (a.from === n.name) terms[`Ship_${arcName(a)}_${p}`] = (terms[`Ship_${arcName(a)}_${p}`] ?? 0) - 1;
      }
      const start = t === 0 && stores(n) ? n.startingStock ?? 0 : 0;
      const rhs = nz(n.demand, t) - start;
      if (!Object.keys(terms).length && rhs === 0) continue;
      cons.push({ name: `${s.periodLabel} ${p} balance at ${n.name}`, terms, relation: "=", rhs, note: "stock at start + produced + received − shipped − demand = ending stock" });
    }
  }
  if (s.holdingOn === "average") for (const n of s.nodes) if (stores(n)) constant += (nz(n.holdingCost, 0) / 2) * (n.startingStock ?? 0);
  return {
    title: s.title,
    direction: "min",
    objectiveName: "Total cost",
    nonNegative: true,
    objectiveConstant: constant || undefined,
    variables: vars,
    constraints: cons,
    notes: `Built with the network-over-time builder: ${s.nodes.length} locations, ${s.arcs.length} routes, ${T} ${s.periodLabel.toLowerCase()}s. Each location balances stock at start + produced + received − shipped − demand = ending stock. Routes with a fixed cost get a yes/no variable that must be 1 before anything ships.${constant ? ` Holding cost of the starting stock (${constant}) is the objective constant.` : ""}`,
  };
}
