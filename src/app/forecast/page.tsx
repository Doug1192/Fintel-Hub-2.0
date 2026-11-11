"use client";

import { tipFmt } from "@/components/chart";
import { useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, LineChart as LineIcon } from "lucide-react";
import { Badge, Button, Callout, Card, CardHeader, Field, inputCls, Kpi, PageHeader, Segmented, Slider } from "@/components/ui";
import { useDataset } from "@/store/useStore";
import { canAggregate, summarize, totals } from "@/lib/finance";
import { forecastPnl, type ForecastMethod } from "@/lib/forecast";
import { fmtMoney, fmtPct, periodLabel } from "@/lib/format";
import type { Granularity } from "@/lib/types";
import { downloadText } from "@/lib/fileReaders";

const METHOD_LABEL: Record<ForecastMethod, string> = {
  auto: "Auto (best fit)",
  "holt-winters": "Holt-Winters (trend + seasonality)",
  holt: "Holt (damped trend)",
  linear: "Linear regression",
  cagr: "Compound growth (CAGR)",
};

const HORIZONS: Record<Granularity, number[]> = { month: [3, 6, 12, 18, 24, 36], quarter: [2, 4, 6, 8, 12], year: [1, 2, 3, 5] };

export default function ForecastPage() {
  const ds = useDataset();
  const grans = (["month", "quarter", "year"] as Granularity[]).filter((g) => canAggregate(ds.granularity, g));
  const [g, setG] = useState<Granularity>(grans[0]);
  const [h, setH] = useState(g === "month" ? 12 : g === "quarter" ? 4 : 3);
  const [method, setMethod] = useState<ForecastMethod>("auto");
  const [growthAdj, setGrowthAdj] = useState(0);
  const [fixedInflation, setFixedInflation] = useState(0.03);
  const [varAdj, setVarAdj] = useState(0);
  const [taxRate, setTaxRate] = useState(0.24);

  const hist = useMemo(() => summarize(ds, g), [ds, g]);
  const fc = useMemo(
    () => (hist.length >= 3 ? forecastPnl(hist, g, h, { method, growthAdj, fixedInflation, variableRatioAdj: varAdj, taxRate }) : null),
    [hist, g, h, method, growthAdj, fixedInflation, varAdj, taxRate],
  );
  const cur = ds.currency;

  if (!fc) {
    return (
      <>
        <PageHeader eyebrow="Forecast" title="Forecasting workspace" />
        <Callout tone="warn" title="Not enough history">Forecasting needs at least 3 periods at the chosen level. Upload more periods or pick a finer level.</Callout>
        <div className="mt-4"><Segmented value={g} onChange={setG} options={grans.map((x) => ({ value: x, label: x }))} /></div>
      </>
    );
  }

  const future = fc.rows.filter((r) => !r.actual);
  const lastActual = fc.rows.filter((r) => r.actual).slice(-future.length);
  const fT = { revenue: future.reduce((a, r) => a + r.revenue, 0), net: future.reduce((a, r) => a + r.netIncome, 0), op: future.reduce((a, r) => a + r.operatingIncome, 0) };
  const pT = totals(hist.slice(-future.length));
  const data = fc.rows.map((r) => ({
    label: periodLabel(r.period), actual: r.actual ? r.revenue : null, forecast: r.actual ? null : r.revenue,
    band: r.actual ? null : [r.revenueLow, r.revenueHigh], op: r.operatingIncome, net: r.netIncome,
    costs: r.cogs + r.variable + r.fixed,
  }));
  // Join actual and forecast lines visually.
  const lastIdx = fc.rows.findIndex((r) => !r.actual) - 1;
  if (lastIdx >= 0) data[lastIdx].forecast = data[lastIdx].actual;
  const splitLabel = data[lastIdx]?.label;

  const exportCsv = () => {
    const head = "Period,Type,Revenue,Revenue low (80%),Revenue high (80%),COGS,Variable opex,Fixed opex,Operating income,Net income";
    const body = fc.rows.map((r) => [r.period, r.actual ? "Actual" : "Forecast", r.revenue, r.revenueLow, r.revenueHigh, r.cogs, r.variable, r.fixed, r.operatingIncome, r.netIncome].map((v) => (typeof v === "number" ? Math.round(v) : v)).join(",")).join("\n");
    downloadText(`forecast_${g}_${h}.csv`, head + "\n" + body);
  };

  return (
    <>
      <PageHeader
        eyebrow="Forecast"
        title="Forecasting workspace"
        subtitle="Driver-based P&L forecast. Revenue comes from a statistical model (with seasonality when there's enough history); costs follow your cost structure, with adjustable assumptions."
        right={<Button variant="secondary" size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5" />Export CSV</Button>}
      />

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader icon={<LineIcon className="h-4 w-4" />} title="Forecast settings" />
          <div className="space-y-5 p-5">
            <Field label="Timeline">
              <Segmented value={g} onChange={(v) => { setG(v); setH(v === "month" ? 12 : v === "quarter" ? 4 : 3); }} options={(["month", "quarter", "year"] as Granularity[]).map((x) => ({ value: x, label: x === "month" ? "Monthly" : x === "quarter" ? "Quarterly" : "Yearly", disabled: !grans.includes(x) }))} />
            </Field>
            <Field label="Horizon">
              <div className="flex flex-wrap gap-1.5">
                {HORIZONS[g].map((n) => (
                  <button key={n} onClick={() => setH(n)} className={`rounded-md border px-2.5 py-1 text-[12px] font-medium ${h === n ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-ink"}`}>{n} {g === "month" ? "mo" : g === "quarter" ? "qtr" : "yr"}</button>
                ))}
              </div>
            </Field>
            <Field label="Model">
              <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as ForecastMethod)}>
                {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <div className="border-t border-line pt-4 text-[12px] font-semibold uppercase tracking-wide text-muted">Assumptions</div>
            <Slider label="Extra revenue growth / yr" value={growthAdj} onChange={setGrowthAdj} min={-0.3} max={0.5} step={0.01} format={(v) => fmtPct(v, 0, true)} hint="Applied on top of the statistical trend, e.g. a new product launch" />
            <Slider label="Fixed-cost inflation / yr" value={fixedInflation} onChange={setFixedInflation} min={-0.1} max={0.2} step={0.005} format={(v) => fmtPct(v, 1, true)} />
            <Slider label="Variable-cost ratio change" value={varAdj} onChange={setVarAdj} min={-0.1} max={0.1} step={0.0025} format={(v) => (v > 0 ? "+" : "") + (v * 100).toFixed(2) + " pts"} hint="Negative = better unit economics" />
            <Slider label="Tax rate" value={taxRate} onChange={setTaxRate} min={0} max={0.45} step={0.01} format={(v) => fmtPct(v, 0)} />
            <div className="rounded-lg bg-slate-50 p-3 text-[12px] text-muted">
              Model used: <b className="text-ink">{fc.revenueModel.method}</b> · in-sample error (MAPE) <b className="text-ink">{fmtPct(fc.revenueModel.mape)}</b>
              <br />COGS {fmtPct(fc.ratios.cogsRatio)} + variable {fmtPct(fc.ratios.varRatio)} of revenue
            </div>
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={`Forecast revenue (${h} ${g}s)`} value={fmtMoney(fT.revenue, cur)} delta={pT.revenue ? fT.revenue / pT.revenue - 1 : null} deltaLabel={`vs last ${lastActual.length} ${g}s`} accent="#6366f1" />
            <Kpi label="Forecast operating income" value={fmtMoney(fT.op, cur)} delta={pT.operatingIncome ? (fT.op - pT.operatingIncome) / Math.abs(pT.operatingIncome) : null} deltaLabel="vs same span" accent="#7c3aed" />
            <Kpi label="Forecast net income" value={fmtMoney(fT.net, cur)} delta={pT.netIncome ? (fT.net - pT.netIncome) / Math.abs(pT.netIncome) : null} deltaLabel="vs same span" accent="#059669" />
            <Kpi label="Forecast net margin" value={fmtPct(fT.revenue ? fT.net / fT.revenue : 0)} accent="#d97706" />
          </div>

          <Card>
            <CardHeader title="Revenue forecast" subtitle="Shaded area shows the 80% prediction range." right={<Badge tone="brand">{METHOD_LABEL[method]}</Badge>} />
            <div className="h-80 p-4">
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#eef0f4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tickFormatter={(v) => fmtMoney(v, cur)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
                  <Tooltip formatter={tipFmt((v: number | number[]) => (Array.isArray(v) ? `${fmtMoney(v[0], cur)} – ${fmtMoney(v[1], cur)}` : fmtMoney(v, cur, false)))} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {splitLabel && <ReferenceLine x={splitLabel} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: "Forecast →", position: "insideTopRight", fontSize: 11, fill: "#64748b" }} />}
                  <Area dataKey="band" name="80% range" stroke="none" fill="#6366f1" fillOpacity={0.14} />
                  <Line dataKey="actual" name="Actual" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                  <Line dataKey="forecast" name="Forecast" stroke="#6366f1" strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader title="Profit outlook" subtitle="Total costs (bars) with operating and net income (lines)" />
            <div className="h-72 p-4">
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#eef0f4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tickFormatter={(v) => fmtMoney(v, cur)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
                  <Tooltip formatter={tipFmt((v: number) => fmtMoney(v, cur, false))} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {splitLabel && <ReferenceLine x={splitLabel} stroke="#94a3b8" strokeDasharray="3 3" />}
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  <Bar dataKey="costs" name="Total operating costs" fill="#e2e8f0" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Line dataKey="op" name="Operating income" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  <Line dataKey="net" name="Net income" stroke="#059669" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader title="Forecast P&L" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12.5px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-2 text-left font-semibold">Period</th>
                    <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                    <th className="px-3 py-2 text-right font-semibold">Range (80%)</th>
                    <th className="px-3 py-2 text-right font-semibold">COGS + variable</th>
                    <th className="px-3 py-2 text-right font-semibold">Fixed</th>
                    <th className="px-3 py-2 text-right font-semibold">Operating inc.</th>
                    <th className="px-5 py-2 text-right font-semibold">Net income</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {future.map((r) => (
                    <tr key={r.period} className="hover:bg-slate-50/60">
                      <td className="px-5 py-2 font-medium">{periodLabel(r.period)}</td>
                      <td className="tabular px-3 py-2 text-right font-semibold">{fmtMoney(r.revenue, cur)}</td>
                      <td className="tabular px-3 py-2 text-right text-muted">{fmtMoney(r.revenueLow, cur)} – {fmtMoney(r.revenueHigh, cur)}</td>
                      <td className="tabular px-3 py-2 text-right">{fmtMoney(r.cogs + r.variable, cur)}</td>
                      <td className="tabular px-3 py-2 text-right">{fmtMoney(r.fixed, cur)}</td>
                      <td className={`tabular px-3 py-2 text-right ${r.operatingIncome < 0 ? "text-bad" : ""}`}>{fmtMoney(r.operatingIncome, cur)}</td>
                      <td className={`tabular px-5 py-2 text-right font-semibold ${r.netIncome < 0 ? "text-bad" : "text-good"}`}>{fmtMoney(r.netIncome, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
