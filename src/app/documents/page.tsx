"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, CircleDashed, ClipboardList, Copy, FileSearch, Search, Sparkles } from "lucide-react";
import { Badge, Button, Callout, Card, CardHeader, inputCls, PageHeader } from "@/components/ui";
import { useAliasDocs, useDataset } from "@/store/useStore";
import { docById, matchTasks, TASKS, type AnalysisTask } from "@/lib/documents";
import { postAi, useAiStatus } from "@/components/useAi";

interface AiDocs {
  taskName: string;
  summary: string;
  docs: { name: string; need: "required" | "recommended"; period: string; why: string; source: string }[];
  tips: string[];
}

export default function DocumentsPage() {
  const docs = useAliasDocs();
  const isSample = useDataset().isSample;
  const ai = useAiStatus();
  const [selected, setSelected] = useState<string>(TASKS[0].id);
  const [query, setQuery] = useState("");
  const [aiRes, setAiRes] = useState<AiDocs | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const have = useMemo(() => new Set([...docs.map((d) => d.kind), ...(isSample ? ["income_statement"] : [])]), [docs, isSample]);
  const matches = useMemo(() => matchTasks(query), [query]);
  const task = TASKS.find((t) => t.id === selected)!;
  const required = task.docs.filter((d) => d.need === "required");
  const haveReq = required.filter((d) => have.has(d.id)).length;
  const readiness = required.length ? haveReq / required.length : 1;

  const ask = async () => {
    setBusy(true);
    setErr(null);
    try {
      setAiRes(await postAi<AiDocs>("/api/ai/documents", { query, have: docs.map((d) => docById(d.kind)?.name ?? d.kind) }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyChecklist = (t: AnalysisTask) => {
    const text = `Documents needed: ${t.name}\n\n` + t.docs.map((d) => `[${have.has(d.id) ? "x" : " "}] ${docById(d.id)?.name} (${d.need}) — ${d.period}\n    Why: ${d.why}\n    Where: ${docById(d.id)?.source}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  return (
    <>
      <PageHeader
        eyebrow="Advise"
        title="Document advisor"
        subtitle="Tell Fintel Hub what you're trying to do and it lists the exact documents you need, the periods they should cover, why each matters and where to get it. It also shows which ones you've already uploaded."
      />

      <Card className="mb-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input className={clsx(inputCls, "h-10 pl-9")} placeholder="What do you need to do? e.g. 'apply for a bank loan', 'value the business', 'review our pricing'" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) setSelected(matches[0].id); }} />
          </div>
          {ai?.configured && <Button onClick={ask} loading={busy} disabled={query.trim().length < 5}><Sparkles className="h-4 w-4" />Ask AI for a custom list</Button>}
        </div>
        {query && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-muted">{matches.length ? "Best matches:" : "No direct match. Try other words" + (ai?.configured ? " or ask the AI." : ".")}</span>
            {matches.slice(0, 4).map((m) => (
              <button key={m.id} onClick={() => setSelected(m.id)} className={clsx("rounded-full border px-2.5 py-1 font-medium", selected === m.id ? "border-brand bg-brand-soft text-brand" : "border-line hover:bg-slate-50")}>{m.name}</button>
            ))}
          </div>
        )}
        {err && <div className="mt-3"><Callout tone="bad">{err}</Callout></div>}
      </Card>

      {aiRes && (
        <Card className="mb-5 overflow-hidden ring-2 ring-indigo-100">
          <CardHeader icon={<Sparkles className="h-4 w-4" />} title={`AI checklist: ${aiRes.taskName}`} subtitle={aiRes.summary} right={<Button size="sm" variant="ghost" onClick={() => setAiRes(null)}>Close</Button>} />
          <div className="divide-y divide-line">
            {aiRes.docs.map((d, i) => (
              <div key={i} className="grid gap-1 px-5 py-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold">{d.name}<Badge tone={d.need === "required" ? "bad" : "neutral"}>{d.need}</Badge></div>
                  <div className="text-[12.5px] text-muted">{d.why}</div>
                  <div className="mt-0.5 text-[12px] text-slate-500">Where: {d.source}</div>
                </div>
                <div className="text-[12px] font-medium text-slate-600 sm:text-right">{d.period}</div>
              </div>
            ))}
          </div>
          {aiRes.tips.length > 0 && (
            <div className="border-t border-line bg-slate-50 px-5 py-3 text-[12.5px]">
              <div className="mb-1 font-semibold">Tips</div>
              <ul className="list-disc space-y-0.5 pl-4 text-muted">{aiRes.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <CardHeader icon={<ClipboardList className="h-4 w-4" />} title="Tasks & analyses" />
          <div className="p-2">
            {TASKS.map((t) => {
              const req = t.docs.filter((d) => d.need === "required");
              const got = req.filter((d) => have.has(d.id)).length;
              return (
                <button key={t.id} onClick={() => setSelected(t.id)} className={clsx("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px]", selected === t.id ? "bg-brand-soft font-semibold text-brand" : "hover:bg-slate-50")}>
                  <span>{t.name}</span>
                  <span className={clsx("tabular text-[11px]", got === req.length ? "text-good" : "text-muted")}>{got}/{req.length}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              icon={<FileSearch className="h-4 w-4" />}
              title={task.name}
              subtitle={task.summary}
              right={
                <>
                  <Button size="sm" variant="secondary" onClick={() => copyChecklist(task)}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy checklist"}</Button>
                  {task.module && <Link href={task.module.href}><Button size="sm">{task.module.label}<ArrowRight className="h-3.5 w-3.5" /></Button></Link>}
                </>
              }
            />
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium">Readiness</span>
                <span className="tabular text-muted">{haveReq} of {required.length} required documents</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className={clsx("h-2 rounded-full transition-all", readiness === 1 ? "bg-emerald-500" : readiness >= 0.5 ? "bg-amber-500" : "bg-red-400")} style={{ width: `${Math.max(4, readiness * 100)}%` }} />
              </div>
            </div>
            <div className="divide-y divide-line">
              {task.docs.map((d) => {
                const meta = docById(d.id)!;
                const ok = have.has(d.id);
                return (
                  <div key={d.id} className="flex gap-3 px-5 py-4">
                    <div className="mt-0.5">{ok ? <div className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-3.5 w-3.5" /></div> : <CircleDashed className="h-6 w-6 text-slate-300" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold">{meta.name}</span>
                        <Badge tone={d.need === "required" ? "bad" : "neutral"}>{d.need}</Badge>
                        {ok && <Badge tone="good">Uploaded</Badge>}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-muted">{meta.what}</div>
                      <div className="mt-2 grid gap-1 text-[12.5px] sm:grid-cols-3">
                        <div><span className="text-slate-400">Period · </span><span className="font-medium">{d.period}</span></div>
                        <div className="sm:col-span-2"><span className="text-slate-400">Why · </span>{d.why}</div>
                      </div>
                      <div className="mt-1 text-[12px] text-slate-500"><span className="text-slate-400">Where to get it · </span>{meta.source}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <p className="text-[12px] text-muted">Uploaded documents are detected automatically on the <Link className="font-medium text-brand hover:underline" href="/data">Statements & Data</Link> page. You can also correct the document type there before importing.</p>
        </div>
      </div>
    </>
  );
}
