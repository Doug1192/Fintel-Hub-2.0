/**
 * Turn an uploaded table (e.g. a product / resource sheet) into an optimization model.
 *
 * Typical layout: one row per decision option (product, project, route…), a column with its profit or cost
 * (or price and cost columns), optional min / max columns, and one column per resource it uses. Resource
 * limits come from a row such as "Available" / "Capacity", or are typed in.
 */
import type { OptModel, OptVariable, Relation } from "./optimize";
import type { VaultDoc } from "./types";

export type ColumnRole = "ignore" | "label" | "objective" | "price" | "cost" | "min" | "max" | "resource";

export interface TableMapping {
  headerRow: number; // index into rows
  roles: ColumnRole[]; // one per column
  /** Rows (indices into rows, after the header) used as decision variables. */
  variableRows: number[];
  /** Row holding resource limits (e.g. "Available"), or null to type them. */
  limitRow: number | null;
  limits: Record<number, number | null>; // by column index (typed or read from limitRow)
  relations: Record<number, Relation>; // by column index, default "<="
  direction: "max" | "min";
  integer: boolean;
}

const num = (s: string | undefined) => {
  if (s === undefined) return null;
  const t = String(s).trim().replace(/[$£€,%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!t || t === "-") return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
};

const LIMIT_ROW = /\b(available|availability|capacity|limit|limits|max(imum)? available|total available|supply|budget|hours available|resources?)\b/i;
const OBJ = /\b(profit|margin|contribution|net|return|value|payoff|objective)\b/i;
const PRICE = /\b(price|revenue|selling|sales price|unit price)\b/i;
const COST = /\b(cost|expense|variable cost|unit cost)\b/i;
const MIN = /\b(min|minimum|at least|lower|required|demand min|contract)\b/i;
const MAX = /\b(max|maximum|demand|market|at most|upper|cap)\b/i;

export const sheetRows = (doc: VaultDoc): string[][] => {
  if (doc.preview?.length) return doc.preview;
  if (doc.items.length) return [["Line item", ...doc.periods], ...doc.items.map((it) => [it.name, ...it.values.map(String)])];
  return [];
};

/** Best guess at what each column and row means. Everything can be changed in the UI. */
export function guessMapping(rows: string[][]): TableMapping {
  const width = Math.max(0, ...rows.map((r) => r.length));
  // Header: first row where most filled cells are text.
  let headerRow = 0;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const filled = rows[i].filter((c) => String(c ?? "").trim() !== "");
    if (filled.length >= 2 && filled.filter((c) => num(c) === null).length >= filled.length * 0.6) { headerRow = i; break; }
  }
  const head = Array.from({ length: width }, (_, j) => String(rows[headerRow]?.[j] ?? "").trim());
  const body = rows.slice(headerRow + 1).map((r, k) => ({ r, i: headerRow + 1 + k })).filter(({ r }) => r.some((c) => String(c ?? "").trim() !== ""));
  const numericCol = (j: number) => body.filter(({ r }) => num(r[j]) !== null).length >= Math.max(1, body.length * 0.6);
  const roles: ColumnRole[] = head.map(() => "ignore");
  const labelCol = head.findIndex((_, j) => !numericCol(j) && body.some(({ r }) => String(r[j] ?? "").trim()));
  if (labelCol >= 0) roles[labelCol] = "label";
  let hasObj = false, hasPrice = false, hasCost = false;
  head.forEach((h, j) => {
    if (roles[j] !== "ignore" || !numericCol(j)) return;
    if (!hasObj && OBJ.test(h)) { roles[j] = "objective"; hasObj = true; }
    else if (!hasPrice && PRICE.test(h)) { roles[j] = "price"; hasPrice = true; }
    else if (!hasCost && COST.test(h) && !/hour|time|machine|labou?r/i.test(h)) { roles[j] = "cost"; hasCost = true; }
    else if (MIN.test(h) && !/minute/i.test(h)) roles[j] = "min";
    else if (MAX.test(h)) roles[j] = "max";
    else roles[j] = "resource";
  });
  // Price + cost without a profit column → profit = price − cost. A lone cost column → minimize cost.
  if (hasObj) head.forEach((_, j) => { if (roles[j] === "price" || roles[j] === "cost") roles[j] = "resource"; });
  const direction: "max" | "min" = hasObj || hasPrice ? "max" : hasCost ? "min" : "max";
  if (!hasObj && !hasPrice && !hasCost) {
    // No obvious objective: use the first numeric column and let the user confirm.
    const first = roles.findIndex((r) => r === "resource");
    if (first >= 0) roles[first] = "objective";
  }
  const limitIdx = body.find(({ r }) => labelCol >= 0 && LIMIT_ROW.test(String(r[labelCol] ?? "")))?.i ?? null;
  const limits: Record<number, number | null> = {};
  roles.forEach((role, j) => { if (role === "resource") limits[j] = limitIdx !== null ? num(rows[limitIdx][j]) : null; });
  const variableRows = body
    .filter(({ i, r }) => i !== limitIdx && !/^\s*(total|sum)\b/i.test(String(r[labelCol] ?? "")))
    .filter(({ r }) => roles.some((role, j) => (role === "objective" || role === "price" || role === "cost") && num(r[j]) !== null))
    .map(({ i }) => i);
  return { headerRow, roles, variableRows, limitRow: limitIdx, limits, relations: {}, direction, integer: false };
}

