"use client";

import { tipFmt } from "@/components/chart";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, RotateCcw, Tag, Trophy, XCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, NumInput, PageHeader, Slider } from "@/components/ui";
import { useStore } from "@/store/useStore";
import { pricingChecks, simulate, STRATEGIES, type PricingInputs, type Strategy } from "@/lib/pricing";
import { periodsPerYear, trailingYear } from "@/lib/finance";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { Dataset } from "@/lib/types";

const COLORS = ["#64748b", "#7c3aed", "#0891b2", "#059669", "#ea580c"];

function defaultsFrom(ds: Dataset): PricingInputs {
  const { current: c } = trailingYear(ds);
  const months = (12 / periodsPerYear(ds.granularity)) * Math.max(1, Math.min(periodsPerYear(ds.granularity), ds.periods.length));
  const monthlyRev = c.revenue / Math.max(1, months) || 50000;
  const price = 85;
  const varRatio = c.revenue ? (c.cogs + c.variable) / c.revenue : 0.55;
  const units = monthlyRev / price;
  const upc = 1.4;
  const customers = units / upc;
  const churn = 0.04;
  const marketing = ds.lines.filter((l) => /marketing|advertis/i.test(l.group + " " + l.name)).reduce((a, l) => a + l.values.slice(-periodsPerYear(ds.granularity)).reduce((x, y) => x + y, 0), 0) / 12;
  const newCust = Math.max(1, customers * churn * 1.03);
  return {
    price,
    unitCost: Math.round(price * varRatio * 100) / 100,
    fixedMonthly: Math.round(c.fixed / Math.max(1, months)),
    newCustomersMonthly: Math.round(newCust),
    unitsPerCustomerMonthly: upc,
    startingCustomers: Math.round(customers),
    churnMonthly: churn,
    elasticity: -1.2,
    cacPerCustomer: Math.round(marketing > 0 ? marketing / newCust : 45),
    horizonMonths: 36,
    discountRateAnnual: 0.1,
  };
}

