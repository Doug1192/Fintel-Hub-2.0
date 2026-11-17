"use client";

import clsx from "clsx";
import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Sparkles, UploadCloud, Wand2, X } from "lucide-react";
import { Badge, Button, Callout, Card, CardHeader, inputCls, Segmented } from "./ui";
import { checkMapping, guessMapping, modelFromTable, sheetRows, type ColumnRole, type TableMapping } from "@/lib/docToModel";
import type { OptModel, Relation } from "@/lib/optimize";
import type { VaultDoc } from "@/lib/types";

export interface DocSource { kind: "document"; spec: { docId: string; mapping: TableMapping } }

const ROLE_LABEL: Record<ColumnRole, string> = {
  ignore: "Ignore", label: "Name", objective: "Objective / unit", price: "Price / unit", cost: "Cost / unit",
  min: "Minimum", max: "Maximum", resource: "Resource used",
};
const ROLE_TONE: Partial<Record<ColumnRole, string>> = { label: "bg-slate-100", objective: "bg-emerald-50", price: "bg-emerald-50", cost: "bg-amber-50", min: "bg-sky-50", max: "bg-sky-50", resource: "bg-indigo-50" };
const small = clsx(inputCls.replace(/\bw-full\b/, ""), "h-8 text-[12px]");

/** Re-guess the mapping treating row `h` as the header (row indices stay relative to the full sheet). */
function guessFrom(rows: string[][], h: number): TableMapping {
  const g = guessMapping([rows[h] ?? [], ...rows.slice(h + 1)]);
  const shift = (i: number) => i + h;
  return { ...g, headerRow: h, variableRows: g.variableRows.map(shift), limitRow: g.limitRow === null ? null : shift(g.limitRow) };
}

