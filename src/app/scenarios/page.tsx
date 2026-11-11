"use client";

import { tipFmt } from "@/components/chart";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, Crosshair, RotateCcw, SlidersHorizontal, Target, XCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, inputCls, Kpi, NumInput, PageHeader, Segmented, Slider } from "@/components/ui";
import { useDataset, useStore } from "@/store/useStore";
import { baselineFrom, dataTable, evaluate, goalSeek, TARGET_LABEL, tornado, ZERO_DRIVERS, type Baseline, type Drivers, type TargetMetric } from "@/lib/scenario";
import { fmtMoney, fmtPct } from "@/lib/format";
import Link from "next/link";

type Tab = "whatif" | "sensitivity" | "goal";

export default function ScenariosPage() {
  const ds = useDataset();
  const setMeta = useStore((s) => s.setMeta);
  const base0 = useMemo(() => baselineFrom(ds), [ds]);
  const [avgCost, setAvgCost] = useState<number | null>(null);
  const b: Baseline = { ...base0, avgEmployeeCost: avgCost ?? base0.avgEmployeeCost };
  const [d, setD] = useState<Drivers>(ZERO_DRIVERS);
  const [tab, setTab] = useState<Tab>("whatif");
  const cur = ds.currency;
  const set = (k: keyof Drivers) => (v: number) => setD((x) => ({ ...x, [k]: v }));

  const base = evaluate(b, { ...ZERO_DRIVERS, elasticity: d.elasticity });
  const sc = evaluate(b, d);

  return (
    <>
      <PageHeader
        eyebrow="Decide"
        title="Sensitivity, what-if & goal seek"
        subtitle="Flex prices, volume, costs and workforce to see the effect on profit, or work backwards from a target to see what it would take. The baseline is your trailing-twelve-month P&L."
        right={<Segmented value={tab} onChange={setTab} options={[{ value: "whatif", label: "What-if" }, { value: "sensitivity", label: "Sensitivity" }, { value: "goal", label: "Goal seek (reverse)" }]} />}
      />

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader icon={<SlidersHorizontal className="h-4 w-4" />} title="Scenario drivers" subtitle="Applied on top of the baseline" right={<Button size="sm" variant="ghost" onClick={() => setD(ZERO_DRIVERS)}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>} />
          <div className="space-y-4 p-5">
            <Slider label="Selling price" value={d.price} onChange={set("price")} min={-0.3} max={0.3} step={0.005} format={(v) => fmtPct(v, 1, true)} />
            <Slider label="Sales volume" value={d.volume} onChange={set("volume")} min={-0.5} max={1} step={0.01} format={(v) => fmtPct(v, 0, true)} />
            <Slider label="Variable cost per unit" value={d.unitCost} onChange={set("unitCost")} min={-0.3} max={0.3} step={0.005} format={(v) => fmtPct(v, 1, true)} />
            <Slider label="Fixed overhead" value={d.fixed} onChange={set("fixed")} min={-0.3} max={0.3} step={0.005} format={(v) => fmtPct(v, 1, true)} />
            <Slider label="Workforce productivity" value={d.productivity} onChange={set("productivity")} min={-0.2} max={0.5} step={0.01} format={(v) => fmtPct(v, 0, true)} hint="More output per employee at the same headcount" />
            <Slider label="Headcount change" value={d.headcount} onChange={set("headcount")} min={-Math.round(b.headcount * 0.5)} max={Math.round(b.headcount * 0.5) || 5} step={1} format={(v) => (v > 0 ? "+" : "") + v + " ppl"} />
            <Slider label="Other income" value={d.otherIncome} onChange={set("otherIncome")} min={-1} max={1} step={0.05} format={(v) => fmtPct(v, 0, true)} />
            <div className="border-t border-line pt-4">
              <Slider label="Price elasticity of demand" value={d.elasticity} onChange={set("elasticity")} min={-3} max={0} step={0.1} format={(v) => v.toFixed(1)} hint="−1.5 means a 10% price rise loses 15% of volume. 0 ignores the volume effect." />
              <p className="mt-1 text-[11.5px] text-muted">−1.5 means a 10% price rise cuts volume by 15%.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
              <Field label="Headcount"><NumInput value={b.headcount} min={1} onChange={(v) => setMeta({ headcount: Math.max(1, v) })} /></Field>
              <Field label="Avg loaded cost / FTE"><NumInput value={Math.round(b.avgEmployeeCost)} step={1000} onChange={(v) => setAvgCost(v)} /></Field>
            </div>
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Revenue" value={fmtMoney(sc.revenue, cur)} delta={base.revenue ? sc.revenue / base.revenue - 1 : null} deltaLabel="vs baseline" accent="#2563eb" />
            <Kpi label="Operating profit" value={fmtMoney(sc.operatingIncome, cur)} delta={base.operatingIncome ? (sc.operatingIncome - base.operatingIncome) / Math.abs(base.operatingIncome) : null} deltaLabel="vs baseline" accent="#7c3aed" />
            <Kpi label="Net income" value={fmtMoney(sc.netIncome, cur)} delta={base.netIncome ? (sc.netIncome - base.netIncome) / Math.abs(base.netIncome) : null} deltaLabel="vs baseline" accent="#059669" />
            <Kpi label="Operating margin" value={fmtPct(sc.operatingMargin)} delta={sc.operatingMargin - base.operatingMargin} deltaLabel="pts vs baseline" accent="#d97706" />
          </div>
          {tab === "whatif" && <WhatIf b={b} base={base} sc={sc} cur={cur} />}
          {tab === "sensitivity" && <Sensitivity b={b} d={d} cur={cur} />}
          {tab === "goal" && <GoalSeek b={b} d={d} cur={cur} onApply={(nd) => { setD(nd); setTab("whatif"); }} />}
        </div>
      </div>
    </>
  );
}

