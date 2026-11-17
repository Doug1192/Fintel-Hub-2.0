"use client";

import { tipFmt } from "@/components/chart";
import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, BookOpen, Calculator, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, Download, FileSpreadsheet, FileText,
  FunctionSquare, Info, Plus, Sigma, Sparkles, Trash2, Wand2, XCircle,
} from "lucide-react";
import { Badge, Button, Callout, Card, CardHeader, inputCls, PageHeader, Segmented } from "@/components/ui";
import { PreviewTable } from "@/components/PreviewTable";
import { postAi, useAiStatus } from "@/components/useAi";
import { useActiveAlias, useAliasDocs, useStore } from "@/store/useStore";
import {
  checkFeasible, formulation, ratioConstraint, sensitivity, shareConstraint, solve, toLpFormat, toPulp, toScipy, validateModel,
  weightedAverageConstraint, type OptConstraint, type OptModel, type OptResult, type Relation, type Sensitivity,
} from "@/lib/optimize";
import { TEMPLATES, type OptTemplate } from "@/lib/optTemplates";
import { downloadText } from "@/lib/fileReaders";
import { fmtNum } from "@/lib/format";
import type { VaultDoc } from "@/lib/types";

interface AiModel {
  title: string;
  direction: "max" | "min";
  objectiveName: string;
  variables: { name: string; label: string; objective: number; min: number | null; max: number | null; integer: boolean }[];
  constraints: { name: string; terms: { variable: string; coefficient: number }[]; relation: Relation; rhs: number; note: string }[];
  notes: string;
  linear: boolean;
}

