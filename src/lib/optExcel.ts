import type * as XLSXNS from "xlsx";
import { lowerBound, upperBound, type OptModel, type OptResult, type Sensitivity } from "./optimize";

type XLSX = typeof XLSXNS;

/**
 * Build an Excel workbook that mirrors the model the way a Solver spreadsheet is laid out:
 * data rows, changing cells, a SUMPRODUCT objective and one row per constraint.
 * Solver's settings are stored as the same hidden sheet-level names Excel itself writes
 * (solver_opt, solver_adj, solver_lhsN / relN / rhsN …), so Data → Solver opens pre-filled.
 */
export function buildWorkbook(X: XLSX, m: OptModel, res: OptResult | null, sens: Sensitivity | null): XLSXNS.WorkBook {
  const n = m.variables.length;
  const col = (j: number) => X.utils.encode_col(2 + j); // variables start in column C
  const firstV = col(0), lastV = col(n - 1);
  const lhsCol = col(n), relCol = col(n + 1), rhsCol = col(n + 2);
  const ws: XLSXNS.WorkSheet = {};
  const put = (addr: string, cell: XLSXNS.CellObject) => (ws[addr] = cell);
  const s = (addr: string, v: string) => put(addr, { t: "s", v });
  const num = (addr: string, v: number) => put(addr, { t: "n", v });
  const fx = (addr: string, f: string, v: number) => put(addr, { t: "n", f, v });
  const value = (name: string) => res?.values[name] ?? 0;

  s("A1", `${m.title} — optimization model`);
  s("A2", "Built with Fintel Hub. Changing cells hold Fintel's optimal solution; open Data → Solver and click Solve to re-run it in Excel.");

  s("A4", "DECISION VARIABLES");
  s("B5", "Variable");
  s("B6", "ID");
  s("B7", "Objective coefficient");
  s("B8", "Lower bound");
  s("B9", "Upper bound");
  s("B10", "Decision (changing cells)");
  m.variables.forEach((v, j) => {
    const c = col(j);
    s(`${c}5`, v.label);
    s(`${c}6`, v.name);
    num(`${c}7`, v.objective);
    const lb = lowerBound(m, v), ub = upperBound(v);
    if (lb !== null) num(`${c}8`, lb); else s(`${c}8`, "none");
    if (ub !== null) num(`${c}9`, ub); else s(`${c}9`, "none");
    num(`${c}10`, value(v.name));
  });

  s("A12", "OBJECTIVE FUNCTION");
  s("B12", `${m.direction === "max" ? "Maximize" : m.direction === "min" ? "Minimize" : "Value of"}: ${m.objectiveName}`);
  fx("C12", `SUMPRODUCT(${firstV}7:${lastV}7,${firstV}10:${lastV}10)`, res?.objective ?? 0);
  if (m.direction === "target") { s("D12", "Target"); num("E12", m.target ?? 0); }

  s("A14", "CONSTRAINTS");
  s("B15", "Constraint");
  m.variables.forEach((v, j) => s(`${col(j)}15`, v.name));
  s(`${lhsCol}15`, "Used (LHS)");
  s(`${relCol}15`, "Relation");
  s(`${rhsCol}15`, "Limit (RHS)");
  m.constraints.forEach((c, i) => {
    const r = 16 + i;
    s(`B${r}`, c.name);
    m.variables.forEach((v, j) => num(`${col(j)}${r}`, c.terms[v.name] ?? 0));
    fx(`${lhsCol}${r}`, `SUMPRODUCT(${firstV}${r}:${lastV}${r},$${firstV}$10:$${lastV}$10)`, res?.constraints[i]?.lhs ?? 0);
    s(`${relCol}${r}`, c.relation === "<=" ? "<=" : c.relation === ">=" ? ">=" : "=");
    num(`${rhsCol}${r}`, c.rhs);
    if (c.note) s(`${X.utils.encode_col(n + 5)}${r}`, c.note);
  });

  // ---- Solver settings, in the format Excel stores them.
  const sheet = "'Model'!";
  const solverCons: { lhs: string; rel: number; rhs: string }[] = [];
  m.constraints.forEach((_, i) => {
    const r = 16 + i;
    solverCons.push({ lhs: `${sheet}$${lhsCol}$${r}`, rel: m.constraints[i].relation === "<=" ? 1 : m.constraints[i].relation === "=" ? 2 : 3, rhs: `${sheet}$${rhsCol}$${r}` });
  });
  m.variables.forEach((v, j) => {
    const c = col(j);
    const lb = lowerBound(m, v), ub = upperBound(v);
    if (lb !== null && (lb !== 0 || m.nonNegative === false)) solverCons.push({ lhs: `${sheet}$${c}$10`, rel: 3, rhs: `${sheet}$${c}$8` });
    if (ub !== null) solverCons.push({ lhs: `${sheet}$${c}$10`, rel: 1, rhs: `${sheet}$${c}$9` });
    if (v.binary) solverCons.push({ lhs: `${sheet}$${c}$10`, rel: 5, rhs: `"binary"` });
    else if (v.integer) solverCons.push({ lhs: `${sheet}$${c}$10`, rel: 4, rhs: `"integer"` });
  });

  const names: [string, string][] = [
    ["solver_opt", `${sheet}$C$12`],
    ["solver_typ", m.direction === "max" ? "1" : m.direction === "min" ? "2" : "3"],
    ["solver_val", String(m.direction === "target" ? m.target ?? 0 : 0)],
    ["solver_adj", `${sheet}$${firstV}$10:$${lastV}$10`],
    ["solver_num", String(solverCons.length)],
    ["solver_neg", m.nonNegative === false ? "2" : "1"],
    ["solver_eng", "2"], // Simplex LP
    ["solver_lin", "2"], // as in Excel-saved workbooks
    ["solver_ver", "3"],
    ["solver_cvg", "0.0001"], ["solver_drv", "1"], ["solver_est", "1"], ["solver_itr", "2147483647"], ["solver_mip", "2147483647"],
    ["solver_nod", "2147483647"], ["solver_pre", "0.000001"], ["solver_scl", "1"], ["solver_sho", "2"], ["solver_tim", "2147483647"],
    ["solver_tol", "0"], ["solver_rlx", "2"], ["solver_rbv", "1"], ["solver_mrt", "0.075"], ["solver_msl", "2"], ["solver_nwt", "1"],
    ["solver_ssz", "100"], ["solver_rsd", "0"], ["solver_mni", "30"],
  ];
  solverCons.forEach((c, k) => {
    names.push([`solver_lhs${k + 1}`, c.lhs], [`solver_rel${k + 1}`, String(c.rel)], [`solver_rhs${k + 1}`, c.rhs]);
  });

  // ---- Written setup, in case Solver isn't loaded or the names are ignored.
  let r = 18 + m.constraints.length;
  s(`A${r++}`, "SOLVER SETUP (Data → Solver)");
  s(`B${r++}`, `Set Objective: $C$12   To: ${m.direction === "max" ? "Max" : m.direction === "min" ? "Min" : `Value Of ${m.target ?? 0}`}`);
  s(`B${r++}`, `By Changing Variable Cells: $${firstV}$10:$${lastV}$10`);
  s(`B${r++}`, "Subject to the Constraints:");
  for (const c of solverCons) {
    const rel = ["", "<=", "=", ">=", "int", "bin"][c.rel];
    s(`C${r++}`, `${c.lhs.replace(sheet, "")} ${rel} ${c.rhs.replace(sheet, "").replace(/"/g, "")}`);
  }
  s(`B${r++}`, `Make Unconstrained Variables Non-Negative: ${m.nonNegative === false ? "unchecked" : "checked"}`);
  s(`B${r++}`, "Select a Solving Method: Simplex LP");

  ws["!ref"] = `A1:${X.utils.encode_col(Math.max(n + 5, 8))}${r}`;
  ws["!cols"] = [{ wch: 4 }, { wch: 30 }, ...m.variables.map(() => ({ wch: 14 })), { wch: 12 }, { wch: 9 }, { wch: 12 }];

  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, "Model");

  // ---- Answer report
  if (res) {
    const rows: (string | number)[][] = [
      [`${m.title} — answer report (Fintel Hub)`],
      [],
      ["Status", res.status],
      ["Objective", m.objectiveName, res.objective],
      [],
      ["Variable cells", "Label", "Final value", "Objective coefficient"],
      ...m.variables.map((v) => [v.name, v.label, res.values[v.name], v.objective]),
      [],
      ["Constraints", "Cell value", "Relation", "Limit", "Status", "Slack"],
      ...res.constraints.map((c) => [c.name, c.lhs, c.relation, c.rhs, c.binding ? "Binding" : "Not binding", c.slack]),
    ];
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), "Answer Report");
  }
  if (sens) {
    const inf = (v: number) => (isFinite(v) ? v : "1E+30");
    const rows: (string | number)[][] = [
      [`${m.title} — sensitivity report (Fintel Hub)`],
      [],
      ["Variable cells", "Final value", "Reduced cost", "Objective coefficient", "Allowable increase", "Allowable decrease"],
      ...sens.variables.map((v) => [v.label, v.value, v.reducedCost, v.objective, inf(v.allowIncrease), inf(v.allowDecrease)]),
      [],
      ["Constraints", "Final value", "Shadow price", "Constraint R.H. side", "Allowable increase", "Allowable decrease"],
      ...sens.constraints.map((c) => [c.name, c.value, c.shadowPrice, c.rhs, inf(c.allowIncrease), inf(c.allowDecrease)]),
    ];
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), "Sensitivity Report");
  }

  wb.Workbook = { Names: names.map(([Name, Ref]) => ({ Name, Ref, Sheet: 0, Hidden: true })) } as XLSXNS.WBProps;
  return wb;
}