export default function PricingPage() {
  const ds = useStore((s) => s.dataset);
  const defaults = useMemo(() => defaultsFrom(ds), [ds]);
  const [inp, setInp] = useState<PricingInputs>(defaults);
  const [custom, setCustom] = useState<Strategy>({ id: "custom", name: "Custom strategy", description: "Your own price change and assumptions.", priceChange: 0.05, churnChange: 0, acquisitionBoost: 0 });
  const set = (k: keyof PricingInputs) => (v: number) => setInp((x) => ({ ...x, [k]: v }));
  const cur = ds.currency;

  const results = useMemo(() => [...STRATEGIES, custom].map((s) => simulate(inp, s)), [inp, custom]);
  const current = results[0];
  const best = results.reduce((a, b) => (b.npv > a.npv ? b : a));
  const checks = pricingChecks(inp, current, best);
  const chart = current.months.map((m, i) => {
    const row: Record<string, number> = { m: m.m };
    results.forEach((r) => (row[r.strategy.id] = r.months[i].cumNpv));
    return row;
  });

  return (
    <>
      <PageHeader
        eyebrow="Decide"
        title="Pricing strategy lab"
        subtitle="Check whether your pricing pays off over the long run. The simulation includes price elasticity, customer churn, acquisition cost and the time value of money, and compares common strategies on net present value."
        right={<Button variant="secondary" size="sm" onClick={() => setInp(defaults)}><RotateCcw className="h-3.5 w-3.5" />Reset from my data</Button>}
      />

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader icon={<Tag className="h-4 w-4" />} title="Unit economics" subtitle="Prefilled from your statements. Edit freely." />
          <div className="grid grid-cols-2 gap-3 p-5">
            <Field label="Avg selling price"><NumInput value={inp.price} step={1} onChange={set("price")} /></Field>
            <Field label="Variable cost / unit"><NumInput value={inp.unitCost} step={1} onChange={set("unitCost")} /></Field>
            <Field label="Fixed costs / month"><NumInput value={inp.fixedMonthly} step={1000} onChange={set("fixedMonthly")} /></Field>
            <Field label="CAC per customer"><NumInput value={inp.cacPerCustomer} step={5} onChange={set("cacPerCustomer")} /></Field>
            <Field label="Active customers"><NumInput value={inp.startingCustomers} step={50} onChange={set("startingCustomers")} /></Field>
            <Field label="New customers / mo"><NumInput value={inp.newCustomersMonthly} step={10} onChange={set("newCustomersMonthly")} /></Field>
            <Field label="Units / customer / mo"><NumInput value={inp.unitsPerCustomerMonthly} step={0.1} onChange={set("unitsPerCustomerMonthly")} /></Field>
            <Field label="Horizon (months)"><NumInput value={inp.horizonMonths} step={6} min={6} max={120} onChange={(v) => set("horizonMonths")(Math.max(6, Math.min(120, v)))} /></Field>
            <div className="col-span-2 space-y-4 border-t border-line pt-4">
              <Slider label="Monthly churn" value={inp.churnMonthly} onChange={set("churnMonthly")} min={0.005} max={0.2} step={0.005} format={(v) => fmtPct(v, 1)} />
              <Slider label="Price elasticity" value={inp.elasticity} onChange={set("elasticity")} min={-3} max={0} step={0.1} format={(v) => v.toFixed(1)} hint="Effect of price on new-customer acquisition" />
              <Slider label="Discount rate (annual)" value={inp.discountRateAnnual} onChange={set("discountRateAnnual")} min={0} max={0.3} step={0.01} format={(v) => fmtPct(v, 0)} />
            </div>
            <div className="col-span-2 space-y-4 border-t border-line pt-4">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Custom strategy</div>
              <Slider label="Price change" value={custom.priceChange} onChange={(v) => setCustom((c) => ({ ...c, priceChange: v }))} min={-0.4} max={0.5} step={0.01} format={(v) => fmtPct(v, 0, true)} />
              <Slider label="Churn change (pts)" value={custom.churnChange} onChange={(v) => setCustom((c) => ({ ...c, churnChange: v }))} min={-0.03} max={0.03} step={0.001} format={(v) => (v > 0 ? "+" : "") + (v * 100).toFixed(1)} />
              <Slider label="Acquisition boost" value={custom.acquisitionBoost} onChange={(v) => setCustom((c) => ({ ...c, acquisitionBoost: v }))} min={-0.3} max={0.5} step={0.01} format={(v) => fmtPct(v, 0, true)} hint="Extra new customers from marketing or positioning, beyond the price effect" />
            </div>
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-[#0f1330] to-indigo-900 px-6 py-5 text-white">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-300/20"><Trophy className="h-6 w-6 text-amber-300" /></div>
              <div className="flex-1">
                <div className="text-[12px] uppercase tracking-wider text-indigo-200">Best long-run strategy ({inp.horizonMonths} months, NPV)</div>
                <div className="text-xl font-semibold">{best.strategy.name}</div>
                <div className="text-[13px] text-indigo-200">{best.strategy.description}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] text-indigo-200">NPV vs current</div>
                <div className="tabular text-2xl font-semibold text-amber-300">{best.npv - current.npv >= 0 ? "+" : ""}{fmtMoney(best.npv - current.npv, cur)}</div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Cumulative NPV by strategy" subtitle="Penetration pricing often starts behind and catches up later. This chart shows whether it does." />
            <div className="h-80 p-4">
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ left: 8, right: 16, top: 8 }}>
                  <CartesianGrid stroke="#eef0f4" vertical={false} />
                  <XAxis dataKey="m" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} label={{ value: "Month", position: "insideBottomRight", offset: -2, fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tickFormatter={(v) => fmtMoney(v, cur)} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={64} />
                  <Tooltip formatter={tipFmt((v: number) => fmtMoney(v, cur, false))} labelFormatter={(l) => `Month ${l}`} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  {results.map((r, i) => (
                    <Line key={r.strategy.id} dataKey={r.strategy.id} name={r.strategy.name} stroke={r.strategy.id === "custom" ? "#d4a017" : COLORS[i % COLORS.length]} strokeWidth={r.strategy.id === best.strategy.id ? 3 : 1.75} dot={false} strokeDasharray={r.strategy.id === "custom" ? "5 4" : undefined} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader title="Strategy comparison" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[12.5px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-2 text-left font-semibold">Strategy</th>
                    <th className="px-3 py-2 text-right font-semibold">Avg price</th>
                    <th className="px-3 py-2 text-right font-semibold">CM / unit</th>
                    <th className="px-3 py-2 text-right font-semibold">End customers</th>
                    <th className="px-3 py-2 text-right font-semibold">LTV</th>
                    <th className="px-3 py-2 text-right font-semibold">LTV:CAC</th>
                    <th className="px-3 py-2 text-right font-semibold">Payback</th>
                    <th className="px-3 py-2 text-right font-semibold">Total profit</th>
                    <th className="px-5 py-2 text-right font-semibold">NPV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...results].sort((a, b) => b.npv - a.npv).map((r) => (
                    <tr key={r.strategy.id} className={clsx(r.strategy.id === best.strategy.id && "bg-emerald-50/60")}>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2 font-medium">{r.strategy.name}{r.strategy.id === best.strategy.id && <Badge tone="good">Best</Badge>}{r.strategy.id === "current" && <Badge>Baseline</Badge>}</div>
                        <div className="text-[11.5px] text-muted">{r.strategy.description}</div>
                      </td>
                      <td className="tabular px-3 py-2.5 text-right">{fmtMoney(r.avgPrice, cur, false)}</td>
                      <td className={clsx("tabular px-3 py-2.5 text-right", r.contributionMarginUnit <= 0 && "text-bad")}>{fmtMoney(r.contributionMarginUnit, cur, false)}</td>
                      <td className="tabular px-3 py-2.5 text-right">{Math.round(r.endCustomers).toLocaleString()}</td>
                      <td className="tabular px-3 py-2.5 text-right">{fmtMoney(r.ltv, cur)}</td>
                      <td className={clsx("tabular px-3 py-2.5 text-right", r.ltvToCac >= 3 ? "text-good" : r.ltvToCac < 1.5 ? "text-bad" : "text-warn")}>{isFinite(r.ltvToCac) ? r.ltvToCac.toFixed(1) + "×" : "∞"}</td>
                      <td className="tabular px-3 py-2.5 text-right">{isFinite(r.paybackMonths) ? r.paybackMonths.toFixed(1) + " mo" : "never"}</td>
                      <td className="tabular px-3 py-2.5 text-right">{fmtMoney(r.totalProfit, cur)}</td>
                      <td className="tabular px-5 py-2.5 text-right font-semibold">{fmtMoney(r.npv, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pricing health check" subtitle="Does the current pricing pay off in the long run?" />
            <div className="grid gap-3 p-5 md:grid-cols-2">
              {checks.map((c) => (
                <div key={c.label} className="flex gap-3 rounded-xl border border-line p-3.5">
                  <div className="mt-0.5">{c.status === "pass" ? <CheckCircle2 className="h-5 w-5 text-good" /> : c.status === "warn" ? <AlertTriangle className="h-5 w-5 text-warn" /> : <XCircle className="h-5 w-5 text-bad" />}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">{c.label}<span className="tabular rounded bg-slate-100 px-1.5 py-0.5 text-[11.5px] font-medium text-slate-700">{c.value}</span></div>
                    <div className="mt-0.5 text-[12.5px] text-muted">{c.advice}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