const clone = <T,>(m: T): T => JSON.parse(JSON.stringify(m));
const slug = (s: string) => s.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "x";
const REL: Record<Relation, string> = { "<=": "≤", ">=": "≥", "=": "=" };
/** Number for reports: keeps decimals (up to 2 for large values, d for small) and drops trailing zeros. */
const num = (v: number, d = 4) => {
  if (!isFinite(v)) return "∞";
  if (Math.abs(v) < 5e-7) v = 0; // hide solver round-off such as −0.00000001
  const digits = Number.isInteger(v) ? 0 : Math.abs(v) >= 1000 ? 2 : d;
  return fmtNum(v, digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
};

function isModel(m: unknown): m is OptModel {
  return Boolean(m && typeof m === "object" && Array.isArray((m as OptModel).variables) && Array.isArray((m as OptModel).constraints));
}

const sameModel = (a: OptModel, b: OptModel) => JSON.stringify({ ...a, notes: "", title: "" }) === JSON.stringify({ ...b, notes: "", title: "" });

export default function OptimizePage() {
  const alias = useActiveAlias();
  const refDocs = useAliasDocs();
  const saveOptModel = useStore((s) => s.saveOptModel);
  const saved = alias && isModel(alias.optModel) ? (alias.optModel as OptModel) : null;
  const initialTpl = saved ? TEMPLATES.find((t) => t.model.title === saved.title) : TEMPLATES[0];
  const [tplId, setTplId] = useState<string>(initialTpl?.id ?? "");
  const [model, setModel] = useState<OptModel>(clone(saved ?? TEMPLATES[0].model));
  const [solved, setSolved] = useState<OptModel>(model);
  const [tab, setTab] = useState<"answer" | "sensitivity" | "formulation" | "export">("answer");
  const ai = useAiStatus();
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [showProblem, setShowProblem] = useState(true);

  useEffect(() => {
    if (alias) saveOptModel(alias.id, solved);
  }, [alias?.id, solved, saveOptModel]); // eslint-disable-line react-hooks/exhaustive-deps

  const template = TEMPLATES.find((t) => t.id === tplId);
  const errors = useMemo(() => validateModel(solved), [solved]);
  const result = useMemo(() => (errors.length ? null : solve(solved)), [solved, errors]);
  const sens = useMemo(() => (result && tab === "sensitivity" ? sensitivity(solved, result) : null), [solved, result, tab]);
  const altOptima = useMemo(() => (result && !result.hasIntegers && solved.direction !== "target" ? sensitivity(solved, result)?.alternativeOptima ?? false : false), [solved, result]);
  const dirty = JSON.stringify(model) !== JSON.stringify(solved);
  const pendingErrors = validateModel(model);
  const verify = template?.expected && sameModel(solved, template.model) ? template.expected : null;

  const upd = (fn: (m: OptModel) => void) => setModel((m) => { const c = clone(m); fn(c); return c; });

  const loadTpl = (t: OptTemplate) => {
    setTplId(t.id);
    const m = clone(t.model);
    setModel(m);
    setSolved(m);
    setShowProblem(true);
    setAiNote(null);
  };

  const buildWithAi = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await postAi<AiModel>("/api/ai/optimize", { description: desc });
      const m: OptModel = {
        title: r.title, direction: r.direction, objectiveName: r.objectiveName, notes: r.notes, nonNegative: true,
        variables: r.variables.map((v) => ({ ...v, name: slug(v.name) })),
        constraints: r.constraints.map((c) => ({ name: c.name, relation: c.relation, rhs: c.rhs, note: c.note || undefined, terms: Object.fromEntries(c.terms.map((t) => [slug(t.variable), t.coefficient])) })),
      };
      setModel(m);
      setSolved(m);
      setTplId("");
      setAiNote(r.linear ? null : "This problem looks nonlinear. The model below is a linear approximation; check it before relying on the answer.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const groups: { key: OptTemplate["group"]; title: string; hint: string }[] = [
    { key: "lab", title: "Module 1 lab · verified against Excel Solver", hint: "Required problems 1–3, answers match your workbook" },
    { key: "practice", title: "More practice · verified against Python (SciPy)", hint: "Optional problems 4, 5, 7, 9" },
    { key: "business", title: "Business templates", hint: "Starting points for your own models" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Decide"
        title="Optimization studio"
        subtitle={<>Built the way Excel Solver works: <b className="text-ink">set the objective</b>, choose the <b className="text-ink">changing (decision) variables</b>, add the <b className="text-ink">constraints</b>, and solve with the Simplex LP method. Linear and integer models are supported. The model is saved to the alias <b className="text-ink">{alias?.name}</b>.</>}
        right={<Button onClick={() => setSolved(clone(model))} disabled={pendingErrors.length > 0}><Calculator className="h-4 w-4" />Solve{dirty ? " (changes pending)" : ""}</Button>}
      />

      <div className="mb-5 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-3">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{g.title}</div>
                <div className="mb-2 text-[11px] text-slate-400">{g.hint}</div>
                <div className="flex flex-col gap-1.5">
                  {TEMPLATES.filter((t) => t.group === g.key).map((t) => (
                    <button key={t.id} onClick={() => loadTpl(t)} className={clsx("flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-[12.5px] font-medium", tplId === t.id ? "border-brand bg-brand-soft text-brand" : "border-line hover:bg-slate-50")}>
                      {t.label}{t.expected && <Check className="h-3.5 w-3.5 shrink-0 text-good" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted"><Sparkles className="h-3.5 w-3.5 text-brand" />Describe a problem in words</div>
          <textarea className={clsx(inputCls, "mt-3 h-24 resize-y py-2")} placeholder="Paste the problem statement, e.g. “We make tables ($40 profit) and chairs ($25). Tables need 3 h of carpentry, chairs 1 h; 120 h available…”" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!ai?.configured} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-muted">{ai?.configured ? "Claude drafts the variables, objective and constraints; you check them, then solve." : "Needs the AI engine (an Anthropic API key on the server). Templates and the builder work without it."}</p>
            <Button onClick={buildWithAi} loading={busy} disabled={!ai?.configured || desc.trim().length < 15}><Wand2 className="h-4 w-4" />Build model</Button>
          </div>
          {err && <div className="mt-2"><Callout tone="bad">{err}</Callout></div>}
        </Card>
      </div>

      {template?.problem && (
        <Card className="mb-5">
          <button className="flex w-full flex-wrap items-center gap-2 px-5 py-3 text-left" onClick={() => setShowProblem((v) => !v)} aria-expanded={showProblem}>
            {showProblem ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            <BookOpen className="h-4 w-4 text-brand" />
            <span className="text-[14px] font-semibold">{template.label}: problem statement</span>
            {template.expected && <Badge tone="good" className="whitespace-normal sm:ml-auto">Answer on file: {template.expected.source}</Badge>}
          </button>
          {showProblem && <p className="border-t border-line px-5 py-3 text-[13px] leading-relaxed text-slate-700">{template.problem}</p>}
        </Card>
      )}
      {aiNote && <div className="mb-5"><Callout tone="warn" title="Check this model">{aiNote}</Callout></div>}

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div className="min-w-0 space-y-5">
          <ObjectiveCard model={model} upd={upd} />
          <VariablesCard model={model} upd={upd} />
          <ConstraintsCard model={model} upd={upd} />
          <Card>
            <CardHeader title="4 · Solver options" />
            <div className="space-y-3 p-5 text-[13px]">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 accent-indigo-600" checked={model.nonNegative !== false} onChange={(e) => upd((m) => { m.nonNegative = e.target.checked; })} />
                <span><b>Make unconstrained variables non-negative</b><span className="block text-[12px] text-muted">Same as Excel&apos;s checkbox. Untick it to allow negative values where no minimum is set.</span></span>
              </label>
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[12px] text-muted">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>Solving method: <b className="text-ink">Simplex LP</b> (branch-and-bound when any variable is integer or binary). It handles <b className="text-ink">linear</b> models: the objective and every constraint are sums of number × variable. Ratios and averages can be made linear with the helpers above. Products of variables, squares or other curves (Excel&apos;s GRG Nonlinear) aren&apos;t supported yet.</span>
              </div>
            </div>
          </Card>
          {pendingErrors.length > 0 && <Callout tone="bad" title="Fix before solving">{pendingErrors.map((e, i) => <div key={i}>• {e}</div>)}</Callout>}
        </div>

        <div className="min-w-0 space-y-5">
          <ResultCard model={solved} result={result} errors={errors} verify={verify} altOptima={altOptima} />
          {result && result.status === "optimal" && (
            <Card>
              <div className="border-b border-line p-3">
                <Segmented size="sm" value={tab} onChange={setTab} options={[
                  { value: "answer", label: "Answer report" }, { value: "sensitivity", label: "Sensitivity" }, { value: "formulation", label: "Formulation" }, { value: "export", label: "Export" },
                ]} />
              </div>
              {tab === "answer" && <AnswerReport model={solved} result={result} />}
              {tab === "sensitivity" && <SensitivityReport model={solved} result={result} sens={sens} />}
              {tab === "formulation" && <FormulationView model={solved} />}
              {tab === "export" && <ExportView model={solved} result={result} />}
            </Card>
          )}
          {result && result.status === "optimal" && tab !== "formulation" && tab !== "export" && <Card><FormulationView model={solved} compact /></Card>}
          <ReferenceDocs docs={refDocs} aliasName={alias?.name ?? ""} />
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------ Model editing

type Upd = (fn: (m: OptModel) => void) => void;

function ObjectiveCard({ model, upd }: { model: OptModel; upd: Upd }) {
  return (
    <Card>
      <CardHeader title="1 · Set objective" subtitle="What to optimize, and in which direction" />
      <div className="grid gap-3 p-5 sm:grid-cols-[auto_1fr]">
        <Segmented value={model.direction} onChange={(v) => upd((m) => { m.direction = v; if (v === "target" && m.target === undefined) m.target = 0; })} options={[{ value: "max", label: "Max" }, { value: "min", label: "Min" }, { value: "target", label: "Value of" }]} />
        <div className="flex gap-2">
          <input aria-label="Objective name" className={inputCls} value={model.objectiveName} onChange={(e) => upd((m) => { m.objectiveName = e.target.value; })} />
          {model.direction === "target" && <input aria-label="Target value" type="number" className={clsx(inputCls, "w-36 text-right")} value={model.target ?? 0} onChange={(e) => upd((m) => { m.target = Number(e.target.value); })} />}
        </div>
      </div>
      {model.notes && <div className="px-5 pb-4"><Callout tone="info" title="Modelling notes">{model.notes}</Callout></div>}
    </Card>
  );
}

function VariablesCard({ model, upd }: { model: OptModel; upd: Upd }) {
  const allowFree = model.nonNegative === false;
  return (
    <Card>
      <CardHeader
        title="2 · By changing variables (decision variables)"
        subtitle="Objective coefficient = what one unit adds to the objective. Leave Max blank for no upper limit."
        right={<Button size="sm" variant="secondary" onClick={() => upd((m) => { const n = m.variables.length + 1; m.variables.push({ name: `x${n}`, label: `Variable ${n}`, objective: 1, min: 0, max: null, integer: false }); })}><Plus className="h-3.5 w-3.5" />Add</Button>}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12.5px]">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-2 text-left">Label</th><th className="px-2 py-2 text-left">ID</th><th className="px-2 py-2 text-right">Obj. coef.</th><th className="px-2 py-2 text-right">Min</th><th className="px-2 py-2 text-right">Max</th><th className="px-2 py-2 text-left">Type</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {model.variables.map((v, i) => (
              <tr key={i}>
                <td className="min-w-[180px] px-4 py-1.5"><input aria-label="Variable label" className={clsx(inputCls, "h-8")} value={v.label} onChange={(e) => upd((m) => { m.variables[i].label = e.target.value; })} /></td>
                <td className="px-2 py-1.5"><input aria-label="Variable ID" className={clsx(inputCls, "h-8 w-32 font-mono text-[12px]")} value={v.name} onChange={(e) => upd((m) => {
                  const nn = slug(e.target.value); const old = m.variables[i].name; m.variables[i].name = nn;
                  m.constraints.forEach((c) => { if (old in c.terms) { c.terms[nn] = c.terms[old]; delete c.terms[old]; } });
                })} /></td>
                <td className="px-2 py-1.5"><input aria-label="Objective coefficient" type="number" className={clsx(inputCls, "h-8 w-24 text-right")} value={v.objective} onChange={(e) => upd((m) => { m.variables[i].objective = Number(e.target.value); })} /></td>
                <td className="px-2 py-1.5"><input aria-label="Minimum" type="number" placeholder={allowFree ? "−∞" : "0"} className={clsx(inputCls, "h-8 w-24 text-right")} value={v.min ?? ""} onChange={(e) => upd((m) => { m.variables[i].min = e.target.value === "" ? null : Number(e.target.value); })} /></td>
                <td className="px-2 py-1.5"><input aria-label="Maximum" type="number" placeholder="∞" className={clsx(inputCls, "h-8 w-24 text-right")} value={v.max ?? ""} onChange={(e) => upd((m) => { m.variables[i].max = e.target.value === "" ? null : Number(e.target.value); })} /></td>
                <td className="px-2 py-1.5">
                  <select aria-label="Variable type" className={clsx(inputCls, "h-8 w-28 px-1.5")} value={v.binary ? "bin" : v.integer ? "int" : "cont"} onChange={(e) => upd((m) => { const t = e.target.value; m.variables[i].integer = t === "int"; m.variables[i].binary = t === "bin"; })}>
                    <option value="cont">Continuous</option><option value="int">Integer</option><option value="bin">Binary (0/1)</option>
                  </select>
                </td>
                <td className="px-2"><button className="p-1 text-slate-400 hover:text-bad" onClick={() => upd((m) => { const n = m.variables[i].name; m.variables.splice(i, 1); m.constraints.forEach((c) => delete c.terms[n]); })} aria-label={`Remove ${v.label}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ConstraintsCard({ model, upd }: { model: OptModel; upd: Upd }) {
  const [helper, setHelper] = useState(false);
  return (
    <Card>
      <CardHeader
        title="3 · Subject to the constraints"
        subtitle="Each row: Σ coefficient × variable, then the relation and the limit"
        right={
          <>
            <Button size="sm" variant="secondary" onClick={() => setHelper((h) => !h)}><FunctionSquare className="h-3.5 w-3.5" />Average / ratio / share</Button>
            <Button size="sm" variant="secondary" onClick={() => upd((m) => { m.constraints.push({ name: `Constraint ${m.constraints.length + 1}`, terms: {}, relation: "<=", rhs: 0 }); })}><Plus className="h-3.5 w-3.5" />Add</Button>
          </>
        }
      />
      {helper && <ConstraintHelper model={model} onAdd={(c) => { upd((m) => { m.constraints.push(c); }); setHelper(false); }} onClose={() => setHelper(false)} />}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ minWidth: 360 + model.variables.length * 88 }}>
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 text-left">Constraint</th>
              {model.variables.map((v) => <th key={v.name} className="px-2 py-2 text-right font-mono normal-case" title={v.label}>{v.name}</th>)}
              <th className="px-2 py-2">Rel.</th><th className="px-2 py-2 text-right">Limit</th><th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {model.constraints.map((c, i) => (
              <tr key={i} className="align-top">
                <td className="min-w-[200px] px-4 py-1.5">
                  <input aria-label="Constraint name" className={clsx(inputCls, "h-8")} value={c.name} onChange={(e) => upd((m) => { m.constraints[i].name = e.target.value; })} />
                  {c.note && <div className="mt-1 text-[11px] leading-snug text-brand">{c.note}</div>}
                </td>
                {model.variables.map((v) => (
                  <td key={v.name} className="px-2 py-1.5"><input aria-label={`${c.name} coefficient for ${v.name}`} type="number" className={clsx(inputCls, "h-8 w-20 text-right", !(c.terms[v.name] ?? 0) && "text-slate-400")} value={c.terms[v.name] ?? 0} onChange={(e) => upd((m) => { m.constraints[i].terms[v.name] = Number(e.target.value); })} /></td>
                ))}
                <td className="px-2 py-1.5">
                  <select aria-label="Relation" className={clsx(inputCls, "h-8 w-16 px-1")} value={c.relation} onChange={(e) => upd((m) => { m.constraints[i].relation = e.target.value as Relation; })}>
                    <option value="<=">≤</option><option value=">=">≥</option><option value="=">=</option>
                  </select>
                </td>
                <td className="px-2 py-1.5"><input aria-label="Limit" type="number" className={clsx(inputCls, "h-8 w-28 text-right")} value={c.rhs} onChange={(e) => upd((m) => { m.constraints[i].rhs = Number(e.target.value); })} /></td>
                <td className="px-2 py-1.5"><button className="p-1 text-slate-400 hover:text-bad" onClick={() => upd((m) => { m.constraints.splice(i, 1); })} aria-label={`Remove ${c.name}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
            {!model.constraints.length && <tr><td colSpan={model.variables.length + 4} className="px-4 py-6 text-center text-muted">No constraints yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Builds linear constraints from common nonlinear-looking business rules (averages, shares, ratios). */
function ConstraintHelper({ model, onAdd, onClose }: { model: OptModel; onAdd: (c: OptConstraint) => void; onClose: () => void }) {
  const [kind, setKind] = useState<"average" | "share" | "ratio" | "sum">("average");
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<Relation>(">=");
  const [k, setK] = useState(0);
  const [label, setLabel] = useState("grade");
  const [picked, setPicked] = useState<string[]>([]);
  const [others, setOthers] = useState<string[]>(model.variables.map((v) => v.name));
  const [attr, setAttr] = useState<Record<string, number>>({});
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const preview: OptConstraint | null = !picked.length ? null
    : kind === "average" ? weightedAverageConstraint(name || `Average ${label}`, picked.map((v) => ({ variable: v, attribute: attr[v] ?? 0 })), relation, k, label)
    : kind === "share" ? (others.length ? shareConstraint(name || "Share of total", picked, others, relation, k / 100) : null)
    : kind === "ratio" ? (others.length ? ratioConstraint(name || "Ratio", picked, others, relation, k) : null)
    : { name: name || "Sum", terms: Object.fromEntries(picked.map((v) => [v, 1])), relation, rhs: k, note: `${picked.join(" + ")} ${REL[relation]} ${k}` };
  const Picker = ({ list, set, title }: { list: string[]; set: (v: string[]) => void; title: string }) => (
    <div>
      <div className="mb-1 text-[11.5px] font-medium text-muted">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {model.variables.map((v) => (
          <button key={v.name} type="button" aria-pressed={list.includes(v.name)} onClick={() => toggle(list, set, v.name)} className={clsx("rounded-full border px-2.5 py-0.5 font-mono text-[11.5px]", list.includes(v.name) ? "border-brand bg-brand-soft text-brand" : "border-line text-muted")}>{v.name}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-3 border-b border-line bg-indigo-50/40 p-5 text-[12.5px]">
      <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: "average", label: "Weighted average" }, { value: "share", label: "Share of total (%)" }, { value: "ratio", label: "Ratio A : B" }, { value: "sum", label: "Sum of variables" }]} />
      <p className="text-muted">
        {kind === "average" && "For blends and quality rules, e.g. “basket fruit must average grade ≥ 3.75” or “octane ≥ 90”. Enter each variable's attribute; it's converted to Σ(attribute − target)·x ⋚ 0."}
        {kind === "share" && "For rules like “personal loans ≤ 25% of the portfolio”. Pick the part and the total."}
        {kind === "ratio" && "For rules like “at least 3 standard seats per premium seat” or “FastLink ≥ 2 × HyperLink”."}
        {kind === "sum" && "Quick total of several variables, e.g. “total invested = 650,000”."}
      </p>
      <Picker list={picked} set={setPicked} title={kind === "share" ? "Part (numerator)" : kind === "ratio" ? "A (left side)" : "Variables"} />
      {(kind === "share" || kind === "ratio") && <Picker list={others} set={setOthers} title={kind === "share" ? "Total (denominator)" : "B (right side)"} />}
      {kind === "average" && picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Attribute name</span>
          <input aria-label="Attribute name" className={clsx(inputCls, "h-8 w-32")} value={label} onChange={(e) => setLabel(e.target.value)} />
          {picked.map((v) => (
            <label key={v} className="inline-flex items-center gap-1"><span className="font-mono text-[11.5px]">{v}</span>
              <input aria-label={`${label} of ${v}`} type="number" className={clsx(inputCls, "h-8 w-20 text-right")} value={attr[v] ?? 0} onChange={(e) => setAttr({ ...attr, [v]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Constraint name" className={clsx(inputCls, "h-8 w-56")} placeholder="Constraint name" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="Relation" className={clsx(inputCls, "h-8 w-16 px-1")} value={relation} onChange={(e) => setRelation(e.target.value as Relation)}><option value=">=">≥</option><option value="<=">≤</option><option value="=">=</option></select>
        <input aria-label="Value" type="number" className={clsx(inputCls, "h-8 w-28 text-right")} value={k} onChange={(e) => setK(Number(e.target.value))} />
        <span className="text-muted">{kind === "average" ? `target ${label}` : kind === "share" ? "% of total" : kind === "ratio" ? "× B" : "limit"}</span>
      </div>
      {preview && <div className="rounded-lg bg-white p-2.5 font-mono text-[11.5px]">{formulation({ ...model, constraints: [preview] }).constraints[0].text}<div className="mt-1 font-sans text-[11.5px] text-brand">{preview.note}</div></div>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!preview} onClick={() => preview && onAdd(preview)}>Add constraint</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ Results

function ResultCard({ model, result, errors, verify, altOptima }: { model: OptModel; result: OptResult | null; errors: string[]; verify: OptTemplate["expected"] | null; altOptima: boolean }) {
  if (errors.length) return <Callout tone="bad" title="The model can't be solved yet">{errors.map((e, i) => <div key={i}>• {e}</div>)}</Callout>;
  if (!result) return null;
  if (result.status !== "optimal") {
    return (
      <Card className="bg-red-50 p-5">
        <div className="flex items-center gap-2 font-semibold"><XCircle className="h-5 w-5 text-bad" />{result.status === "infeasible" ? "Solver could not find a feasible solution" : "The objective is unbounded"}</div>
        <p className="mt-2 text-[13px] text-red-900">{result.status === "infeasible"
          ? "No values satisfy every constraint and bound together. Look for a minimum that is larger than a maximum, a demand that exceeds capacity, or an equality that can't be met."
          : `The ${model.direction === "max" ? "objective can grow" : "objective can fall"} without limit. A constraint or an upper bound is probably missing (e.g. a capacity or demand limit).`}</p>
      </Card>
    );
  }
  const matches = verify ? Math.abs(result.objective - verify.objective) <= 1e-6 * Math.max(1, Math.abs(verify.objective)) : null;
  const sameValues = verify?.values ? model.variables.every((v) => Math.abs((verify.values![v.name] ?? 0) - result.values[v.name]) < 1e-6) : true;
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-good" /><div className="font-semibold">Solver found an optimal solution</div>{result.hasIntegers && <Badge>Integer</Badge>}</div>
        <div className="mt-3 text-[12px] text-muted">{model.direction === "max" ? "Maximum" : model.direction === "min" ? "Minimum" : "Achieved"} {model.objectiveName}</div>
        <div className="tabular text-3xl font-semibold tracking-tight">{num(result.objective, 4)}</div>
      </div>
      {verify && (
        <div className={clsx("border-t px-5 py-3 text-[12.5px]", matches ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50")}>
          <div className="flex items-center gap-2 font-semibold">{matches ? <Check className="h-4 w-4 text-good" /> : <AlertTriangle className="h-4 w-4 text-warn" />}{matches ? `Matches ${verify.source}: ${num(verify.objective)}` : `Differs from ${verify.source} (${num(verify.objective)})`}</div>
          {matches && !sameValues && <p className="mt-1 text-muted">Same optimal objective with a different mix. {verify.note ?? "The problem has more than one optimal solution."}</p>}
        </div>
      )}
      {!verify && altOptima && <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted"><Info className="mr-1 inline h-3.5 w-3.5 text-brand" />Other solutions reach the same objective (a variable has zero reduced cost), so Excel may show a different but equally optimal mix.</div>}
    </Card>
  );
}

function AnswerReport({ model, result }: { model: OptModel; result: OptResult }) {
  const chart = model.variables.map((v) => ({ name: v.label, value: result.values[v.name] }));
  const feas = checkFeasible(model, result.values);
  return (
    <div>
      <div className="p-4" style={{ height: Math.max(160, 34 * chart.length + 40) }}>
        <ResponsiveContainer>
          <BarChart data={chart} layout="vertical" margin={{ left: 16, right: 24 }}>
            <CartesianGrid stroke="#eef0f4" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11.5 }} tickLine={false} axisLine={false} />
            <Tooltip formatter={tipFmt((v: number) => num(v))} contentStyle={{ borderRadius: 10, fontSize: 12 }} />
            <Bar dataKey="value" fill="#4f46e5" radius={4} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="border-t border-line px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Variable cells</div>
      <table className="w-full text-[12.5px]">
        <thead className="text-[11px] text-muted"><tr><th className="px-5 py-1.5 text-left font-medium">Variable</th><th className="px-3 py-1.5 text-right font-medium">Final value</th><th className="px-5 py-1.5 text-right font-medium">Contribution</th></tr></thead>
        <tbody className="divide-y divide-line">
          {model.variables.map((v) => (
            <tr key={v.name}><td className="px-5 py-1.5"><span className="font-mono text-[11.5px] text-muted">{v.name}</span> {v.label}</td><td className="tabular px-3 py-1.5 text-right font-semibold">{num(result.values[v.name])}</td><td className="tabular px-5 py-1.5 text-right text-muted">{num(v.objective * result.values[v.name], 2)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-line px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Constraints</div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-[12.5px]">
        <thead className="text-[11px] text-muted"><tr><th className="px-5 py-1.5 text-left font-medium">Constraint</th><th className="px-2 py-1.5 text-right font-medium">Cell value</th><th className="px-2 py-1.5 text-right font-medium">Limit</th><th className="px-2 py-1.5 font-medium">Status</th><th className="px-5 py-1.5 text-right font-medium">Slack</th></tr></thead>
        <tbody className="divide-y divide-line">
          {result.constraints.map((c) => (
            <tr key={c.name}>
              <td className="px-5 py-1.5">{c.name}</td>
              <td className="tabular px-2 py-1.5 text-right">{num(c.lhs)}</td>
              <td className="tabular px-2 py-1.5 text-right">{REL[c.relation]} {num(c.rhs)}</td>
              <td className="px-2 py-1.5">{c.binding ? <Badge tone="warn">Binding</Badge> : <Badge>Not binding</Badge>}</td>
              <td className="tabular px-5 py-1.5 text-right text-muted">{num(c.slack)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className={clsx("m-4 rounded-lg px-3 py-2 text-[12px]", feas.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>
        {feas.ok ? "Independent check passed: the solution satisfies every constraint and bound." : feas.violations.join("; ")}
      </div>
    </div>
  );
}

function SensitivityReport({ model, result, sens }: { model: OptModel; result: OptResult; sens: Sensitivity | null }) {
  if (result.hasIntegers) return <div className="p-5 text-[13px] text-muted">Like Excel, there&apos;s no sensitivity report for models with integer or binary variables: shadow prices don&apos;t apply once whole numbers are required. Switch the variables to Continuous to see one.</div>;
  if (model.direction === "target") return <div className="p-5 text-[13px] text-muted">Sensitivity analysis applies to Max and Min objectives.</div>;
  if (!sens) return <div className="p-5 text-[13px] text-muted">Calculating…</div>;
  const inf = (v: number) => (isFinite(v) ? num(v) : "1E+30");
  return (
    <div className="overflow-x-auto">
      <div className="px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Variable cells</div>
      <table className="w-full min-w-[560px] text-[12px]">
        <thead className="text-[11px] text-muted"><tr><th className="px-5 py-1.5 text-left font-medium">Variable</th><th className="px-2 py-1.5 text-right font-medium">Final value</th><th className="px-2 py-1.5 text-right font-medium">Reduced cost</th><th className="px-2 py-1.5 text-right font-medium">Obj. coef.</th><th className="px-2 py-1.5 text-right font-medium">Allow. +</th><th className="px-5 py-1.5 text-right font-medium">Allow. −</th></tr></thead>
        <tbody className="divide-y divide-line">
          {sens.variables.map((v) => (
            <tr key={v.name}><td className="px-5 py-1.5 font-mono text-[11.5px]">{v.name}</td><td className="tabular px-2 py-1.5 text-right">{num(v.value)}</td><td className="tabular px-2 py-1.5 text-right">{num(v.reducedCost)}</td><td className="tabular px-2 py-1.5 text-right">{num(v.objective)}</td><td className="tabular px-2 py-1.5 text-right">{inf(v.allowIncrease)}</td><td className="tabular px-5 py-1.5 text-right">{inf(v.allowDecrease)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-line px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Constraints</div>
      <table className="w-full min-w-[560px] text-[12px]">
        <thead className="text-[11px] text-muted"><tr><th className="px-5 py-1.5 text-left font-medium">Constraint</th><th className="px-2 py-1.5 text-right font-medium">Final value</th><th className="px-2 py-1.5 text-right font-medium">Shadow price</th><th className="px-2 py-1.5 text-right font-medium">R.H. side</th><th className="px-2 py-1.5 text-right font-medium">Allow. +</th><th className="px-5 py-1.5 text-right font-medium">Allow. −</th></tr></thead>
        <tbody className="divide-y divide-line">
          {sens.constraints.map((c) => (
            <tr key={c.name}><td className="px-5 py-1.5">{c.name}</td><td className="tabular px-2 py-1.5 text-right">{num(c.value)}</td><td className={clsx("tabular px-2 py-1.5 text-right", c.shadowPrice !== 0 && "font-semibold text-brand")}>{num(c.shadowPrice)}</td><td className="tabular px-2 py-1.5 text-right">{num(c.rhs)}</td><td className="tabular px-2 py-1.5 text-right">{inf(c.allowIncrease)}</td><td className="tabular px-5 py-1.5 text-right">{inf(c.allowDecrease)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="m-4 space-y-1 rounded-lg bg-slate-50 p-3 text-[12px] text-muted">
        <div><b className="text-ink">Shadow price</b>: change in the objective for one more unit of a constraint&apos;s limit, valid within the allowable increase/decrease.</div>
        <div><b className="text-ink">Reduced cost</b>: how much a variable&apos;s objective coefficient must improve before it enters the solution. Variable bounds are reported here, as in Excel.</div>
        {sens.alternativeOptima && <div className="text-brand">A variable at its bound has zero reduced cost, so there are other optimal solutions with the same objective.</div>}
      </div>
    </div>
  );
}

function FormulationView({ model, compact }: { model: OptModel; compact?: boolean }) {
  const f = formulation(model);
  return (
    <div className="p-5">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><Sigma className="h-4 w-4 text-brand" />LP formulation</div>
      {!compact && (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Decision variables</div>
          <ul className="mb-3 mt-1 space-y-0.5 font-mono text-[12px]">{f.variables.map((v) => <li key={v}>{v}</li>)}</ul>
        </>
      )}
      <div className="rounded-lg bg-slate-900 p-4 font-mono text-[12px] leading-relaxed text-slate-100">
        <div className="text-amber-300">{f.objective}</div>
        <div className="mt-1 text-slate-400">subject to</div>
        {f.constraints.map((c) => (
          <div key={c.name} className="pl-4"><span className="text-slate-500">{c.name}: </span>{c.text}</div>
        ))}
        <div className="mt-1 pl-4 text-slate-300">{f.bounds.join(";  ")}</div>
      </div>
      {!compact && f.constraints.some((c) => c.note) && (
        <ul className="mt-3 space-y-1 text-[12px] text-muted">{f.constraints.filter((c) => c.note).map((c) => <li key={c.name}><b className="text-ink">{c.name}</b>: {c.note}</li>)}</ul>
      )}
    </div>
  );
}

function ExportView({ model, result }: { model: OptModel; result: OptResult }) {
  const [lang, setLang] = useState<"pulp" | "scipy" | "lp">("pulp");
  const [copied, setCopied] = useState(false);
  const code = lang === "pulp" ? toPulp(model) : lang === "scipy" ? toScipy(model) : toLpFormat(model);
  const base = model.title.replace(/\W+/g, "_").toLowerCase();
  const excel = async () => {
    const X = await import("xlsx");
    const { buildWorkbook } = await import("@/lib/optExcel");
    X.writeFile(buildWorkbook(X, model, result, sensitivity(model, result)), `${base}_solver.xlsx`);
  };
  return (
    <div className="space-y-4 p-5">
      <div className="rounded-xl border border-line p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold"><FileSpreadsheet className="h-4 w-4 text-emerald-600" />Excel workbook with Solver set up</div>
        <p className="mt-1 text-[12.5px] text-muted">Data row, changing cells, a SUMPRODUCT objective and one formula row per constraint, plus the Answer and Sensitivity reports. Solver&apos;s objective, variable cells and constraints are pre-filled, so in Excel open <b>Data → Solver</b> and click <b>Solve</b>. The setup is also written on the sheet.</p>
        <Button size="sm" className="mt-3" onClick={excel}><Download className="h-3.5 w-3.5" />Download .xlsx</Button>
      </div>
      <div className="rounded-xl border border-line">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
          <Segmented size="sm" value={lang} onChange={setLang} options={[{ value: "pulp", label: "Python · PuLP" }, { value: "scipy", label: "Python · SciPy" }, { value: "lp", label: "LP file" }]} />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {})}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</Button>
            <Button size="sm" variant="secondary" onClick={() => downloadText(`${base}.${lang === "lp" ? "lp" : "py"}`, code, "text/plain")}><Download className="h-3.5 w-3.5" />Download</Button>
          </div>
        </div>
        <pre className="max-h-80 overflow-auto bg-slate-900 p-4 text-[11.5px] leading-relaxed text-slate-100">{code}</pre>
      </div>
    </div>
  );
}

function ReferenceDocs({ docs, aliasName }: { docs: VaultDoc[]; aliasName: string }) {
  const [open, setOpen] = useState<string | null>(docs[0]?.id ?? null);
  return (
    <Card>
      <CardHeader icon={<FileText className="h-4 w-4" />} title="Reference documents" subtitle={`Documents in ${aliasName}. Use their figures for coefficients and limits.`} />
      {docs.length === 0 ? (
        <div className="px-5 py-5 text-[12.5px] text-muted">
          No documents in this alias. <Link href="/data" className="font-medium text-brand hover:underline">Upload</Link> a capacity sheet, price list or cost table, or <Link href="/vault" className="font-medium text-brand hover:underline">add one from the vault</Link>.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {docs.map((d) => (
            <div key={d.id}>
              <button className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-[13px] font-medium hover:bg-slate-50" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id}>
                {open === d.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="truncate">{d.name}</span>
              </button>
              {open === d.id && (
                d.preview?.length ? <PreviewTable rows={d.preview} /> : d.items.length ? (
                  <div className="max-h-60 overflow-auto px-3 pb-3">
                    <table className="w-full text-[12px]"><tbody className="divide-y divide-line">
                      {d.items.map((it) => <tr key={it.id}><td className="px-2 py-1">{it.name}</td><td className="tabular px-2 py-1 text-right text-muted">{fmtNum(it.values.reduce((a, b) => a + b, 0))}</td></tr>)}
                    </tbody></table>
                  </div>
                ) : <div className="px-5 pb-3 text-[12px] text-muted">No preview available.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
