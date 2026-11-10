"use client";

import { tipFmt } from "@/components/chart";
import clsx from "clsx";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bot, Clock, Gauge, Lightbulb, Map as MapIcon, ShieldAlert, Sparkles, Wand2 } from "lucide-react";
import { Badge, Button, Callout, Card, CardHeader, Field, inputCls, NumInput, PageHeader, Segmented } from "@/components/ui";
import { analyzeWorkflowRules, type Approach, type WorkflowAnalysis } from "@/lib/workflow";
import { postAi, useAiStatus } from "@/components/useAi";
import { fmtMoney } from "@/lib/format";

const EXAMPLES: Record<string, string> = {
  "Accounts payable clerk": `Job title: Accounts Payable Specialist
Responsibilities:
- Receive vendor invoices by email and manually enter them into QuickBooks
- Match invoices to purchase orders and receiving reports
- Chase department managers for invoice approvals via email
- Prepare weekly check runs and ACH payment batches
- Reconcile vendor statements monthly and resolve discrepancies
- Respond to vendor inquiries about payment status by phone and email
- Maintain vendor master file and collect W-9 forms
- Prepare month-end AP aging report and accrual schedule for the controller
- Assist with year-end 1099 preparation and audit requests`,
  "Customer onboarding process": `1. Sales rep emails the signed contract to operations
2. Operations manually creates the customer account in the billing system and the CRM
3. Onboarding specialist schedules a kickoff call by emailing back and forth
4. Customer fills in a PDF intake form, which we print and scan
5. Specialist re-enters intake data into the project tracker
6. Weekly status update emails are written by hand for each customer
7. Account manager reviews progress and decides on escalation
8. Finance sends the first invoice and follows up on payment`,
  "Marketing coordinator": `Marketing Coordinator
- Write and schedule social media posts across 4 channels
- Draft weekly email newsletter and product announcements
- Compile monthly marketing performance report from Google Analytics, Meta and HubSpot into slides
- Research competitors' pricing and campaigns
- Coordinate trade show logistics and book travel
- Update product descriptions on the website
- Manage relationships with external agencies and freelancers
- Plan quarterly campaign strategy with the marketing director`,
};

const APPROACH: Record<Approach, { label: string; tone: "good" | "brand" | "neutral" | "warn"; color: string }> = {
  automate: { label: "Automate", tone: "good", color: "#10b981" },
  eliminate: { label: "Eliminate", tone: "warn", color: "#f59e0b" },
  augment: { label: "AI-assist", tone: "brand", color: "#6366f1" },
  keep_human: { label: "Keep human", tone: "neutral", color: "#94a3b8" },
};

