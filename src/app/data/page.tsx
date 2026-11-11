"use client";

import clsx from "clsx";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, Database, Download, FileSpreadsheet, FileText, FolderPlus, Link2Off, RotateCcw, Search, Sparkles, Trash2, UploadCloud, Wand2 } from "lucide-react";
import { Badge, Button, Callout, Card, CardHeader, Field, inputCls, NumInput, PageHeader, Segmented } from "@/components/ui";
import { useActiveAlias, useAliasDocs, useDataset, useStore } from "@/store/useStore";
import { parseTable, parseText, toLineItems, type ParsedStatement } from "@/lib/parse";
import { downloadText, fileToBase64, readCsv, readPdfText, readXlsx } from "@/lib/fileReaders";
import { CATEGORY_META, CATEGORY_ORDER, MODULE_PRESETS, type Category, type LineItem, type VaultDoc } from "@/lib/types";
import { detectDocType, docById, DOC_TYPES } from "@/lib/documents";
import { fmtMoney, periodLabel, uid } from "@/lib/format";
import { postAi, useAiStatus } from "@/components/useAi";
import { PreviewTable } from "@/components/PreviewTable";
import { periodsPerYear } from "@/lib/finance";

interface Pending {
  file: File;
  parsed: ParsedStatement;
  items: LineItem[];
  docKind: string;
  via: "parser" | "ai";
  notes?: string;
  company?: string;
  preview?: string[][];
  /** Keep only as reference data (no statement lines), e.g. a capacity sheet for the Optimizer. */
  asReference: boolean;
}

/** A table with no period columns where rows hold several numbers looks like data, not a statement. */
const looksLikeDataTable = (parsed: ParsedStatement, preview?: string[][]) =>
  parsed.layout === "single" && Boolean(preview && preview.slice(1).filter((r) => r.filter((c) => c.trim() !== "" && !isNaN(Number(c.replace(/[$,%()]/g, "")))).length >= 2).length >= 2);

const VAULT = "__vault__";

const toPreview = (rows: unknown[][]) =>
  rows.filter((r) => r && r.some((c) => c !== null && c !== undefined && String(c).trim() !== "")).slice(0, 60).map((r) => r.slice(0, 16).map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));

interface AiExtract {
  company: string;
  granularity: "month" | "quarter" | "year";
  periods: string[];
  lines: { name: string; category: Category; group: string; values: number[] }[];
  notes: string;
}

const TEMPLATE = `Account,2025-01,2025-02,2025-03,2025-04,2025-05,2025-06
Product sales,120000,118000,131000,136000,142000,139000
Service revenue,22000,23500,24100,25000,24800,26200
Interest income,400,410,395,420,430,440
Cost of goods sold,54000,53100,58900,61200,63900,62500
Sales commissions,4200,4130,4585,4760,4970,4865
Shipping & delivery,5100,5000,5600,5800,6050,5950
Salaries & wages,38000,38000,38000,39500,39500,39500
Rent,9500,9500,9500,9500,9500,9500
Insurance,1200,1200,1200,1200,1200,1200
Software subscriptions,1800,1800,1850,1850,1900,1900
Advertising & marketing,6000,5500,7200,7000,7400,7100
Depreciation,2500,2500,2500,2500,2500,2500
Interest expense,900,890,880,870,860,850
Income tax expense,4100,3900,4800,5000,5400,5200
`;