function WhatIf({ base, sc, cur }: { b: Baseline; base: ReturnType<typeof evaluate>; sc: ReturnType<typeof evaluate>; cur: string }) {
  const rows: [string, keyof typeof sc, boolean?][] = [
    ["Revenue", "revenue", true], ["Variable costs (COGS + variable opex)", "variableCosts"], ["Contribution", "contribution", true],
    ["Fixed costs (incl. headcount)", "fixedCosts"], ["Operating profit", "operatingIncome", true], ["Net income", "netIncome", true],
    ["Break-even revenue", "breakEvenRevenue"], ["Headcount", "headcount"],
  ];
  const bridge = [
    { name: "Baseline", value: base.operatingIncome },
    { name: "Revenue Δ", value: sc.revenue - base.revenue },
    { name: "Variable cost Δ", value: -(sc.variableCosts - base.variableCosts) },
    { name: "Fixed cost Δ", value: -(sc.fixedCosts - base.fixedCosts) },
    { name: "Scenario", value: sc.operatingIncome },
  ];
  let run = 0;
  const water = bridge.map((x, i) => {
    if (i === 0 || i === bridge.length - 1) {
      run = x.value;
      return { name: x.name, base: 0, val: x.value, total: true };
    }
    const start = run;
    run += x.value;
    return { name: x.name, base: Math.min(start, run), val: Math.abs(x.value), pos: x.value >= 0 };
  });
  return (
    <>
      <Card>
        <CardHeader title="Operating profit bridge" subtitle="How each change moves profit away from the baseline" />
        <div className="h-72 p-4">
          <ResponsiveContainer>
            <BarChart data={water} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid stroke="#eef0f4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => fmtMoney(v, cur)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
              <Tooltip formatter={tipFmt((v: number, n: string) => (n === "base" ? null : fmtMoney(v, cur, false)))} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="base" stackId="a" fill="transparent" />
              <Bar dataKey="val" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {water.map((w, i) => <Cell key={i} fill={w.total ? "#4f46e5" : w.pos ? "#10b981" : "#ef4444"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <CardHeader title="Baseline vs scenario" />
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
            <tr><th className="px-5 py-2 text-left font-semibold">Metric</th><th className="px-3 py-2 text-right font-semibold">Baseline</th><th className="px-3 py-2 text-right font-semibold">Scenario</th><th className="px-5 py-2 text-right font-semibold">Change</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(([label, k, bold]) => {
              const a = base[k] as number, s = sc[k] as number;
              const isCost = k === "variableCosts" || k === "fixedCosts" || k === "breakEvenRevenue";
              const diff = s - a;
              const fmt = (v: number) => (k === "headcount" ? String(Math.round(v)) : isFinite(v) ? fmtMoney(v, cur) : "n/a");
              return (
                <tr key={label} className={bold ? "font-semibold" : ""}>
                  <td className="px-5 py-2">{label}</td>
                  <td className="tabular px-3 py-2 text-right">{fmt(a)}</td>
                  <td className="tabular px-3 py-2 text-right">{fmt(s)}</td>
                  <td className={clsx("tabular px-5 py-2 text-right", Math.abs(diff) < 0.5 ? "text-muted" : (diff > 0) !== isCost ? "text-good" : "text-bad")}>
                    {isFinite(diff) ? (diff > 0 ? "+" : "") + (k === "headcount" ? Math.round(diff) : fmtMoney(diff, cur)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Sensitivity({ b, d, cur }: { b: Baseline; d: Drivers; cur: string }) {
  const [delta, setDelta] = useState(0.1);
  const [metric, setMetric] = useState<TargetMetric>("operatingIncome");
  const bars = tornado(b, d, delta, metric);
  const steps = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];
  const table = dataTable(b, d, steps, metric);
  const all = table.flatMap((r) => r.cells.map((c) => c.value));
  const min = Math.min(...all), max = Math.max(...all);
  const color = (v: number) => {
    if (v < 0) return `rgba(239,68,68,${0.15 + 0.6 * Math.min(1, v / (min || -1))})`;
    return `rgba(16,185,129,${0.12 + 0.6 * (max ? v / max : 0)})`;
  };
  const fmtM = (v: number) => (metric === "operatingMargin" ? fmtPct(v) : fmtMoney(v, cur));
  return (
    <>
      <Card>
        <CardHeader
          title="Tornado: which driver matters most?"
          subtitle={`Change in ${TARGET_LABEL[metric].toLowerCase()} when each driver moves ±${Math.round(delta * 100)}%, one at a time`}
          right={
            <>
              <select className="h-8 rounded-lg border border-line bg-white px-2 text-[12px]" value={metric} onChange={(e) => setMetric(e.target.value as TargetMetric)}>
                {(Object.keys(TARGET_LABEL) as TargetMetric[]).map((k) => <option key={k} value={k}>{TARGET_LABEL[k]}</option>)}
              </select>
              <Segmented size="sm" value={String(delta)} onChange={(v) => setDelta(Number(v))} options={[{ value: "0.05", label: "±5%" }, { value: "0.1", label: "±10%" }, { value: "0.2", label: "±20%" }]} />
            </>
          }
        />
        <div className="h-80 p-4">
          <ResponsiveContainer>
            <BarChart data={bars} layout="vertical" stackOffset="sign" margin={{ left: 24, right: 24 }}>
              <CartesianGrid stroke="#eef0f4" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtM} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="driver" width={150} tick={{ fontSize: 12, fill: "#0f172a" }} tickLine={false} axisLine={false} />
              <Tooltip formatter={tipFmt((v: number, n: string) => [fmtM(v), n === "low" ? `Driver −${Math.round(delta * 100)}%` : `Driver +${Math.round(delta * 100)}%`])} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
              <ReferenceLine x={0} stroke="#94a3b8" />
              <Bar dataKey="low" stackId="t" fill="#f87171" radius={4} />
              <Bar dataKey="high" stackId="t" fill="#34d399" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
          <b className="text-ink">{bars[0]?.driver}</b> has the most leverage. A {Math.round(delta * 100)}% move changes {TARGET_LABEL[metric].toLowerCase()} by up to {fmtM(Math.max(Math.abs(bars[0]?.low ?? 0), Math.abs(bars[0]?.high ?? 0)))}.
        </div>
      </Card>
      <Card>
        <CardHeader title="Two-way data table: price × volume" subtitle={`${TARGET_LABEL[metric]} for combined price and volume changes`} />
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[620px] border-separate border-spacing-1 text-[12px]">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-[11px] font-semibold text-muted">Price ↓ / Volume →</th>
                {steps.map((s) => <th key={s} className="px-2 py-1 text-center font-semibold">{fmtPct(s, 0, true)}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.price}>
                  <td className="px-2 py-1 font-semibold">{fmtPct(r.price, 0, true)}</td>
                  {r.cells.map((c) => (
                    <td key={c.volume} className={clsx("tabular rounded-md px-2 py-2 text-center font-medium", r.price === 0 && c.volume === 0 && "ring-2 ring-indigo-500")} style={{ background: color(c.value) }}>
                      {fmtM(c.value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function GoalSeek({ b, d, cur, onApply }: { b: Baseline; d: Drivers; cur: string; onApply: (d: Drivers) => void }) {
  const current = evaluate(b, d);
  const [metric, setMetric] = useState<TargetMetric>("operatingIncome");
  const defaultTarget = (m: TargetMetric) => (m === "operatingMargin" ? Math.max(0.15, current.operatingMargin + 0.05) : Math.round((Math.max(current[m], 0) * 1.25 + (m === "revenue" ? 0 : 0.05 * current.revenue)) / 1000) * 1000);
  const [target, setTarget] = useState<number>(defaultTarget("operatingIncome"));
  const results = useMemo(() => goalSeek(b, d, metric, target), [b, d, metric, target]);
  const isPct = metric === "operatingMargin";
  return (
    <>
      <Card>
        <CardHeader icon={<Target className="h-4 w-4" />} title="Reverse planning: what does it take?" subtitle="Set a target. Fintel Hub finds the smallest change in each lever that reaches it on its own, plus a balanced mix." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Target metric">
            <select className={inputCls} value={metric} onChange={(e) => { const m = e.target.value as TargetMetric; setMetric(m); setTarget(defaultTarget(m)); }}>
              {(Object.keys(TARGET_LABEL) as TargetMetric[]).map((k) => <option key={k} value={k}>{TARGET_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label={isPct ? "Target (%)" : `Target (${cur} / year)`}>
            <NumInput value={isPct ? Math.round(target * 1000) / 10 : target} step={isPct ? 0.5 : 10000} onChange={(v) => setTarget(isPct ? v / 100 : v)} />
          </Field>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-[11px] text-muted">Current {TARGET_LABEL[metric].toLowerCase()}</div>
            <div className="tabular text-lg font-semibold">{isPct ? fmtPct(current[metric]) : fmtMoney(current[metric], cur)}</div>
            <div className="text-[11px] text-muted">Gap: <b className="text-ink">{isPct ? ((target - current[metric]) * 100).toFixed(1) + " pts" : fmtMoney(target - current[metric], cur)}</b></div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {results.map((r) => {
          const nd: Drivers = r.lever.key === "balanced"
            ? { ...d, volume: d.volume + 0.3 * r.value, price: d.price + 0.15 * r.value, unitCost: d.unitCost - 0.15 * r.value, fixed: d.fixed - 0.15 * r.value }
            : { ...d, [r.lever.key]: (d[r.lever.key as keyof Drivers] as number) + r.value };
          const realistic = r.feasible && (r.lever.unit === "people" ? Math.abs(r.value) <= b.headcount * 0.3 : r.lever.key === "balanced" ? r.value <= 0.7 : Math.abs(r.value) <= (r.lever.key === "volume" || r.lever.key === "productivity" ? 0.35 : 0.2));
          return (
            <Card key={r.lever.key} className={clsx("p-5", r.lever.key === "balanced" && "md:col-span-2 bg-gradient-to-br from-indigo-50/70 to-white")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {r.feasible ? <CheckCircle2 className="h-5 w-5 text-good" /> : <XCircle className="h-5 w-5 text-slate-300" />}
                  <div className="font-semibold">{r.lever.label}</div>
                </div>
                {r.feasible && <Badge tone={realistic ? "good" : "warn"}>{realistic ? "Achievable" : "Stretch"}</Badge>}
              </div>
              {r.feasible ? (
                <>
                  <div className="tabular mt-3 text-2xl font-semibold tracking-tight text-ink">
                    {r.lever.key === "balanced" ? `${Math.round(r.value * 100)}% effort` : r.lever.unit === "people" ? `${r.value > 0 ? "+" : ""}${r.value} people` : fmtPct(r.value, 1, true)}
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{r.note}</p>
                  {r.outcome && (
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                      <span>Revenue <b className="text-ink">{fmtMoney(r.outcome.revenue, cur)}</b></span>
                      <span>Op. profit <b className="text-ink">{fmtMoney(r.outcome.operatingIncome, cur)}</b></span>
                      <span>Margin <b className="text-ink">{fmtPct(r.outcome.operatingMargin)}</b></span>
                    </div>
                  )}
                  {r.value !== 0 && <Button size="sm" variant="secondary" className="mt-3" onClick={() => onApply(nd)}><Crosshair className="h-3.5 w-3.5" />Apply to what-if</Button>}
                </>
              ) : (
                <p className="mt-2 text-[13px] text-muted">{r.note}</p>
              )}
            </Card>
          );
        })}
      </div>
      <p className="text-[12px] text-muted">Need several levers at once, under hard constraints such as capacity, budget or minimum staffing? Use the <Link className="font-medium text-brand hover:underline" href="/optimize">Optimizer</Link>.</p>
    </>
  );
}