export default function WorkflowPage() {
  const ai = useAiStatus();
  const [text, setText] = useState(EXAMPLES["Accounts payable clerk"]);
  const [hours, setHours] = useState(40);
  const [rate, setRate] = useState(38);
  const [context, setContext] = useState("");
  const [engine, setEngine] = useState<"ai" | "rules">("ai");
  const [res, setRes] = useState<WorkflowAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const useAiEngine = engine === "ai" && ai?.configured;

  const run = async () => {
    setErr(null);
    if (!useAiEngine) {
      setRes(analyzeWorkflowRules(text, hours));
      return;
    }
    setBusy(true);
    try {
      setRes(await postAi<WorkflowAnalysis>("/api/ai/workflow", { text, hoursPerWeek: hours, context }));
    } catch (e) {
      setErr((e as Error).message + " Showing the built-in analysis instead.");
      setRes(analyzeWorkflowRules(text, hours));
    } finally {
      setBusy(false);
    }
  };

  const chart = res?.tasks.map((t, i) => ({ name: `T${i + 1}`, task: t.task, value: t.automationPotential, approach: t.approach })) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Advise"
        title="AI workflow & job analyzer"
        subtitle="Paste a job description or an end-to-end process. Fintel Hub breaks it into tasks, scores how much automation or AI could take on, and shows what to improve, what to automate and what should stay with people."
      />

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card className="h-fit">
          <CardHeader icon={<Bot className="h-4 w-4" />} title="Input" />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(EXAMPLES).map((k) => (
                <button key={k} onClick={() => setText(EXAMPLES[k])} className="rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-muted hover:border-brand hover:text-brand">{k}</button>
              ))}
            </div>
            <textarea className={clsx(inputCls, "h-72 resize-y py-2 font-mono text-[12.5px] leading-relaxed")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a job description, or list the process steps one per line…" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hours / week on this"><NumInput value={hours} min={1} onChange={setHours} /></Field>
              <Field label="Loaded cost / hour"><NumInput value={rate} min={0} onChange={setRate} /></Field>
            </div>
            <Field label="Business context (optional)"><input className={inputCls} value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. 40-person distributor using QuickBooks & HubSpot" /></Field>
            <div className="flex items-center justify-between gap-3">
              <Segmented size="sm" value={engine} onChange={setEngine} options={[{ value: "ai", label: "Claude AI", disabled: !ai?.configured }, { value: "rules", label: "Built-in rules" }]} />
              <Button onClick={run} loading={busy} disabled={text.trim().length < 20}><Wand2 className="h-4 w-4" />Analyze</Button>
            </div>
            {!ai?.configured && <p className="text-[11.5px] text-muted">Running on built-in rules. Add an Anthropic API key to the server for in-depth Claude analysis.</p>}
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          {err && <Callout tone="warn">{err}</Callout>}
          {!res && (
            <Card className="grid place-items-center px-6 py-20 text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand"><Sparkles className="h-6 w-6" /></div>
              <div className="font-semibold">Ready when you are</div>
              <p className="mt-1 max-w-sm text-sm text-muted">Pick an example or paste your own, then click <b>Analyze</b>.</p>
            </Card>
          )}
          {res && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-4">
                  <div className="flex items-center gap-1.5 text-[12px] text-muted"><Gauge className="h-3.5 w-3.5" />Automation potential</div>
                  <div className="mt-2 flex items-end gap-3">
                    <div className="tabular text-3xl font-semibold">{Math.round(res.automationScore)}%</div>
                    <div className="mb-2 h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500" style={{ width: `${res.automationScore}%` }} /></div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-1.5 text-[12px] text-muted"><Clock className="h-3.5 w-3.5" />Hours freed / week</div>
                  <div className="tabular mt-2 text-3xl font-semibold">{res.hoursSavedPerWeek.toFixed(1)}<span className="text-base font-normal text-muted"> / {hours}</span></div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-1.5 text-[12px] text-muted"><Sparkles className="h-3.5 w-3.5" />Annual capacity value</div>
                  <div className="tabular mt-2 text-3xl font-semibold">{fmtMoney(res.hoursSavedPerWeek * rate * 48)}</div>
                </Card>
              </div>

              <Card>
                <CardHeader title={res.title} subtitle={res.summary} right={<Badge tone={res.source === "ai" ? "brand" : "neutral"}>{res.source === "ai" ? "Claude analysis" : "Rule-based"}</Badge>} />
                <div className="h-56 p-4">
                  <ResponsiveContainer>
                    <BarChart data={chart} margin={{ left: 0, right: 8, top: 8 }}>
                      <CartesianGrid stroke="#eef0f4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => v + "%"} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={40} />
                      <Tooltip formatter={tipFmt((v: number) => [v + "%", "Automation potential"])} labelFormatter={(_, p) => (p?.[0]?.payload as { task?: string })?.task ?? ""} contentStyle={{ borderRadius: 10, fontSize: 12, maxWidth: 320, whiteSpace: "normal" }} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
                        {chart.map((c, i) => <Cell key={i} fill={APPROACH[c.approach].color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-3 border-t border-line px-5 py-2.5 text-[11.5px] text-muted">
                  {Object.values(APPROACH).map((a) => <span key={a.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />{a.label}</span>)}
                </div>
              </Card>

              <Card>
                <CardHeader title="Task-by-task assessment" />
                <div className="divide-y divide-line">
                  {res.tasks.map((t, i) => (
                    <div key={i} className="grid gap-2 px-5 py-3.5 md:grid-cols-[1fr_220px]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-400">T{i + 1}</span>
                          <span className="text-[13.5px] font-medium">{t.task}</span>
                        </div>
                        <div className="mt-1 text-[12.5px] text-muted">{t.aiSolution}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">{t.tools.map((x) => <span key={x} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{x}</span>)}</div>
                      </div>
                      <div className="flex flex-wrap items-start gap-1.5 md:justify-end">
                        <Badge tone={APPROACH[t.approach].tone}>{APPROACH[t.approach].label}</Badge>
                        <Badge>{t.category}</Badge>
                        <Badge tone={t.effort === "low" ? "good" : t.effort === "medium" ? "info" : "warn"}>{t.effort} effort</Badge>
                        <span className="tabular w-full text-[12px] font-semibold md:text-right">{Math.round(t.automationPotential)}% automatable</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader icon={<Lightbulb className="h-4 w-4" />} title="Efficiency improvements" />
                  <div className="space-y-3 p-5">
                    {res.efficiencyImprovements.map((e, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2 text-[13px] font-semibold">{e.title}<Badge tone={e.impact === "high" ? "good" : e.impact === "medium" ? "info" : "neutral"}>{e.impact} impact</Badge></div>
                        <div className="text-[12.5px] text-muted">{e.detail}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <CardHeader icon={<MapIcon className="h-4 w-4" />} title="Roadmap" />
                  <div className="space-y-4 p-5">
                    {res.roadmap.map((r, i) => (
                      <div key={i} className="relative pl-6">
                        <div className="absolute left-0 top-1 grid h-4 w-4 place-items-center rounded-full bg-brand text-[9px] font-bold text-white">{i + 1}</div>
                        <div className="text-[13px] font-semibold">{r.phase}</div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-muted">{r.items.map((it, k) => <li key={k}>{it}</li>)}</ul>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
              <Card className="p-5">
                <div className="flex items-center gap-2 text-[13px] font-semibold"><ShieldAlert className="h-4 w-4 text-warn" />Risks & safeguards</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-muted">{res.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