export default function DataPage() {
  const ds = useDataset();
  const alias = useActiveAlias();
  const aliasDocs = useAliasDocs();
  const { aliases, docs, loadSample, clear, updateLine, removeLine, setMeta, addDoc, attachDoc, detachDoc, createAlias, setActiveAlias } = useStore();
  const ai = useAiStatus();
  const [target, setTarget] = useState<string>(alias?.id ?? VAULT);
  const targetRef = useRef(target);
  targetRef.current = target;
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState(MODULE_PRESETS[0].id);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "warn" | "bad"; text: string; aliasId?: string } | null>(null);
  const [pickDoc, setPickDoc] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [filter, setFilter] = useState<Category | "all" | "low">("all");
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const aiOn = Boolean(ai?.configured && useAi);

  async function handleFiles(files: FileList | File[]) {
    setError(null);
    const list = [...files];
    for (const file of list) {
      setBusy(`Reading ${file.name}…`);
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        let parsed: ParsedStatement | null = null;
        let sample = "";
        let via: Pending["via"] = "parser";
        let notes: string | undefined;
        let company: string | undefined;
        let preview: string[][] | undefined;
        const isPdf = ext === "pdf" || file.type === "application/pdf";
        const isImg = /^image\//.test(file.type);

        if ((isPdf || isImg) && aiOn) {
          setBusy(`AI is reading ${file.name}… (this can take a minute)`);
          const res = await postAi<AiExtract>("/api/ai/extract", { filename: file.name, mediaType: isPdf ? "application/pdf" : file.type, data: await fileToBase64(file) });
          parsed = { periods: res.periods, granularity: res.granularity, lines: res.lines.map((l) => ({ name: l.name, values: l.values })), warnings: [], layout: "wide" };
          const items: LineItem[] = res.lines.map((l) => ({ id: uid("ln"), name: l.name, category: l.category, group: l.group || CATEGORY_META[l.category].short, values: res.periods.map((_, i) => l.values[i] ?? 0), confidence: 0.9, source: file.name }));
          setPending((p) => [...p, { file, parsed: parsed!, items, docKind: detectDocType(file.name, res.lines.map((l) => l.name).join(" ")), via: "ai", notes: res.notes, company: res.company, asReference: !items.length }]);
          continue;
        }
        if (isImg) throw new Error("Images need the AI engine to read them. Add an API key, or upload CSV, Excel or PDF.");
        if (ext === "csv" || ext === "tsv" || file.type === "text/csv") {
          const rows = await readCsv(file);
          sample = rows.slice(0, 40).map((r) => r.join(" ")).join("\n");
          preview = toPreview(rows);
          parsed = parseTable(rows);
        } else if (["xlsx", "xls", "xlsm", "ods"].includes(ext)) {
          const { rows } = await readXlsx(file);
          sample = rows.slice(0, 40).map((r) => r.join(" ")).join("\n");
          preview = toPreview(rows);
          parsed = parseTable(rows);
        } else if (isPdf) {
          const text = await readPdfText(file);
          sample = text;
          if (!text.trim()) throw new Error("This PDF has no text layer (it may be scanned). Turn on AI extraction to read it.");
          preview = toPreview(text.split(/\r?\n/).map((l) => l.split(/\t| {2,}/)));
          parsed = parseText(text);
        } else {
          const text = await file.text();
          sample = text;
          preview = toPreview(text.split(/\r?\n/).map((l) => l.split(/\t| {2,}|,/)));
          if (aiOn && text.length > 0) {
            setBusy(`AI is reading ${file.name}…`);
            const res = await postAi<AiExtract>("/api/ai/extract", { filename: file.name, text });
            parsed = { periods: res.periods, granularity: res.granularity, lines: res.lines.map((l) => ({ name: l.name, values: l.values })), warnings: [], layout: "wide" };
            via = "ai";
            notes = res.notes;
            company = res.company;
          } else parsed = parseText(text);
        }
        if (!parsed.lines.length && !preview?.length) throw new Error(`Nothing readable was found in ${file.name}.`);

        const destAlias = useStore.getState().aliases.find((a) => a.id === targetRef.current);
        const statementFree = Boolean(destAlias && !destAlias.modules.some((m) => m !== "optimize"));
        const asReference = !parsed.lines.length || looksLikeDataTable(parsed, preview) || statementFree;
        setPending((p) => [...p, { file, parsed: parsed!, items: toLineItems(parsed!, file.name), docKind: detectDocType(file.name, sample), via, notes, company, preview, asReference }]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setBusy(null);
  }

  function commit(p: Pending) {
    const doc: VaultDoc = {
      id: uid("doc"),
      name: p.file.name,
      size: p.file.size,
      kind: p.docKind,
      addedAt: new Date().toISOString(),
      via: p.via,
      periods: p.parsed.periods,
      granularity: p.parsed.granularity,
      items: p.asReference ? [] : p.items,
      preview: p.preview,
      notes: p.notes,
    };
    const aliasId = target === VAULT ? null : target;
    const dest = aliases.find((a) => a.id === aliasId);
    const r = addDoc(doc, aliasId, mode);
    setPending((list) => list.filter((x) => x !== p));
    if (!r.ok) setNotice({ tone: "bad", text: `${r.error} The file was saved to the General Vault instead.` });
    else if (!dest) setNotice({ tone: "good", text: `"${doc.name}" was saved to the General Vault. Assign it to an alias any time from Aliases & Vault.` });
    else setNotice({ tone: r.warnings.length ? "warn" : "good", text: `"${doc.name}" was added to ${dest.name}.${r.warnings.length ? " " + r.warnings.join(" ") : ""}`, aliasId: dest.id });
    if (mode === "replace") setMode("merge");
  }

  function makeAlias() {
    const preset = MODULE_PRESETS.find((x) => x.id === newPreset)!;
    const id = createAlias(newName || "New alias", preset.modules, undefined, !alias);
    setTarget(id);
    setNewName("");
    setShowNew(false);
  }

  const vaultOnly = docs.filter((d) => !aliases.some((a) => a.docIds.includes(d.id)));
  const otherDocs = alias ? docs.filter((d) => !alias.docIds.includes(d.id)) : [];

  const counts = useMemo(() => {
    const m = new Map<Category, number>();
    ds.lines.forEach((l) => m.set(l.category, (m.get(l.category) ?? 0) + 1));
    return m;
  }, [ds.lines]);

  const n = periodsPerYear(ds.granularity);
  const shown = ds.lines.filter((l) =>
    (filter === "all" || (filter === "low" ? l.confidence < 0.6 : l.category === filter)) && (!q || l.name.toLowerCase().includes(q.toLowerCase()) || l.group.toLowerCase().includes(q.toLowerCase())),
  );
  const lowCount = ds.lines.filter((l) => l.confidence < 0.6).length;

  const exportCsv = () => {
    const head = ["Account", "Category", "Group", ...ds.periods].join(",");
    const body = ds.lines.map((l) => [JSON.stringify(l.name), CATEGORY_META[l.category].short, JSON.stringify(l.group), ...l.values].join(",")).join("\n");
    downloadText(`${ds.company.replace(/\W+/g, "_")}_classified.csv`, head + "\n" + body);
  };

  return (
    <>
      <PageHeader
        eyebrow="Data"
        title="Statements & data"
        subtitle="Upload income statements, P&L exports, ledgers or any supporting file (CSV, Excel, PDF). Choose an alias for each upload so different analyses never mix, or keep it in the General Vault until you decide. Fintel Hub pulls out revenue and other income and sorts every expense into fixed or variable."
        right={
          <>
            <Button variant="secondary" size="sm" onClick={() => downloadText("fintel-hub-template.csv", TEMPLATE)}><Download className="h-3.5 w-3.5" />CSV template</Button>
            {alias && <Button variant="secondary" size="sm" onClick={() => { if (confirm(`Replace the data in “${alias.name}” with the demo company?`)) loadSample(); }}><RotateCcw className="h-3.5 w-3.5" />Load demo</Button>}
            {alias && <Button variant="danger" size="sm" onClick={() => { if (confirm(`Remove all statement data from “${alias.name}”? Documents stay in the vault.`)) clear(); }}><Trash2 className="h-3.5 w-3.5" />Clear alias</Button>}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Card
            className={clsx("border-2 border-dashed transition", drag ? "border-brand bg-brand-soft/60" : "border-slate-300")}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-dashed border-slate-300 px-5 py-3 text-[13px]">
              <span className="font-semibold text-ink">Save uploads to</span>
              <select aria-label="Upload destination" className="h-9 min-w-[220px] rounded-lg border border-line bg-white px-2 text-[13px] font-medium" value={target} onChange={(e) => setTarget(e.target.value)}>
                <optgroup label="Aliases">
                  {aliases.map((a) => <option key={a.id} value={a.id}>{a.name}{a.id === alias?.id ? " (current)" : ""}</option>)}
                </optgroup>
                <option value={VAULT}>General Vault (no alias yet)</option>
              </select>
              <Button size="sm" variant="secondary" onClick={() => setShowNew((v) => !v)}><FolderPlus className="h-3.5 w-3.5" />New alias</Button>
              {target !== VAULT && (
                <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "merge", label: "Add to alias data" }, { value: "replace", label: "Replace alias data" }]} />
              )}
            </div>
            {showNew && (
              <div className="grid gap-2 border-b border-dashed border-slate-300 bg-slate-50/70 px-5 py-3 sm:grid-cols-[1fr_200px_auto]">
                <input autoFocus className={inputCls} placeholder="Alias name, e.g. “Q3 board pack” or “Plant 2 product mix”" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && makeAlias()} />
                <select className={inputCls} value={newPreset} onChange={(e) => setNewPreset(e.target.value)} aria-label="What is this alias for?">
                  {MODULE_PRESETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <Button onClick={makeAlias}>Create</Button>
                <p className="text-[11.5px] text-muted sm:col-span-3">{MODULE_PRESETS.find((x) => x.id === newPreset)?.description}</p>
              </div>
            )}
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand"><UploadCloud className="h-7 w-7" /></div>
              <div>
                <div className="text-base font-semibold">Drop statements here or <button className="text-brand underline-offset-2 hover:underline" onClick={() => input.current?.click()}>browse</button></div>
                <div className="mt-1 text-[13px] text-muted">CSV, XLSX/XLS, PDF, TXT{ai?.configured ? ", or images (with AI)" : ""}. Multi-period (months, quarters, years) or single-period statements.</div>
              </div>
              <input ref={input} type="file" multiple hidden accept=".csv,.tsv,.xlsx,.xls,.xlsm,.ods,.pdf,.txt,image/*" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-[12px]">
                {ai?.configured ? (
                  <label className="inline-flex items-center gap-1.5 text-muted">
                    <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} className="accent-indigo-600" />
                    <Sparkles className="h-3.5 w-3.5 text-brand" /> AI extraction for PDFs & text
                  </label>
                ) : (
                  <span className="text-muted">AI extraction is off (no API key). Using the built-in parser.</span>
                )}
              </div>
              {busy && <div className="mt-2 flex items-center gap-2 text-[13px] font-medium text-brand"><span className="h-2 w-2 animate-ping rounded-full bg-brand" />{busy}</div>}
            </div>
          </Card>

          {error && <Callout tone="bad" title="Couldn't import a file">{error}</Callout>}
          {notice && (
            <Callout tone={notice.tone}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{notice.text}</span>
                <span className="flex gap-2">
                  {notice.aliasId && notice.aliasId !== alias?.id && <Button size="sm" variant="secondary" onClick={() => setActiveAlias(notice.aliasId!)}>Open that alias</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button>
                </span>
              </div>
            </Callout>
          )}

          {pending.map((p, idx) => (
            <Card key={idx} className="overflow-hidden ring-2 ring-indigo-100">
              <CardHeader
                icon={p.file.name.match(/\.pdf$/i) ? <FileText className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}
                title={<span className="flex items-center gap-2">Review import: {p.file.name} {p.via === "ai" && <Badge tone="brand"><Sparkles className="h-3 w-3" />AI extracted</Badge>}</span>}
                subtitle={`${p.items.length} lines · ${p.parsed.periods.length} ${p.parsed.granularity} period(s): ${p.parsed.periods.slice(0, 3).map(periodLabel).join(", ")}${p.parsed.periods.length > 3 ? "…" : ""}`}
                right={
                  <>
                    <select className="h-8 rounded-lg border border-line bg-white px-2 text-[12px]" value={p.docKind} onChange={(e) => setPending((l) => l.map((x) => (x === p ? { ...x, docKind: e.target.value } : x)))}>
                      {DOC_TYPES.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" onClick={() => setPending((l) => l.filter((x) => x !== p))}>Discard</Button>
                    <Button size="sm" onClick={() => commit(p)}>
                      {target === VAULT ? <><Archive className="h-3.5 w-3.5" />Save to vault</> : <><Wand2 className="h-3.5 w-3.5" />{mode === "replace" ? "Replace data in" : "Add to"} {aliases.find((a) => a.id === target)?.name ?? "alias"}</>}
                    </Button>
                  </>
                }
              />
              {(p.parsed.warnings.length > 0 || p.notes) && (
                <div className="space-y-2 px-5 pt-4">
                  {p.parsed.warnings.map((w, i) => <Callout key={i} tone="warn">{w}</Callout>)}
                  {p.notes && <Callout tone="info" title="AI notes">{p.notes}</Callout>}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 px-5 pt-4 text-[12.5px]">
                <span className="font-medium">Treat this file as</span>
                <Segmented size="sm" value={p.asReference ? "ref" : "stmt"} onChange={(v) => setPending((l) => l.map((x) => (x === p ? { ...x, asReference: v === "ref" } : x)))} options={[{ value: "stmt", label: "Financial statement", disabled: !p.items.length }, { value: "ref", label: "Reference data" }]} />
                <span className="text-muted">{p.asReference ? "Kept as-is for viewing (e.g. Optimizer inputs). It won't change any statement analysis." : "Its lines feed the dashboard, forecast and other statement analysis."}</span>
              </div>
              {p.asReference && p.preview && <PreviewTable rows={p.preview} />}
              <div className={clsx("max-h-72 overflow-auto p-2", (p.asReference || !p.items.length) && "hidden")}>
                <table className="w-full text-[12.5px]">
                  <tbody className="divide-y divide-line">
                    {p.items.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-1.5">{it.name}</td>
                        <td className="px-3 py-1.5">
                          <select className="rounded-md border border-line bg-white px-1.5 py-0.5 text-[12px]" value={it.category}
                            onChange={(e) => setPending((l) => l.map((x) => (x === p ? { ...x, items: x.items.map((y) => (y.id === it.id ? { ...y, category: e.target.value as Category, confidence: 1 } : y)) } : x)))}>
                            {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_META[c].short}</option>)}
                          </select>
                        </td>
                        <td className="tabular px-3 py-1.5 text-right text-muted">{fmtMoney(it.values.reduce((a, b) => a + b, 0), ds.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          {!alias && (
            <Card className="p-6 text-center">
              <Archive className="mx-auto h-8 w-8 text-brand" />
              <div className="mt-2 font-semibold">No alias selected</div>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">Uploads go to the General Vault for now. Create an alias when you know what the analysis is for, then add documents to it from the vault.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => setShowNew(true)}><FolderPlus className="h-3.5 w-3.5" />New alias</Button>
                <Link href="/vault"><Button size="sm" variant="secondary">Open the vault ({vaultOnly.length})</Button></Link>
              </div>
            </Card>
          )}

          {alias && <Card>
            <CardHeader
              icon={<Database className="h-4 w-4" />}
              title="Line items & classification"
              subtitle="Change a category to reclassify a line; every chart and model updates straight away. Low-confidence guesses are flagged."
              right={<Button size="sm" variant="secondary" onClick={exportCsv}><Download className="h-3.5 w-3.5" />Export</Button>}
            />
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input className={clsx(inputCls, "h-9 w-56 pl-8")} placeholder="Search lines…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <button onClick={() => setFilter("all")} className={clsx("rounded-full px-2.5 py-1 text-[12px] font-medium", filter === "all" ? "bg-ink text-white" : "bg-slate-100 text-muted hover:text-ink")}>All {ds.lines.length}</button>
              {lowCount > 0 && <button onClick={() => setFilter("low")} className={clsx("rounded-full px-2.5 py-1 text-[12px] font-medium", filter === "low" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700")}>Needs review {lowCount}</button>}
              {CATEGORY_ORDER.filter((c) => counts.get(c)).map((c) => (
                <button key={c} onClick={() => setFilter(c)} className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", filter === c ? "bg-ink text-white" : "bg-slate-100 text-muted hover:text-ink")}>
                  <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_META[c].color }} />{CATEGORY_META[c].short} {counts.get(c)}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-2 font-semibold">Line item</th>
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Group</th>
                    <th className="px-3 py-2 text-right font-semibold">Last 12 mo / yr</th>
                    <th className="px-3 py-2 font-semibold">Trend</th>
                    <th className="px-3 py-2 font-semibold">Confidence</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((l) => (
                    <tr key={l.id} className="group hover:bg-slate-50/60">
                      <td className="min-w-[220px] px-5 py-2">
                        <div className="font-medium">{l.name}</div>
                        {l.source && <div className="text-[11px] text-muted">{l.source}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="rounded-md border border-line bg-white px-2 py-1 text-[12.5px]"
                          style={{ borderLeft: `4px solid ${CATEGORY_META[l.category].color}` }}
                          value={l.category}
                          onChange={(e) => updateLine(l.id, { category: e.target.value as Category })}
                        >
                          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input className="w-40 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] hover:border-line focus:border-brand focus:bg-white focus:outline-none" value={l.group} onChange={(e) => updateLine(l.id, { group: e.target.value })} />
                      </td>
                      <td className="tabular px-3 py-2 text-right font-medium">{fmtMoney(l.values.slice(-n).reduce((a, b) => a + b, 0), ds.currency)}</td>
                      <td className="px-3 py-2"><Spark values={l.values} color={CATEGORY_META[l.category].color} /></td>
                      <td className="px-3 py-2">
                        {l.confidence >= 1 ? <Badge tone="brand">Manual</Badge> : l.confidence >= 0.75 ? <Badge tone="good">High</Badge> : l.confidence >= 0.6 ? <Badge tone="info">Medium</Badge> : <Badge tone="warn">Review</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button className="rounded p-1 text-slate-400 opacity-0 hover:bg-red-50 hover:text-bad group-hover:opacity-100" onClick={() => removeLine(l.id)} aria-label="Delete line"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">No line items match.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>}
        </div>

        <div className="min-w-0 space-y-5">
          {alias && <Card>
            <CardHeader title="Company settings" subtitle={<>For alias <b className="text-ink">{alias.name}</b></>} />
            <div className="space-y-3 p-5">
              <Field label="Company name"><input className={inputCls} value={ds.company} onChange={(e) => setMeta({ company: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Currency">
                  <select className={inputCls} value={ds.currency} onChange={(e) => setMeta({ currency: e.target.value })}>
                    {["USD", "EUR", "GBP", "CAD", "AUD", "NGN", "INR", "JPY", "ZAR", "KES", "GHS"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Headcount" hint="Used for revenue per employee and workforce levers">
                  <NumInput value={ds.headcount ?? 0} min={0} onChange={(v) => setMeta({ headcount: v || undefined })} />
                </Field>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-[12px] text-muted">
                {ds.periods.length} {ds.granularity}ly periods{ds.periods.length ? ` from ${periodLabel(ds.periods[0])} to ${periodLabel(ds.periods[ds.periods.length - 1])}` : ""}.
              </div>
            </div>
          </Card>}

          {alias && (
            <Card>
              <CardHeader title={`Documents in ${alias.name}`} subtitle="Only these feed this alias's analysis" />
              <div className="divide-y divide-line">
                {aliasDocs.length === 0 && <div className="px-5 py-6 text-center text-[13px] text-muted">{ds.isSample ? "This alias uses the built-in demo data." : "No documents in this alias yet."}</div>}
                {aliasDocs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{d.name}</div>
                      <div className="text-[11px] text-muted">{docById(d.kind)?.name} · {d.items.length ? `${d.items.length} lines` : d.via === "legacy" ? "added before aliases" : "reference document"}</div>
                    </div>
                    <button className="rounded p-1 text-slate-400 hover:text-warn" title="Remove from this alias (stays in the vault)" onClick={() => detachDoc(d.id, alias.id)} aria-label={`Remove ${d.name} from alias`}><Link2Off className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              {otherDocs.length > 0 && (
                <div className="flex gap-2 border-t border-line p-3">
                  <select aria-label="Add a document from the vault" className={clsx(inputCls, "h-8 text-[12.5px]")} value={pickDoc} onChange={(e) => setPickDoc(e.target.value)}>
                    <option value="">Add a document from the vault…</option>
                    {otherDocs.map((d) => <option key={d.id} value={d.id}>{d.name}{vaultOnly.includes(d) ? " (General Vault)" : ""}</option>)}
                  </select>
                  <Button size="sm" disabled={!pickDoc} onClick={() => {
                    const r = attachDoc(pickDoc, alias.id);
                    const name = docs.find((d) => d.id === pickDoc)?.name;
                    setNotice(r.ok ? { tone: r.warnings.length ? "warn" : "good", text: `"${name}" was added to ${alias.name}. ${r.warnings.join(" ")}` } : { tone: "bad", text: r.error ?? "Couldn't add the document." });
                    setPickDoc("");
                  }}>Add</Button>
                </div>
              )}
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] font-semibold"><Archive className="h-4 w-4 text-brand" />General Vault</div>
              <Badge tone={vaultOnly.length ? "warn" : "neutral"}>{vaultOnly.length} unassigned</Badge>
            </div>
            <p className="mt-1 text-[12.5px] text-muted">Every upload is kept in the vault. Unassigned documents wait there until you add them to an alias.</p>
            <Link href="/vault" className="mt-3 inline-block text-[13px] font-medium text-brand hover:underline">Open Aliases & Vault →</Link>
          </Card>

          <Card className="p-5 text-[13px]">
            <div className="font-semibold">How classification works</div>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-muted">
              <li><b className="text-ink">Revenue</b>: core sales, services, subscriptions. Returns and discounts count as negative revenue.</li>
              <li><b className="text-ink">Other income</b>: interest, dividends, rental, grants, gains on sale.</li>
              <li><b className="text-ink">Variable costs</b>: COGS, commissions, shipping, payment fees, marketing, usage-based costs. These move with sales.</li>
              <li><b className="text-ink">Fixed costs</b>: salaries, rent, insurance, software, depreciation, professional fees.</li>
              <li>Subtotals (Total…, Gross profit, Net income) are detected and ignored to avoid double counting.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const v = values.slice(-24);
  if (v.length < 2) return <span className="text-[11px] text-muted">—</span>;
  const min = Math.min(...v), max = Math.max(...v);
  const pts = v.map((y, i) => `${(i / (v.length - 1)) * 80},${22 - (max === min ? 11 : ((y - min) / (max - min)) * 20)}`).join(" ");
  return (
    <svg width="80" height="24" className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