const ident = (s: string, used: Set<string>) => {
  let base = s.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "x";
  if (/^\d/.test(base)) base = "x_" + base;
  let id = base;
  for (let k = 2; used.has(id); k++) id = `${base}_${k}`;
  used.add(id);
  return id;
};

export interface MappingProblem { level: "error" | "warn"; text: string }

/** Problems that stop (error) or might mislead (warn) the generated model. */
export function checkMapping(rows: string[][], m: TableMapping): MappingProblem[] {
  const out: MappingProblem[] = [];
  const has = (r: ColumnRole) => m.roles.includes(r);
  if (!m.variableRows.length) out.push({ level: "error", text: "Tick at least one row to use as a decision option." });
  if (!has("objective") && !has("price") && !has("cost")) out.push({ level: "error", text: "Mark a column as Objective (profit or cost per unit), or as Price and/or Cost." });
  if (has("objective") && (has("price") || has("cost"))) out.push({ level: "warn", text: "Both an Objective column and Price/Cost columns are marked; Objective is used and Price/Cost are ignored." });
  const resources = m.roles.map((r, j) => (r === "resource" ? j : -1)).filter((j) => j >= 0);
  const missing = resources.filter((j) => m.limits[j] === null || m.limits[j] === undefined);
  if (missing.length) out.push({ level: "warn", text: `No limit for ${missing.map((j) => `“${rows[m.headerRow]?.[j] || `column ${j + 1}`}”`).join(", ")}: those columns won't constrain anything until you enter one.` });
  if (!resources.length && !has("max")) out.push({ level: "warn", text: "No resource columns or maximums: a Max problem will be unbounded." });
  return out;
}

export function modelFromTable(rows: string[][], m: TableMapping, title: string): OptModel {
  const head = rows[m.headerRow] ?? [];
  const col = (role: ColumnRole) => m.roles.indexOf(role);
  const labelCol = col("label"), objCol = col("objective"), priceCol = col("price"), costCol = col("cost"), minCol = col("min"), maxCol = col("max");
  const used = new Set<string>();
  const vars: (OptVariable & { row: number })[] = m.variableRows.map((ri) => {
    const r = rows[ri] ?? [];
    const label = labelCol >= 0 ? String(r[labelCol] ?? "").trim() || `Row ${ri + 1}` : `Row ${ri + 1}`;
    let coef = 0;
    if (objCol >= 0) coef = num(r[objCol]) ?? 0;
    else {
      const price = priceCol >= 0 ? num(r[priceCol]) ?? 0 : 0, cost = costCol >= 0 ? num(r[costCol]) ?? 0 : 0;
      coef = m.direction === "max" ? price - cost : priceCol >= 0 && costCol < 0 ? price : cost - price;
    }
    const lo = minCol >= 0 ? num(r[minCol]) : null, hi = maxCol >= 0 ? num(r[maxCol]) : null;
    return { row: ri, name: ident(label, used), label, objective: coef, min: lo ?? 0, max: hi, integer: m.integer };
  });
  const constraints = m.roles.flatMap((role, j) => {
    if (role !== "resource") return [];
    const limit = m.limits[j];
    if (limit === null || limit === undefined) return [];
    const terms: Record<string, number> = {};
    for (const v of vars) { const a = num(rows[v.row]?.[j]); if (a) terms[v.name] = a; }
    return [{ name: String(head[j] ?? `Column ${j + 1}`).trim() || `Column ${j + 1}`, terms, relation: m.relations[j] ?? ("<=" as Relation), rhs: limit }];
  });
  const objName = objCol >= 0 ? String(head[objCol] ?? "Objective").trim() : m.direction === "max" ? "Profit (price − cost)" : "Total cost";
  return {
    title,
    direction: m.direction,
    objectiveName: objName || (m.direction === "max" ? "Profit" : "Cost"),
    nonNegative: true,
    variables: vars.map(({ row: _row, ...v }) => v), // eslint-disable-line @typescript-eslint/no-unused-vars
    constraints,
    notes: `Built from the uploaded table: one decision variable per ticked row (${vars.length}), objective from ${objCol >= 0 ? `“${objName}”` : priceCol >= 0 && costCol >= 0 ? "price − cost" : priceCol >= 0 ? "price" : "cost"}, and one constraint per resource column with a limit (${constraints.length}).`,
  };
}