export function DocModelWizard({ docs, initial, onGenerate, onAskAi, onUpload, aiAvailable, onClose }: {
  docs: VaultDoc[];
  initial: { docId: string; mapping?: TableMapping };
  /** Read and save a new file to the alias; returns the new document's id and its rows. */
  onUpload: (file: File) => Promise<{ docId: string; rows: string[][] }>;
  onGenerate: (m: OptModel, source: DocSource) => void;
  onAskAi?: (prompt: string) => Promise<void>;
  aiAvailable: boolean;
  onClose: () => void;
}) {
  const [docId, setDocId] = useState(initial.docId);
  const doc = docs.find((d) => d.id === docId) ?? docs[0];
  const rows = useMemo(() => (doc ? sheetRows(doc) : []), [doc]);
  const [mapping, setMapping] = useState<TableMapping>(() => initial.mapping && initial.docId === doc?.id ? initial.mapping : guessMapping(rows));
  const [mode, setMode] = useState<"table" | "ai">("table");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true); setUpErr(null);
    try {
      const { docId: id, rows: r } = await onUpload(file);
      if (!r.length) throw new Error(`Nothing readable was found in ${file.name}.`);
      setDocId(id);
      setMapping(guessMapping(r));
      setMode("table");
    } catch (e) { setUpErr((e as Error).message); } finally { setUploading(false); }
  };
  /** The drop zone shown at the top of the panel (and as the whole panel when there are no files yet). */
  const dropZone = (big: boolean) => (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }}
      className={clsx("flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-4 text-[12.5px] transition", big ? "justify-center py-10 text-center" : "py-2.5", drag ? "border-emerald-500 bg-emerald-50" : "border-slate-300")}
    >
      <UploadCloud className={clsx("text-emerald-600", big ? "h-8 w-8" : "h-5 w-5")} />
      <span className={big ? "w-full text-[14px] font-semibold" : "font-medium"}>{big ? "Drop your data file here" : "New file?"}</span>
      {big && <span className="w-full text-muted">CSV or Excel works best: one row per product or option, with its profit (or price and cost) and the resources it uses. It&apos;s saved to this alias and the vault automatically.</span>}
      <Button size="sm" variant={big ? "primary" : "secondary"} loading={uploading} onClick={() => fileInput.current?.click()}><UploadCloud className="h-3.5 w-3.5" />{big ? "Choose a file" : "Upload"}</Button>
      <input ref={fileInput} type="file" hidden accept=".csv,.tsv,.xlsx,.xls,.xlsm,.ods,.txt,.pdf" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} aria-label="Upload a data file to optimize" />
      {upErr && <span className="w-full text-[12px] text-bad">{upErr}</span>}
    </div>
  );
  const width = Math.max(0, ...rows.map((r) => r.length));
  const problems = useMemo(() => (rows.length ? checkMapping(rows, mapping) : []), [rows, mapping]);
  const model = useMemo(() => (rows.length && !problems.some((p) => p.level === "error") ? modelFromTable(rows, mapping, doc ? doc.name.replace(/\.[^.]+$/, "") : "Model") : null), [rows, mapping, problems, doc]);

  const pickDoc = (id: string) => {
    setDocId(id);
    const d = docs.find((x) => x.id === id);
    setMapping(guessMapping(d ? sheetRows(d) : []));
  };
  const setRole = (j: number, role: ColumnRole) => setMapping((m) => {
    const roles = m.roles.map((r, k) => (k === j ? role : role === "label" && r === "label" ? "ignore" : (["objective", "price", "cost", "min", "max"] as ColumnRole[]).includes(role) && r === role ? "ignore" : r));
    const limits = { ...m.limits };
    if (role === "resource" && limits[j] === undefined) limits[j] = m.limitRow !== null ? Number(String(rows[m.limitRow]?.[j] ?? "").replace(/[$,\s]/g, "")) || null : null;
    return { ...m, roles, limits };
  });
  const setLimitRow = (ri: number | null) => setMapping((m) => {
    const limits = { ...m.limits };
    m.roles.forEach((r, j) => { if (r === "resource") limits[j] = ri !== null ? Number(String(rows[ri]?.[j] ?? "").replace(/[$,\s]/g, "")) || null : limits[j] ?? null; });
    return { ...m, limitRow: ri, limits, variableRows: m.variableRows.filter((x) => x !== ri) };
  });
  const toggleRow = (ri: number) => setMapping((m) => ({ ...m, variableRows: m.variableRows.includes(ri) ? m.variableRows.filter((x) => x !== ri) : [...m.variableRows, ri].sort((a, b) => a - b) }));
  const resourceCols = mapping.roles.map((r, j) => (r === "resource" ? j : -1)).filter((j) => j >= 0);

  const askAi = async () => {
    if (!onAskAi || !doc) return;
    setBusy(true); setAiErr(null);
    try {
      const table = rows.slice(0, 60).map((r) => r.join("\t")).join("\n");
      await onAskAi(`${prompt.trim() || "Build the optimization model this data describes."}\n\nData from the uploaded file "${doc.name}" (tab-separated):\n${table}`);
    } catch (e) { setAiErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!doc) {
    return (
      <Card className="mb-5 overflow-hidden ring-2 ring-emerald-100">
        <CardHeader
          icon={<FileSpreadsheet className="h-4 w-4" />}
          title="Optimize a file"
          subtitle="Upload a data table and Fintel builds the optimization model from it. You check it, then solve."
          right={<button className="rounded p-1 text-slate-400 hover:text-ink" onClick={onClose} aria-label="Close document builder"><X className="h-4 w-4" /></button>}
        />
        <div className="p-5">{dropZone(true)}</div>
      </Card>
    );
  }

  return (
    <Card className="mb-5 overflow-hidden ring-2 ring-emerald-100">
      <CardHeader
        icon={<FileSpreadsheet className="h-4 w-4" />}
        title="Optimize a file"
        subtitle="Step 1: pick or upload the file. Step 2: check what Fintel read (colored column headings, ticked rows, limits). Step 3: Generate model, then Solve."
        right={<button className="rounded p-1 text-slate-400 hover:text-ink" onClick={onClose} aria-label="Close document builder"><X className="h-4 w-4" /></button>}
      />
      <div className="border-b border-line px-5 pt-3">{dropZone(false)}</div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-[12.5px]">
        <span className="text-muted">File</span>
        <select aria-label="Document" className={clsx(small, "w-64")} value={doc.id} onChange={(e) => pickDoc(e.target.value)}>{docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "table", label: "Map the table" }, { value: "ai", label: "Ask AI to build it", disabled: !aiAvailable }]} />
        {!aiAvailable && <span className="text-[11.5px] text-muted">AI building needs an Anthropic API key on the server.</span>}
      </div>

      {mode === "ai" ? (
        <div className="space-y-3 p-5 text-[12.5px]">
          <p className="text-muted">For layouts the table mapping can&apos;t handle (blends, networks, multi-period plans): describe the goal and Claude drafts the model from this document&apos;s data. Check it before relying on it.</p>
          <textarea aria-label="What to optimize" className={clsx(inputCls, "h-24 py-2")} placeholder="e.g. Maximize weekly profit. Machine time is limited to 240 hours and labour to 200 hours; meet at least half the demand for each product." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          {aiErr && <Callout tone="bad">{aiErr}</Callout>}
          <div className="flex justify-end"><Button size="sm" onClick={askAi} loading={busy}><Sparkles className="h-3.5 w-3.5" />Build with AI</Button></div>
        </div>
      ) : !rows.length ? (
        <div className="p-5"><Callout tone="warn">This document has no table to read. Upload a CSV or Excel sheet, or use “Ask AI to build it”.</Callout></div>
      ) : (
        <div className="space-y-4 p-5 text-[12.5px]">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented size="sm" value={mapping.direction} onChange={(d) => setMapping({ ...mapping, direction: d })} options={[{ value: "max", label: "Maximize" }, { value: "min", label: "Minimize" }]} />
            <label className="flex items-center gap-1.5"><span className="text-muted">Header is row</span>
              <input aria-label="Header row" type="number" min={1} max={rows.length} className={clsx(small, "w-16")} value={mapping.headerRow + 1} onChange={(e) => setMapping(guessFrom(rows, Math.max(0, Math.min(rows.length - 1, Number(e.target.value) - 1))))} />
            </label>
            <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-indigo-600" checked={mapping.integer} onChange={(e) => setMapping({ ...mapping, integer: e.target.checked })} />Whole numbers only</label>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th className="border-b border-line px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase text-muted">Use as</th>
                  {Array.from({ length: width }, (_, j) => (
                    <th key={j} className={clsx("border-b border-line px-1.5 py-1.5", ROLE_TONE[mapping.roles[j]])}>
                      <select aria-label={`Column ${j + 1} role`} className={clsx(small, "w-[132px] bg-white/80")} value={mapping.roles[j] ?? "ignore"} onChange={(e) => setRole(j, e.target.value as ColumnRole)}>
                        {(Object.keys(ROLE_LABEL) as ColumnRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => {
                  const isHeader = ri === mapping.headerRow, isLimit = ri === mapping.limitRow, isVar = mapping.variableRows.includes(ri);
                  return (
                    <tr key={ri} className={clsx("border-t border-line", isHeader && "bg-slate-50 font-semibold", isLimit && "bg-indigo-50/70", ri < mapping.headerRow && "opacity-40")}>
                      <td className="whitespace-nowrap px-2 py-1">
                        {isHeader ? <Badge>Header</Badge> : ri > mapping.headerRow ? (
                          <span className="inline-flex items-center gap-2">
                            <label className="inline-flex items-center gap-1" title="Use this row as a decision option"><input aria-label={`Row ${ri + 1} is a decision option`} type="checkbox" className="accent-indigo-600" checked={isVar} disabled={isLimit} onChange={() => toggleRow(ri)} />option</label>
                            <label className="inline-flex items-center gap-1" title="This row holds the resource limits"><input aria-label={`Row ${ri + 1} holds the limits`} type="radio" name="limitRow" className="accent-indigo-600" checked={isLimit} onChange={() => setLimitRow(isLimit ? null : ri)} onClick={() => isLimit && setLimitRow(null)} />limits</label>
                          </span>
                        ) : null}
                      </td>
                      {Array.from({ length: width }, (_, j) => <td key={j} className={clsx("whitespace-nowrap px-2 py-1", mapping.roles[j] !== "ignore" && !isHeader && ROLE_TONE[mapping.roles[j]] && "bg-opacity-40")}>{r[j] ?? ""}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {resourceCols.length > 0 && (
            <div>
              <div className="mb-1.5 font-semibold">Resource limits</div>
              <div className="flex flex-wrap gap-2">
                {resourceCols.map((j) => (
                  <label key={j} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5">
                    <span className="max-w-[160px] truncate">{rows[mapping.headerRow]?.[j] || `Column ${j + 1}`}</span>
                    <select aria-label={`${rows[mapping.headerRow]?.[j] ?? j} relation`} className={clsx(small, "w-14 px-1")} value={mapping.relations[j] ?? "<="} onChange={(e) => setMapping({ ...mapping, relations: { ...mapping.relations, [j]: e.target.value as Relation } })}><option value="<=">≤</option><option value=">=">≥</option><option value="=">=</option></select>
                    <input aria-label={`${rows[mapping.headerRow]?.[j] ?? j} limit`} type="number" className={clsx(small, "w-28", (mapping.limits[j] === null || mapping.limits[j] === undefined) && "border-amber-300 bg-amber-50")} placeholder="limit" value={mapping.limits[j] ?? ""} onChange={(e) => setMapping({ ...mapping, limits: { ...mapping.limits, [j]: e.target.value === "" ? null : Number(e.target.value) } })} />
                  </label>
                ))}
              </div>
            </div>
          )}
          {problems.map((p, i) => <Callout key={i} tone={p.level === "error" ? "bad" : "warn"}>{p.text}</Callout>)}
        </div>
      )}

      {mode === "table" && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-slate-50 px-5 py-3">
          <span className="text-[12.5px] text-muted">{model ? <>Will create <b className="text-ink">{model.variables.length}</b> decision variables and <b className="text-ink">{model.constraints.length}</b> constraints ({mapping.direction === "max" ? "maximize" : "minimize"} {model.objectiveName.toLowerCase()}).</> : "Fix the items above to continue."}</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!model} onClick={() => model && onGenerate(model, { kind: "document", spec: { docId: doc.id, mapping } })}><Wand2 className="h-3.5 w-3.5" />Generate model</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
