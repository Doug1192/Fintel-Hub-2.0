"use client";

import clsx from "clsx";
import { useMemo, useRef, useState } from "react";
import { Database, Download, FileSpreadsheet, FileText, RotateCcw, Search, Sparkles, Trash2, UploadCloud, Wand2 } from "lucide-react";
import { Badge, Button, Callout, Card, CardHeader, Field, inputCls, NumInput, PageHeader, Segmented } from "@/components/ui";
import { useStore } from "@/store/useStore";
import { mergeIntoDataset, parseTable, parseText, toLineItems, type ParsedStatement } from "@/lib/parse";
import { downloadText, fileToBase64, readCsv, readPdfText, readXlsx } from "@/lib/fileReaders";
import { CATEGORY_META, CATEGORY_ORDER, type Category, type LineItem } from "@/lib/types";
import { detectDocType, docById, DOC_TYPES } from "@/lib/documents";
import { fmtMoney, periodLabel, uid } from "@/lib/format";
import { postAi, useAiStatus } from "@/components/useAi";
import { periodsPerYear } from "@/lib/finance";

interface Pending {
  file: File;
  parsed: ParsedStatement;
  items: LineItem[];
  docKind: string;
  via: "parser" | "ai";
  notes?: string;
  company?: string;
}

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
  const { dataset: ds, docs, setDataset, loadSample, clear, updateLine, removeLine, setMeta, addDoc, removeDoc } = useStore();
  const ai = useAiStatus();
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
        const isPdf = ext === "pdf" || file.type === "application/pdf";
        const isImg = /^image\//.test(file.type);

        if ((isPdf || isImg) && aiOn) {
          setBusy(`AI is reading ${file.name}… (this can take a minute)`);
          const res = await postAi<AiExtract>("/api/ai/extract", { filename: file.name, mediaType: isPdf ? "application/pdf" : file.type, data: await fileToBase64(file) });
          parsed = { periods: res.periods, granularity: res.granularity, lines: res.lines.map((l) => ({ name: l.name, values: l.values })), warnings: [], layout: "wide" };
          const items: LineItem[] = res.lines.map((l) => ({ id: uid("ln"), name: l.name, category: l.category, group: l.group || CATEGORY_META[l.category].short, values: res.periods.map((_, i) => l.values[i] ?? 0), confidence: 0.9, source: file.name }));
          setPending((p) => [...p, { file, parsed: parsed!, items, docKind: detectDocType(file.name, res.lines.map((l) => l.name).join(" ")), via: "ai", notes: res.notes, company: res.company }]);
          continue;
        }
        if (isImg) throw new Error("Images need the AI engine to read them. Add an API key, or upload CSV, Excel or PDF.");
        if (ext === "csv" || ext === "tsv" || file.type === "text/csv") {
          const rows = await readCsv(file);
          sample = rows.slice(0, 40).map((r) => r.join(" ")).join("\n");
          parsed = parseTable(rows);
        } else if (["xlsx", "xls", "xlsm", "ods"].includes(ext)) {
          const { rows } = await readXlsx(file);
          sample = rows.slice(0, 40).map((r) => r.join(" ")).join("\n");
          parsed = parseTable(rows);
        } else if (isPdf) {
          const text = await readPdfText(file);
          sample = text;
          if (!text.trim()) throw new Error("This PDF has no text layer (it may be scanned). Turn on AI extraction to read it.");
          parsed = parseText(text);
        } else {
          const text = await file.text();
          sample = text;
          if (aiOn && text.length > 0) {
            setBusy(`AI is reading ${file.name}…`);
            const res = await postAi<AiExtract>("/api/ai/extract", { filename: file.name, text });
            parsed = { periods: res.periods, granularity: res.granularity, lines: res.lines.map((l) => ({ name: l.name, values: l.values })), warnings: [], layout: "wide" };
            via = "ai";
            notes = res.notes;
            company = res.company;
          } else parsed = parseText(text);
        }
        if (!parsed.lines.length) throw new Error(`No statement lines found in ${file.name}. ${parsed.warnings.join(" ")}`);
        setPending((p) => [...p, { file, parsed: parsed!, items: toLineItems(parsed!, file.name), docKind: detectDocType(file.name, sample), via, notes, company }]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setBusy(null);
  }

  function commit(p: Pending) {
    const base = mode === "replace" ? null : ds;
    const next = mergeIntoDataset(base, p.parsed, p.items, p.company || (ds.isSample ? p.file.name.replace(/\.[^.]+$/, "") : ds.company));
    setDataset({ ...next, isSample: false });
    addDoc({ id: uid("doc"), name: p.file.name, size: p.file.size, kind: p.docKind, addedAt: new Date().toISOString(), linesExtracted: p.items.length });
    setPending((list) => list.filter((x) => x !== p));
    if (mode === "replace") setMode("merge");
  }

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
        subtitle="Upload income statements, P&L exports, trial balances or general-ledger extracts (CSV, Excel, PDF). Fin-Zeus pulls out revenue and other income, and sorts every expense into fixed or variable. Review and fix anything below."
        right={
          <>
            <Button variant="secondary" size="sm" onClick={() => downloadText("fin-zeus-template.csv", TEMPLATE)}><Download className="h-3.5 w-3.5" />CSV template</Button>
            <Button variant="secondary" size="sm" onClick={loadSample}><RotateCcw className="h-3.5 w-3.5" />Load demo</Button>
            <Button variant="danger" size="sm" onClick={() => { if (confirm("Remove all statement data?")) clear(); }}><Trash2 className="h-3.5 w-3.5" />Clear</Button>
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
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand"><UploadCloud className="h-7 w-7" /></div>
              <div>
                <div className="text-base font-semibold">Drop statements here or <button className="text-brand underline-offset-2 hover:underline" onClick={() => input.current?.click()}>browse</button></div>
                <div className="mt-1 text-[13px] text-muted">CSV, XLSX/XLS, PDF, TXT{ai?.configured ? ", or images (with AI)" : ""}. Multi-period (months, quarters, years) or single-period statements.</div>
              </div>
              <input ref={input} type="file" multiple hidden accept=".csv,.tsv,.xlsx,.xls,.xlsm,.ods,.pdf,.txt,image/*" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-[12px]">
                <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "merge", label: "Merge with current data" }, { value: "replace", label: "Replace current data" }]} />
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
                    <Button size="sm" onClick={() => commit(p)}><Wand2 className="h-3.5 w-3.5" />{mode === "replace" ? "Replace data" : "Import"}</Button>
                  </>
                }
              />
              {(p.parsed.warnings.length > 0 || p.notes) && (
                <div className="space-y-2 px-5 pt-4">
                  {p.parsed.warnings.map((w, i) => <Callout key={i} tone="warn">{w}</Callout>)}
                  {p.notes && <Callout tone="info" title="AI notes">{p.notes}</Callout>}
                </div>
              )}
              <div className="max-h-72 overflow-auto p-2">
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

          <Card>
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
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Company settings" />
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
          </Card>

          <Card>
            <CardHeader title="Uploaded documents" subtitle="Used by the Document Advisor to show what's still missing" />
            <div className="divide-y divide-line">
              {docs.length === 0 && <div className="px-5 py-6 text-center text-[13px] text-muted">{ds.isSample ? "You're viewing the demo dataset." : "No documents uploaded yet."}</div>}
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{d.name}</div>
                    <div className="text-[11px] text-muted">{docById(d.kind)?.name} · {d.linesExtracted} lines</div>
                  </div>
                  <button className="rounded p-1 text-slate-400 hover:text-bad" onClick={() => removeDoc(d.id)} aria-label="Remove document"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
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
