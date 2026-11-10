"use client";

import { tipFmt } from "@/components/chart";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, FileUp, Info, Lightbulb, LineChart as LineIcon, Sparkles, TrendingDown, XCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader, Callout, EmptyState, Kpi, PageHeader, Segmented } from "@/components/ui";
import { useStore } from "@/store/useStore";
import { canAggregate, computeKpis, groupBreakdown, ruleInsights, summarize, totals, trailingYear, type Insight } from "@/lib/finance";
import { forecastPnl } from "@/lib/forecast";
import { fmtMoney, fmtPct, periodLabel } from "@/lib/format";
import { CATEGORY_META, type Granularity } from "@/lib/types";
import { postAi, useAiStatus } from "@/components/useAi";

type Tab = "overview" | "trends" | "breakdown" | "forecast";

const TONE_ICON = {
  good: <CheckCircle2 className="h-4 w-4 text-good" />,
  warn: <AlertTriangle className="h-4 w-4 text-warn" />,
  bad: <XCircle className="h-4 w-4 text-bad" />,
  info: <Info className="h-4 w-4 text-sky-600" />,
};

interface AiInsights {
  headline: string;
  insights: Insight[];
  actions: { action: string; impact: string; priority: "high" | "medium" | "low" }[];
}

export default function Dashboard() {
  const ds = useStore((s) => s.dataset);
  const [tab, setTab] = useState<Tab>("overview");
  const [gran, setGran] = useState<Granularity>(ds.granularity === "month" ? "month" : ds.granularity);
  const g = canAggregate(ds.granularity, gran) ? gran : ds.granularity;
  const ai = useAiStatus();
  const [aiRes, setAiRes] = useState<AiInsights | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const rows = useMemo(() => summarize(ds, g), [ds, g]);
  const kpis = useMemo(() => computeKpis(ds), [ds]);
  const insights = useMemo(() => ruleInsights(ds), [ds]);
  const ttm = useMemo(() => trailingYear(ds), [ds]);
  const cur = ds.currency;

  if (!ds.lines.length || !ds.periods.length) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Performance at a glance." />
        <EmptyState icon={<FileUp className="h-6 w-6" />} title="No statements yet" body="Upload an income statement, trial balance or P&L export to build your dashboard. You can also reload the demo dataset." action={<Link href="/data"><Button>Go to Statements & Data</Button></Link>} />
      </>
    );
  }

  const chartRows = rows.map((r) => ({ ...r, label: periodLabel(r.period), opMargin: r.revenue ? r.operatingIncome / r.revenue : 0 }));
  const costMix = [
    { name: "COGS", value: ttm.current.cogs, color: CATEGORY_META.cogs.color },
    { name: "Variable opex", value: ttm.current.variable, color: CATEGORY_META.opex_variable.color },
    { name: "Fixed opex", value: ttm.current.fixed, color: CATEGORY_META.opex_fixed.color },
  ].filter((x) => x.value > 0);
  const costGroups = groupBreakdown(ds, ["cogs", "opex_variable", "opex_fixed"]);
  const incomeGroups = groupBreakdown(ds, ["revenue", "other_income"]);
  const maxGroup = Math.max(1, ...costGroups.map((x) => x.value));

  const runAi = async () => {
    setAiBusy(true);
    setAiErr(null);
    try {
      const res = await postAi<AiInsights>("/api/ai/insights", {
        company: ds.company, currency: cur, granularity: ds.granularity, kpis, trailingTwelve: ttm.current, priorYear: ttm.previous,
        periods: summarize(ds, canAggregate(ds.granularity, "quarter") ? "quarter" : ds.granularity),
        costGroups, incomeGroups,
      });
      setAiRes(res);
    } catch (e) {
      setAiErr((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Executive dashboard"
        subtitle={`Trailing ${ttm.periodsUsed} ${ds.granularity}${ttm.periodsUsed > 1 ? "s" : ""}${ttm.previous ? ", compared with the prior year" : ""}. Click a tab to see KPIs, trends, the breakdown or a quick forecast.`}
        right={
          <>
            <Segmented value={tab} onChange={setTab} options={[
              { value: "overview", label: "KPIs" }, { value: "trends", label: "Trends" }, { value: "breakdown", label: "Breakdown" }, { value: "forecast", label: "Quick forecast" },
            ]} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
        <Kpi label="Revenue (TTM)" value={fmtMoney(kpis.revenue, cur)} delta={kpis.revenueGrowth} accent="#2563eb" />
        <Kpi label="Net income (TTM)" value={fmtMoney(kpis.netIncome, cur)} delta={kpis.netIncomeGrowth} accent="#059669" />
        <Kpi label="Gross margin" value={fmtPct(kpis.grossMargin)} hint="(Revenue − COGS) ÷ Revenue" accent="#d97706" />
        <Kpi label="Operating margin" value={fmtPct(kpis.operatingMargin)} hint="Operating income ÷ Revenue" accent="#7c3aed" />
        <Kpi label="Contribution margin" value={fmtPct(kpis.contributionMargin)} hint="(Revenue − all variable costs) ÷ Revenue" />
        <Kpi label="Break-even revenue" value={isFinite(kpis.breakEvenRevenue) ? fmtMoney(kpis.breakEvenRevenue, cur) : "n/a"} hint="Fixed costs ÷ contribution margin ratio" />
        <Kpi label="Fixed / variable cost split" value={`${Math.round(kpis.fixedShare * 100)} / ${Math.round(kpis.variableShare * 100)}`} hint="Share of total operating costs" />
        <Kpi label="Other income share" value={fmtPct(kpis.otherIncomeShare)} hint="Non-operating income ÷ total income" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          {tab !== "breakdown" && tab !== "forecast" && (
            <div className="flex items-center justify-end">
              <Segmented size="sm" value={g} onChange={setGran} options={[
                { value: "month", label: "Monthly", disabled: !canAggregate(ds.granularity, "month") },
                { value: "quarter", label: "Quarterly", disabled: !canAggregate(ds.granularity, "quarter") },
                { value: "year", label: "Yearly" },
              ]} />
            </div>
          )}

          {tab === "overview" && (
            <>
              <Card>
                <CardHeader title="Revenue, net income & operating margin" subtitle="Bars show revenue; lines show net income and operating margin (right axis)." />
                <div className="h-80 p-4">
                  <ResponsiveContainer>
                    <ComposedChart data={chartRows} margin={{ left: 8, right: 8, top: 8 }}>
                      <CartesianGrid stroke="#eef0f4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="l" tickFormatter={(v) => fmtMoney(v, cur)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
                      <YAxis yAxisId="r" orientation="right" tickFormatter={(v) => fmtPct(v, 0)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={44} />
                      <Tooltip formatter={tipFmt((v: number, n: string) => (n === "Operating margin" ? fmtPct(v) : fmtMoney(v, cur, false)))} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Line yAxisId="l" dataKey="netIncome" name="Net income" stroke="#059669" strokeWidth={2.5} dot={false} />
                      <Line yAxisId="r" dataKey="opMargin" name="Operating margin" stroke="#7c3aed" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <KpiTable kpis={kpis} cur={cur} headcount={ds.headcount} />
            </>
          )}

          {tab === "trends" && (
            <>
              <Card>
                <CardHeader title="Cost structure over time" subtitle="Stacked: COGS, variable and fixed operating costs compared with revenue." />
                <div className="h-80 p-4">
                  <ResponsiveContainer>
                    <AreaChart data={chartRows} margin={{ left: 8, right: 8, top: 8 }}>
                      <CartesianGrid stroke="#eef0f4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(v) => fmtMoney(v, cur)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
                      <Tooltip formatter={tipFmt((v: number) => fmtMoney(v, cur, false))} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area dataKey="cogs" name="COGS" stackId="c" stroke={CATEGORY_META.cogs.color} fill={CATEGORY_META.cogs.color} fillOpacity={0.75} />
                      <Area dataKey="variable" name="Variable opex" stackId="c" stroke={CATEGORY_META.opex_variable.color} fill={CATEGORY_META.opex_variable.color} fillOpacity={0.6} />
                      <Area dataKey="fixed" name="Fixed opex" stackId="c" stroke={CATEGORY_META.opex_fixed.color} fill={CATEGORY_META.opex_fixed.color} fillOpacity={0.55} />
                      <Area dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2.5} fill="none" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card>
                <CardHeader title="Margin trends" subtitle="Gross, contribution and operating margins by period." />
                <div className="h-64 p-4">
                  <ResponsiveContainer>
                    <ComposedChart data={chartRows.map((r) => ({ ...r, gm: r.revenue ? r.grossProfit / r.revenue : 0, cm: r.revenue ? r.contribution / r.revenue : 0 }))} margin={{ left: 8, right: 8, top: 8 }}>
                      <CartesianGrid stroke="#eef0f4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={(v) => fmtPct(v, 0)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={44} />
                      <Tooltip formatter={tipFmt((v: number) => fmtPct(v))} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line dataKey="gm" name="Gross margin" stroke="#d97706" strokeWidth={2} dot={false} />
                      <Line dataKey="cm" name="Contribution margin" stroke="#0891b2" strokeWidth={2} dot={false} />
                      <Line dataKey="opMargin" name="Operating margin" stroke="#7c3aed" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}

          {tab === "breakdown" && (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <CardHeader title="Cost mix (TTM)" subtitle="Fixed versus variable" />
                  <div className="h-64 p-2">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={costMix} dataKey="value" nameKey="name" innerRadius={62} outerRadius={95} paddingAngle={2} stroke="none">
                          {costMix.map((c) => <Cell key={c.name} fill={c.color} />)}
                        </Pie>
                        <Tooltip formatter={tipFmt((v: number) => fmtMoney(v, cur, false))} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Revenue & other income sources (TTM)" />
                  <div className="divide-y divide-line">
                    {incomeGroups.map((x) => (
                      <div key={x.category + x.group} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_META[x.category].color }} />
                          {x.group}
                          <Badge tone={x.category === "revenue" ? "brand" : "info"}>{CATEGORY_META[x.category].short}</Badge>
                        </div>
                        <span className="tabular font-medium">{fmtMoney(x.value, cur)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
              <Card>
                <CardHeader title="Operating cost groups (TTM)" subtitle="Ranked by size. Colour shows fixed, variable or COGS." />
                <div className="space-y-2.5 p-5">
                  {costGroups.map((x) => (
                    <div key={x.category + x.group} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 text-[13px]">
                      <span className="truncate">{x.group}</span>
                      <div className="h-2.5 rounded-full bg-slate-100">
                        <div className="h-2.5 rounded-full" style={{ width: `${(x.value / maxGroup) * 100}%`, background: CATEGORY_META[x.category].color }} />
                      </div>
                      <span className="tabular w-24 text-right font-medium">{fmtMoney(x.value, cur)}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <PnlTable ds={ds} cur={cur} />
            </>
          )}

          {tab === "forecast" && <QuickForecast ds={ds} />}
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              icon={<Lightbulb className="h-4 w-4" />}
              title="Analysis & insights"
              subtitle="Rule-based checks of your numbers"
              right={ai?.configured ? <Button size="sm" variant="secondary" onClick={runAi} loading={aiBusy}><Sparkles className="h-3.5 w-3.5" />AI deep-dive</Button> : null}
            />
            <div className="space-y-3 p-4">
              {aiErr && <Callout tone="bad">{aiErr}</Callout>}
              {aiRes && (
                <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-brand"><Sparkles className="h-3.5 w-3.5" /> AI analysis</div>
                  <p className="text-sm font-medium">{aiRes.headline}</p>
                  <ul className="mt-3 space-y-2.5">
                    {aiRes.insights.map((i, k) => (
                      <li key={k} className="flex gap-2 text-[13px]">{TONE_ICON[i.tone]}<div><div className="font-medium">{i.title}</div><div className="text-muted">{i.detail}</div></div></li>
                    ))}
                  </ul>
                  <div className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-muted">Recommended actions</div>
                  <ol className="mt-2 space-y-2">
                    {aiRes.actions.map((a, k) => (
                      <li key={k} className="text-[13px]"><Badge tone={a.priority === "high" ? "bad" : a.priority === "medium" ? "warn" : "neutral"}>{a.priority}</Badge> <span className="font-medium">{a.action}</span> <span className="text-muted">— {a.impact}</span></li>
                    ))}
                  </ol>
                </div>
              )}
              {insights.map((i, k) => (
                <div key={k} className="flex gap-2.5 rounded-xl border border-line p-3">
                  <div className="mt-0.5">{TONE_ICON[i.tone]}</div>
                  <div>
                    <div className="text-[13px] font-semibold">{i.title}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">{i.detail}</div>
                  </div>
                </div>
              ))}
              {ai && !ai.configured && <p className="text-[11.5px] text-muted">Add an Anthropic API key on the server to turn on the AI deep-dive.</p>}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-[13px] font-semibold">Next steps</div>
            <div className="mt-3 grid gap-2 text-[13px]">
              <Link href="/forecast" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-slate-50"><LineIcon className="h-4 w-4 text-brand" /> Build a full forecast</Link>
              <Link href="/scenarios" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-slate-50"><TrendingDown className="h-4 w-4 text-brand" /> Run what-ifs & goal seek</Link>
              <Link href="/pricing" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-slate-50"><Sparkles className="h-4 w-4 text-brand" /> Test pricing strategies</Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function KpiTable({ kpis, cur, headcount }: { kpis: ReturnType<typeof computeKpis>; cur: string; headcount?: number }) {
  const rows: { name: string; value: string; def: string; status: "good" | "warn" | "bad" | "neutral" }[] = [
    { name: "Revenue growth (YoY)", value: kpis.revenueGrowth === null ? "Needs 2 years" : fmtPct(kpis.revenueGrowth, 1, true), def: "Change in trailing-twelve-month revenue", status: kpis.revenueGrowth === null ? "neutral" : kpis.revenueGrowth > 0.08 ? "good" : kpis.revenueGrowth >= 0 ? "warn" : "bad" },
    { name: "Gross margin", value: fmtPct(kpis.grossMargin), def: "Revenue left after cost of goods sold", status: kpis.grossMargin > 0.45 ? "good" : kpis.grossMargin > 0.25 ? "warn" : "bad" },
    { name: "Contribution margin", value: fmtPct(kpis.contributionMargin), def: "Revenue left after all variable costs", status: kpis.contributionMargin > 0.35 ? "good" : kpis.contributionMargin > 0.2 ? "warn" : "bad" },
    { name: "Operating margin", value: fmtPct(kpis.operatingMargin), def: "Operating profit ÷ revenue", status: kpis.operatingMargin > 0.12 ? "good" : kpis.operatingMargin > 0 ? "warn" : "bad" },
    { name: "Net margin", value: fmtPct(kpis.netMargin), def: "Bottom-line profit ÷ revenue", status: kpis.netMargin > 0.08 ? "good" : kpis.netMargin > 0 ? "warn" : "bad" },
    { name: "Opex ratio", value: fmtPct(kpis.opexRatio), def: "Operating expenses (excluding COGS) ÷ revenue", status: kpis.opexRatio < 0.35 ? "good" : kpis.opexRatio < 0.5 ? "warn" : "bad" },
    { name: "Margin of safety", value: kpis.marginOfSafety < 0 ? "Below break-even" : fmtPct(kpis.marginOfSafety), def: "How far revenue can fall before break-even", status: kpis.marginOfSafety > 0.25 ? "good" : kpis.marginOfSafety > 0 ? "warn" : "bad" },
    { name: "Operating leverage", value: isFinite(kpis.operatingLeverage) ? kpis.operatingLeverage.toFixed(2) + "×" : "n/a", def: "% change in profit for each 1% change in sales", status: kpis.operatingLeverage < 4 ? "good" : "warn" },
    { name: "Revenue per employee", value: kpis.revenuePerEmployee ? fmtMoney(kpis.revenuePerEmployee, cur) : "Set headcount", def: `Revenue ÷ headcount${headcount ? ` (${headcount})` : ""}`, status: "neutral" },
  ];
  return (
    <Card>
      <CardHeader title="KPI scorecard" subtitle="Status uses general small and mid-sized business benchmarks. Adjust for your industry." />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-muted">
            <tr><th className="px-5 py-2 font-semibold">KPI</th><th className="px-3 py-2 font-semibold">Value</th><th className="px-3 py-2 font-semibold">What it means</th><th className="px-5 py-2 text-right font-semibold">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.name} className="hover:bg-slate-50/60">
                <td className="px-5 py-2.5 font-medium">{r.name}</td>
                <td className="tabular px-3 py-2.5 font-semibold">{r.value}</td>
                <td className="px-3 py-2.5 text-muted">{r.def}</td>
                <td className="px-5 py-2.5 text-right">
                  <Badge tone={r.status === "neutral" ? "neutral" : r.status}>{r.status === "good" ? "Healthy" : r.status === "warn" ? "Watch" : r.status === "bad" ? "Action" : "Info"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PnlTable({ ds, cur }: { ds: ReturnType<typeof useStore.getState>["dataset"]; cur: string }) {
  const g: Granularity = canAggregate(ds.granularity, "quarter") ? "quarter" : ds.granularity;
  const rows = summarize(ds, g).slice(-6);
  const t = totals(rows);
  const lines: [string, keyof typeof t, boolean?][] = [
    ["Revenue", "revenue", true], ["Cost of goods sold", "cogs"], ["Gross profit", "grossProfit", true], ["Variable operating costs", "variable"],
    ["Contribution", "contribution", true], ["Fixed operating costs", "fixed"], ["Operating income", "operatingIncome", true],
    ["Other income", "otherIncome"], ["Interest & non-operating", "nonOperating"], ["Income tax", "tax"], ["Net income", "netIncome", true],
  ];
  return (
    <Card>
      <CardHeader title="Condensed P&L" subtitle={`Last ${rows.length} ${g}s`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
            <tr><th className="px-5 py-2 text-left font-semibold">Line</th>{rows.map((r) => <th key={r.period} className="px-3 py-2 text-right font-semibold">{periodLabel(r.period)}</th>)}<th className="px-5 py-2 text-right font-semibold">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map(([label, key, bold]) => (
              <tr key={label} className={bold ? "bg-slate-50/50 font-semibold" : ""}>
                <td className="px-5 py-2">{label}</td>
                {rows.map((r) => <td key={r.period} className="tabular px-3 py-2 text-right">{fmtMoney(r[key] as number, cur)}</td>)}
                <td className="tabular px-5 py-2 text-right">{fmtMoney(t[key] as number, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function QuickForecast({ ds }: { ds: ReturnType<typeof useStore.getState>["dataset"] }) {
  const options: Granularity[] = (["month", "quarter", "year"] as Granularity[]).filter((x) => canAggregate(ds.granularity, x));
  const [g, setG] = useState<Granularity>(options.includes("quarter") ? "quarter" : options[0]);
  const defaultH = { month: 12, quarter: 4, year: 3 };
  const [h, setH] = useState(defaultH[g]);
  const rows = summarize(ds, g);
  const enough = rows.length >= 3;
  const fc = enough ? forecastPnl(rows, g, h, { method: "auto", growthAdj: 0, fixedInflation: 0.03, variableRatioAdj: 0, taxRate: 0.24 }) : null;
  const data = fc?.rows.map((r) => ({ label: periodLabel(r.period), actual: r.actual ? r.revenue : null, forecast: !r.actual ? r.revenue : null, band: !r.actual ? [r.revenueLow, r.revenueHigh] : null, net: r.netIncome }));
  const fut = fc?.rows.filter((r) => !r.actual) ?? [];
  return (
    <Card>
      <CardHeader
        title="Quick forecast"
        subtitle="Statistical revenue forecast with an 80% range; costs follow your current cost ratios."
        right={
          <>
            <Segmented size="sm" value={g} onChange={(v) => { setG(v); setH(defaultH[v]); }} options={options.map((o) => ({ value: o, label: o === "month" ? "Monthly" : o === "quarter" ? "Quarterly" : "Yearly" }))} />
            <select className="h-8 rounded-lg border border-line bg-white px-2 text-[12px]" value={h} onChange={(e) => setH(Number(e.target.value))}>
              {(g === "month" ? [3, 6, 12, 18, 24] : g === "quarter" ? [2, 4, 6, 8] : [1, 2, 3, 5]).map((n) => <option key={n} value={n}>{n} {g}s ahead</option>)}
            </select>
          </>
        }
      />
      {!enough ? (
        <div className="p-5"><Callout tone="warn">You need at least 3 {g}s of history at this level. Pick a finer level or upload more periods.</Callout></div>
      ) : (
        <>
          <div className="h-72 p-4">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid stroke="#eef0f4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => fmtMoney(v, ds.currency)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
                <Tooltip formatter={tipFmt((v: number | number[]) => (Array.isArray(v) ? `${fmtMoney(v[0], ds.currency)} – ${fmtMoney(v[1], ds.currency)}` : fmtMoney(v, ds.currency, false)))} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Area dataKey="band" name="80% range" stroke="none" fill="#6366f1" fillOpacity={0.12} />
                <Line dataKey="actual" name="Actual revenue" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                <Line dataKey="forecast" name="Forecast revenue" stroke="#6366f1" strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-px border-t border-line bg-line text-center">
            <div className="bg-white p-3"><div className="text-[11px] text-muted">Forecast revenue</div><div className="tabular font-semibold">{fmtMoney(fut.reduce((a, r) => a + r.revenue, 0), ds.currency)}</div></div>
            <div className="bg-white p-3"><div className="text-[11px] text-muted">Forecast net income</div><div className="tabular font-semibold">{fmtMoney(fut.reduce((a, r) => a + r.netIncome, 0), ds.currency)}</div></div>
            <div className="bg-white p-3"><div className="text-[11px] text-muted">Model · fit error</div><div className="font-semibold">{fc!.revenueModel.method} · {fmtPct(fc!.revenueModel.mape)}</div></div>
          </div>
          <div className="border-t border-line px-5 py-3 text-right"><Link href="/forecast" className="text-[13px] font-medium text-brand hover:underline">Open the full forecast workspace →</Link></div>
        </>
      )}
    </Card>
  );
}
