"use client";

import { tipFmt } from "@/components/chart";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Calculator, CheckCircle2, Plus, Sparkles, Trash2, Wand2, XCircle } from "lucide-react";
import { Badge, Button, Callout, Card, CardHeader, inputCls, PageHeader, Segmented } from "@/components/ui";
import { solve, TEMPLATES, type OptModel } from "@/lib/optimize";
import { fmtNum } from "@/lib/format";
import { postAi, useAiStatus } from "@/components/useAi";

interface AiModel {
  title: string;
  direction: "max" | "min";
  objectiveName: string;
  variables: { name: string; label: string; objective: number; min: number; max: number | null; integer: boolean }[];
  constraints: { name: string; terms: { variable: string; coefficient: number }[]; relation: "<=" | ">=" | "="; rhs: number }[];
  notes: string;
}

const clone = (m: OptModel): OptModel => JSON.parse(JSON.stringify(m));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "x";

export default function OptimizePage() {
  const [model, setModel] = useState<OptModel>(clone(TEMPLATES[0].model));
  const [tpl, setTpl] = useState(TEMPLATES[0].id);
  const [solved, setSolved] = useState<OptModel | null>(model);
  const ai = useAiStatus();
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const result = useMemo(() => (solved ? solve(solved) : null), [solved]);

  const upd = (fn: (m: OptModel) => void) => setModel((m) => { const c = clone(m); fn(c); return c; });

  const loadTpl = (id: string) => {
    setTpl(id);
    const m = clone(TEMPLATES.find((t) => t.id === id)!.model);
    setModel(m);
    setSolved(m);
  };

  const buildWithAi = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await postAi<AiModel>("/api/ai/optimize", { description: desc });
      const m: OptModel = {
        title: r.title, direction: r.direction, objectiveName: r.objectiveName, notes: r.notes,
        variables: r.variables.map((v) => ({ ...v, name: slug(v.name) })),
        constraints: r.constraints.map((c) => ({ name: c.name, relation: c.relation, rhs: c.rhs, terms: Object.fromEntries(c.terms.map((t) => [slug(t.variable), t.coefficient])) })),
      };
      setModel(m);
      setSolved(m);
      setTpl("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dirty = JSON.stringify(model) !== JSON.stringify(solved);

  return (
    <>
      <PageHeader
        eyebrow="Decide"
        title="Optimization studio"
        subtitle="Define your decision variables, constraints and objective, and Fin-Zeus finds the best solution with linear or integer programming. Start from a template or describe the problem in plain English."
        right={<Button onClick={() => setSolved(clone(model))}><Calculator className="h-4 w-4" />Solve{dirty ? " (changes pending)" : ""}</Button>}
      />

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Start from a template</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => loadTpl(t.id)} className={clsx("rounded-lg border px-3 py-2 text-[13px] font-medium", tpl === t.id ? "border-brand bg-brand-soft text-brand" : "border-line hover:bg-slate-50")}>{t.label}</button>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted"><Sparkles className="h-3.5 w-3.5 text-brand" />Describe it in words</div>
          <div className="mt-3 flex gap-2">
            <input className={inputCls} placeholder="e.g. We make tables ($40 profit) and chairs ($25). Tables use 3h carpentry, chairs 1h; we have 120h…" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!ai?.configured} />
            <Button onClick={buildWithAi} loading={busy} disabled={!ai?.configured || desc.trim().length < 15}><Wand2 className="h-4 w-4" />Build</Button>
          </div>
          {!ai?.configured && <p className="mt-2 text-[11.5px] text-muted">Needs the AI engine (an Anthropic API key on the server). Templates and the manual builder work without it.</p>}
          {err && <div className="mt-2"><Callout tone="bad">{err}</Callout></div>}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="1 · Objective" />
            <div className="grid gap-3 p-5 sm:grid-cols-[auto_1fr]">
              <Segmented value={model.direction} onChange={(v) => upd((m) => { m.direction = v; })} options={[{ value: "max", label: "Maximise" }, { value: "min", label: "Minimise" }]} />
              <input className={inputCls} value={model.objectiveName} onChange={(e) => upd((m) => { m.objectiveName = e.target.value; })} />
            </div>
            {model.notes && <div className="px-5 pb-4"><Callout tone="info" title="Assumptions">{model.notes}</Callout></div>}
          </Card>

          <Card>
            <CardHeader title="2 · Decision variables" subtitle="Objective coefficient = contribution of one unit to the goal" right={<Button size="sm" variant="secondary" onClick={() => upd((m) => { const n = m.variables.length + 1; m.variables.push({ name: `x${n}`, label: `Variable ${n}`, objective: 1, min: 0, max: null, integer: false }); })}><Plus className="h-3.5 w-3.5" />Add</Button>} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-[12.5px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                  <tr><th className="px-4 py-2 text-left">Label</th><th className="px-2 py-2 text-left">ID</th><th className="px-2 py-2 text-right">Obj. coef.</th><th className="px-2 py-2 text-right">Min</th><th className="px-2 py-2 text-right">Max</th><th className="px-2 py-2">Integer</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {model.variables.map((v, i) => (
                    <tr key={i}>
                      <td className="min-w-[170px] px-4 py-1.5"><input className={clsx(inputCls, "h-8")} value={v.label} onChange={(e) => upd((m) => { m.variables[i].label = e.target.value; })} /></td>
                      <td className="px-2 py-1.5"><input className={clsx(inputCls, "h-8 w-28 font-mono text-[12px]")} value={v.name} onChange={(e) => upd((m) => {
                        const nn = slug(e.target.value); const old = m.variables[i].name; m.variables[i].name = nn;
                        m.constraints.forEach((c) => { if (old in c.terms) { c.terms[nn] = c.terms[old]; delete c.terms[old]; } });
                      })} /></td>
                      <td className="px-2 py-1.5"><input type="number" className={clsx(inputCls, "h-8 w-24 text-right")} value={v.objective} onChange={(e) => upd((m) => { m.variables[i].objective = Number(e.target.value); })} /></td>
                      <td className="px-2 py-1.5"><input type="number" className={clsx(inputCls, "h-8 w-20 text-right")} value={v.min} onChange={(e) => upd((m) => { m.variables[i].min = Number(e.target.value); })} /></td>
                      <td className="px-2 py-1.5"><input type="number" placeholder="∞" className={clsx(inputCls, "h-8 w-24 text-right")} value={v.max ?? ""} onChange={(e) => upd((m) => { m.variables[i].max = e.target.value === "" ? null : Number(e.target.value); })} /></td>
                      <td className="px-2 py-1.5 text-center"><input type="checkbox" className="accent-indigo-600" checked={v.integer} onChange={(e) => upd((m) => { m.variables[i].integer = e.target.checked; })} /></td>
                      <td className="px-2"><button className="p-1 text-slate-400 hover:text-bad" onClick={() => upd((m) => { const n = m.variables[i].name; m.variables.splice(i, 1); m.constraints.forEach((c) => delete c.terms[n]); })} aria-label="Remove variable"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="3 · Constraints" subtitle="Coefficient × variable, summed, must satisfy the relation" right={<Button size="sm" variant="secondary" onClick={() => upd((m) => { m.constraints.push({ name: `Constraint ${m.constraints.length + 1}`, terms: {}, relation: "<=", rhs: 0 }); })}><Plus className="h-3.5 w-3.5" />Add</Button>} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12.5px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 text-left">Constraint</th>
                    {model.variables.map((v) => <th key={v.name} className="px-2 py-2 text-right font-mono normal-case">{v.name}</th>)}
                    <th className="px-2 py-2">Rel.</th><th className="px-2 py-2 text-right">Limit</th><th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {model.constraints.map((c, i) => (
                    <tr key={i}>
                      <td className="min-w-[190px] px-4 py-1.5"><input className={clsx(inputCls, "h-8")} value={c.name} onChange={(e) => upd((m) => { m.constraints[i].name = e.target.value; })} /></td>
                      {model.variables.map((v) => (
                        <td key={v.name} className="px-2 py-1.5"><input type="number" className={clsx(inputCls, "h-8 w-20 text-right")} value={c.terms[v.name] ?? 0} onChange={(e) => upd((m) => { m.constraints[i].terms[v.name] = Number(e.target.value); })} /></td>
                      ))}
                      <td className="px-2 py-1.5">
                        <select className={clsx(inputCls, "h-8 w-16 px-1")} value={c.relation} onChange={(e) => upd((m) => { m.constraints[i].relation = e.target.value as "<=" | ">=" | "="; })}>
                          <option value="<=">≤</option><option value=">=">≥</option><option value="=">=</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><input type="number" className={clsx(inputCls, "h-8 w-28 text-right")} value={c.rhs} onChange={(e) => upd((m) => { m.constraints[i].rhs = Number(e.target.value); })} /></td>
                      <td className="px-2"><button className="p-1 text-slate-400 hover:text-bad" onClick={() => upd((m) => { m.constraints.splice(i, 1); })} aria-label="Remove constraint"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          {result && solved && (
            <>
              <Card className={clsx("p-5", result.feasible ? "bg-gradient-to-br from-emerald-50 to-white" : "bg-red-50")}>
                <div className="flex items-center gap-2">
                  {result.feasible ? <CheckCircle2 className="h-5 w-5 text-good" /> : <XCircle className="h-5 w-5 text-bad" />}
                  <div className="font-semibold">{result.feasible ? (result.bounded ? "Optimal solution found" : "Unbounded: add limits") : "No feasible solution"}</div>
                </div>
                {result.feasible ? (
                  <>
                    <div className="mt-3 text-[12px] text-muted">{solved.direction === "max" ? "Maximum" : "Minimum"} {solved.objectiveName.toLowerCase()}</div>
                    <div className="tabular text-3xl font-semibold tracking-tight">{fmtNum(result.objective, 2)}</div>
                  </>
                ) : (
                  <p className="mt-2 text-[13px] text-red-800">The constraints conflict, so no values satisfy all of them. Relax a limit or a minimum bound.</p>
                )}
              </Card>
              {result.feasible && (
                <>
                  <Card>
                    <CardHeader title="Optimal decision" />
                    <div className="h-56 p-4">
                      <ResponsiveContainer>
                        <BarChart data={solved.variables.map((v) => ({ name: v.label, value: result.values[v.name] }))} layout="vertical" margin={{ left: 16, right: 24 }}>
                          <CartesianGrid stroke="#eef0f4" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                          <Tooltip formatter={tipFmt((v: number) => fmtNum(v, 2))} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                          <Bar dataKey="value" fill="#4f46e5" radius={4} maxBarSize={26} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <table className="w-full text-[13px]">
                      <tbody className="divide-y divide-line border-t border-line">
                        {solved.variables.map((v) => (
                          <tr key={v.name}>
                            <td className="px-5 py-2">{v.label}</td>
                            <td className="tabular px-3 py-2 text-right font-semibold">{fmtNum(result.values[v.name], v.integer ? 0 : 2)}</td>
                            <td className="tabular px-5 py-2 text-right text-muted">{fmtNum(v.objective * result.values[v.name], 0)} to objective</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                  <Card>
                    <CardHeader title="Constraint analysis" subtitle="Binding constraints are your bottlenecks. The shadow price is the gain from one more unit of that resource." />
                    <div className="divide-y divide-line">
                      {result.constraints.map((c) => {
                        const pctUsed = c.rhs ? Math.min(1, Math.abs(c.lhs / c.rhs)) : c.binding ? 1 : 0;
                        return (
                          <div key={c.name} className="px-5 py-3">
                            <div className="flex items-center justify-between gap-2 text-[13px]">
                              <span className="font-medium">{c.name}</span>
                              {c.binding ? <Badge tone="warn">Binding</Badge> : <Badge tone="neutral">Slack {fmtNum(c.slack, 1)}</Badge>}
                            </div>
                            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100"><div className={clsx("h-1.5 rounded-full", c.binding ? "bg-amber-500" : "bg-indigo-400")} style={{ width: `${pctUsed * 100}%` }} /></div>
                            <div className="mt-1 flex justify-between text-[11.5px] text-muted">
                              <span>{fmtNum(c.lhs, 1)} {c.relation} {fmtNum(c.rhs, 1)}</span>
                              {c.shadow !== null && c.binding && <span>Shadow price: <b className="text-ink">{fmtNum(c.shadow, 2)}</b> per unit</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </>
              )}
            </>
          )}
          <Card className="p-5 text-[12.5px] text-muted">
            <div className="mb-1 font-semibold text-ink">Tips</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>Mark variables as <b>Integer</b> when you can only choose whole units (people, products).</li>
              <li>For a share-based rule like “A ≥ 30% of total”, write A − 0.3·(A+B+…) ≥ 0.</li>
              <li>Shadow prices show what extra capacity or budget is worth. They are calculated for continuous models only.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
