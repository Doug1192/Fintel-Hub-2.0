"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Boxes, CalendarRange, GitMerge, Network, Plus, Trash2, Wand2, X } from "lucide-react";
import { Button, Callout, Card, CardHeader, inputCls, Segmented } from "./ui";
import {
  allocationModel, coverageModel, formatPerPeriod, inventoryModel, networkModel, parsePerPeriod,
  type AllocationSpec, type CoverageSpec, type InventorySpec, type NetworkSpec, type PerPeriod,
} from "@/lib/optBuilders";
import type { OptModel, Relation } from "@/lib/optimize";

export type BuilderSpec =
  | { kind: "inventory"; spec: InventorySpec }
  | { kind: "allocation"; spec: AllocationSpec }
  | { kind: "coverage"; spec: CoverageSpec }
  | { kind: "network"; spec: NetworkSpec };

export function buildFromSpec(b: BuilderSpec): OptModel {
  return b.kind === "inventory" ? inventoryModel(b.spec) : b.kind === "allocation" ? allocationModel(b.spec) : b.kind === "network" ? networkModel(b.spec) : coverageModel(b.spec);
}

// Compact inputs: the shared style is full-width, so drop that and let each box choose its width.
const small = clsx(inputCls.replace(/\bw-full\b/, ""), "h-8 text-[12.5px]");
const PERIOD_LABELS = ["Month", "Week", "Day", "Quarter", "Year", "Period"];

/** Text box for "one number, or a list pasted from Excel". */
function ListInput({ value, onChange, placeholder, label, width = "w-full", allowEmpty = true }: { value: PerPeriod | null | undefined; onChange: (v: PerPeriod | null) => void; placeholder?: string; label: string; width?: string; allowEmpty?: boolean }) {
  const [text, setText] = useState(formatPerPeriod(value));
  const parsed = parsePerPeriod(text);
  const bad = text.trim() !== "" && parsed === null;
  return (
    <input
      aria-label={label}
      title="One number for every period, or a list such as 420, 580, 310 (you can paste a row from Excel)"
      className={clsx(small, width, bad && "border-red-400 bg-red-50", !allowEmpty && text.trim() === "" && "border-amber-300")}
      placeholder={placeholder}
      value={text}
      onChange={(e) => { setText(e.target.value); const p = parsePerPeriod(e.target.value); if (p !== null || e.target.value.trim() === "") onChange(p); }}
    />
  );
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

// -------------------------------------------------------------------------------------------- defaults

export const DEFAULT_INVENTORY: InventorySpec = {
  title: "Production plan", periods: 4, periodLabel: "Month", goal: "min", startingStock: 0, minStock: 0, maxStock: null,
  holdingCost: 1, holdingOn: "average", demand: [100, 120, 90, 110],
  activities: [{ name: "Produce", flow: "in", cash: "cost", amount: 10, min: 0, max: 150 }],
};
export const DEFAULT_ALLOCATION: AllocationSpec = {
  title: "Blending plan", goal: "max", unitLabel: "units",
  sources: [{ name: "Source A", cost: 10, supply: 100, attributes: { quality: 80 } }, { name: "Source B", cost: 8, supply: 150, attributes: { quality: 60 } }],
  uses: [{ name: "Product 1", value: 15, amount: 120, amountRelation: "=", quality: { quality: { min: 70 } } }],
};
export const DEFAULT_COVERAGE: CoverageSpec = {
  title: "Coverage plan", periodLabel: "Month", requirement: [25, 10, 20, 10, 5], cyclic: false,
  options: [{ length: 1, cost: 300 }, { length: 2, cost: 525 }],
};

export const DEFAULT_NETWORK: NetworkSpec = {
  title: "Distribution network", periods: 2, periodLabel: "Month", holdingOn: "ending",
  nodes: [
    { name: "Plant", produceMax: 10000, produceCost: 10, canStore: false },
    { name: "Warehouse", startingStock: 0, holdingCost: 2 },
    { name: "Store", demand: [4000, 5000], startingStock: 0, holdingCost: 4 },
  ],
  arcs: [
    { from: "Plant", to: "Warehouse", unitCost: 3, fixedCost: 1000 },
    { from: "Warehouse", to: "Store", unitCost: 2, fixedCost: 500 },
  ],
};

// -------------------------------------------------------------------------------------------- component

export function ModelBuilder({ initial, onGenerate, onClose }: { initial?: BuilderSpec | null; onGenerate: (m: OptModel, spec: BuilderSpec) => void; onClose: () => void }) {
  const [kind, setKind] = useState<BuilderSpec["kind"]>(initial?.kind ?? "inventory");
  const [inv, setInv] = useState<InventorySpec>(initial?.kind === "inventory" ? initial.spec : DEFAULT_INVENTORY);
  const [alloc, setAlloc] = useState<AllocationSpec>(initial?.kind === "allocation" ? initial.spec : DEFAULT_ALLOCATION);
  const [cov, setCov] = useState<CoverageSpec>(initial?.kind === "coverage" ? initial.spec : DEFAULT_COVERAGE);
  const [net, setNet] = useState<NetworkSpec>(initial?.kind === "network" ? initial.spec : DEFAULT_NETWORK);
  const spec = useMemo<BuilderSpec>(() => (kind === "inventory" ? { kind, spec: inv } : kind === "allocation" ? { kind, spec: alloc } : kind === "network" ? { kind, spec: net } : { kind, spec: cov }), [kind, inv, alloc, cov, net]);
  const preview = useMemo(() => { try { return buildFromSpec(spec); } catch { return null; } }, [spec]);

  return (
    <Card className="mb-5 overflow-hidden ring-2 ring-indigo-100">
      <CardHeader
        icon={<Wand2 className="h-4 w-4" />}
        title="Build a model from a pattern"
        subtitle="Describe the problem as small tables and Fintel writes every variable and constraint, the way loops build an indexed model in PuLP. In any per-period box, type one number or paste a row of values."
        right={<button className="rounded p-1 text-slate-400 hover:text-ink" onClick={onClose} aria-label="Close builder"><X className="h-4 w-4" /></button>}
      />
      <div className="border-b border-line px-5 py-3">
        <Segmented value={kind} onChange={setKind} options={[{ value: "inventory", label: "Inventory over time" }, { value: "allocation", label: "Sources × uses" }, { value: "coverage", label: "Coverage (leases / shifts)" }, { value: "network", label: "Network over time" }]} />
        <p className="mt-2 text-[12px] text-muted">
          {kind === "inventory" && <><CalendarRange className="mr-1 inline h-3.5 w-3.5" />Production planning, buy/sell trading and storage: stock carried from period to period, with demand, capacity and holding costs.</>}
          {kind === "allocation" && <><GitMerge className="mr-1 inline h-3.5 w-3.5" />Blending, grading and shipping: how much of each source goes to each use, with supply limits, requirements and weighted-average quality rules.</>}
          {kind === "coverage" && <><Boxes className="mr-1 inline h-3.5 w-3.5" />Leases or shifts that start in a period and last several periods; every period&apos;s requirement must be covered.</>}
          {kind === "network" && <><Network className="mr-1 inline h-3.5 w-3.5" />Supply chains over several periods: plants, warehouses and customers linked by routes with per-unit and fixed (only-if-used) costs, production limits, demand and storage.</>}
        </p>
      </div>
      <div className="space-y-4 p-5 text-[12.5px]">
        <label className="flex items-center gap-2"><span className="w-24 text-muted">Model name</span>
          <input aria-label="Model name" className={clsx(small, "w-full max-w-sm")} value={spec.spec.title} onChange={(e) => (kind === "inventory" ? setInv({ ...inv, title: e.target.value }) : kind === "allocation" ? setAlloc({ ...alloc, title: e.target.value }) : kind === "network" ? setNet({ ...net, title: e.target.value }) : setCov({ ...cov, title: e.target.value }))} />
        </label>
        {kind === "inventory" && <InventoryForm s={inv} set={setInv} />}
        {kind === "allocation" && <AllocationForm s={alloc} set={setAlloc} />}
        {kind === "coverage" && <CoverageForm s={cov} set={setCov} />}
        {kind === "network" && <NetworkForm s={net} set={setNet} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-slate-50 px-5 py-3">
        <span className="text-[12.5px] text-muted">{preview ? <>Will create <b className="text-ink">{preview.variables.length}</b> variables and <b className="text-ink">{preview.constraints.length}</b> constraints{preview.objectiveConstant ? <>, plus an objective constant of <b className="text-ink">{preview.objectiveConstant}</b></> : null}.</> : "Check the highlighted inputs."}</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!preview || !preview.variables.length} onClick={() => preview && onGenerate(preview, spec)}><Wand2 className="h-3.5 w-3.5" />Generate model</Button>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid items-center gap-2 sm:grid-cols-[170px_1fr]">
      <span className="text-muted" title={hint}>{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </label>
  );
}

function InventoryForm({ s, set }: { s: InventorySpec; set: (s: InventorySpec) => void }) {
  const upd = (patch: Partial<InventorySpec>) => set({ ...s, ...patch });
  const updA = (i: number, patch: Partial<InventorySpec["activities"][number]>) => set({ ...s, activities: s.activities.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  return (
    <>
      <Row label="Periods">
        <input aria-label="Number of periods" type="number" min={1} max={120} className={clsx(small, "w-20")} value={s.periods} onChange={(e) => upd({ periods: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })} />
        <select aria-label="Period name" className={clsx(small, "w-28")} value={s.periodLabel} onChange={(e) => upd({ periodLabel: e.target.value })}>{PERIOD_LABELS.map((p) => <option key={p}>{p}</option>)}</select>
        <Segmented size="sm" value={s.goal} onChange={(g) => upd({ goal: g })} options={[{ value: "max", label: "Maximize profit" }, { value: "min", label: "Minimize cost" }]} />
      </Row>
      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="font-semibold">Activities each period</span>
          <Button size="sm" variant="secondary" onClick={() => set({ ...s, activities: [...s.activities, { name: `Activity ${s.activities.length + 1}`, flow: "in", cash: "cost", amount: 0 }] })}><Plus className="h-3.5 w-3.5" />Add</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-2 py-1.5 text-left">Name</th><th className="px-2 py-1.5 text-left">Stock effect</th><th className="px-2 py-1.5 text-left">Money</th><th className="px-2 py-1.5 text-left">Per unit (per period)</th><th className="px-2 py-1.5 text-left">Min</th><th className="px-2 py-1.5 text-left">Max</th><th className="px-2 py-1.5 text-left" title="e.g. sell in the morning, buy in the evening">Uses starting stock only</th><th /></tr></thead>
            <tbody className="divide-y divide-line">
              {s.activities.map((a, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5"><input aria-label="Activity name" className={clsx(small, "w-28")} value={a.name} onChange={(e) => updA(i, { name: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><select aria-label="Stock effect" className={clsx(small, "w-36")} value={a.flow} onChange={(e) => updA(i, { flow: e.target.value as "in" | "out" })}><option value="in">Adds to stock</option><option value="out">Removes stock</option></select></td>
                  <td className="px-2 py-1.5"><select aria-label="Money" className={clsx(small, "w-24")} value={a.cash} onChange={(e) => updA(i, { cash: e.target.value as "cost" | "revenue" })}><option value="cost">Cost</option><option value="revenue">Revenue</option></select></td>
                  <td className="px-2 py-1.5"><ListInput label={`${a.name} amount per unit`} value={a.amount} onChange={(v) => updA(i, { amount: v ?? 0 })} placeholder="e.g. 49, 45, 46, 47" allowEmpty={false} /></td>
                  <td className="px-2 py-1.5"><ListInput label={`${a.name} minimum`} value={a.min} onChange={(v) => updA(i, { min: v })} placeholder="0" width="w-28" /></td>
                  <td className="px-2 py-1.5"><ListInput label={`${a.name} maximum`} value={a.max} onChange={(v) => updA(i, { max: v })} placeholder="none" width="w-28" /></td>
                  <td className="px-2 py-1.5 text-center"><input aria-label={`${a.name} uses starting stock only`} type="checkbox" className="accent-indigo-600" disabled={a.flow === "in"} checked={Boolean(a.fromStartingStock) && a.flow === "out"} onChange={(e) => updA(i, { fromStartingStock: e.target.checked })} /></td>
                  <td className="px-2 py-1.5"><button className="p-1 text-slate-400 hover:text-bad" onClick={() => set({ ...s, activities: s.activities.filter((_, k) => k !== i) })} aria-label={`Remove ${a.name}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Row label="Demand each period" hint="Fixed amount leaving stock (customer orders). Leave blank if none."><ListInput label="Demand" value={s.demand} onChange={(v) => upd({ demand: v })} placeholder="e.g. 420, 580, 310, 540 (blank = none)" /></Row>
      <Row label="Starting stock"><input aria-label="Starting stock" type="number" className={clsx(small, "w-32")} value={s.startingStock} onChange={(e) => upd({ startingStock: Number(e.target.value) || 0 })} /></Row>
      <Row label="Ending stock limits">
        <span className="text-muted">min</span><ListInput label="Minimum ending stock" value={s.minStock} onChange={(v) => upd({ minStock: v })} placeholder="0" width="w-40" />
        <span className="text-muted">max</span><ListInput label="Maximum ending stock" value={s.maxStock} onChange={(v) => upd({ maxStock: v })} placeholder="none" width="w-40" />
      </Row>
      <Row label="Holding cost per unit">
        <ListInput label="Holding cost per unit" value={s.holdingCost} onChange={(v) => upd({ holdingCost: v ?? 0 })} placeholder="e.g. 1.5" width="w-56" />
        <Segmented size="sm" value={s.holdingOn} onChange={(v) => upd({ holdingOn: v })} options={[{ value: "average", label: "on average of begin & end" }, { value: "ending", label: "on ending stock" }]} />
      </Row>
      <Row label="Whole numbers only"><input aria-label="Whole numbers only" type="checkbox" className="accent-indigo-600" checked={Boolean(s.integer)} onChange={(e) => upd({ integer: e.target.checked })} /></Row>
    </>
  );
}

const REL_OPTS: { v: Relation | ""; t: string }[] = [{ v: "", t: "none" }, { v: "<=", t: "≤" }, { v: "=", t: "=" }, { v: ">=", t: "≥" }];

function AllocationForm({ s, set }: { s: AllocationSpec; set: (s: AllocationSpec) => void }) {
  const attrs = Array.from(new Set(s.sources.flatMap((x) => Object.keys(x.attributes ?? {})).concat(s.uses.flatMap((u) => Object.keys(u.quality ?? {})))));
  const [attrText, setAttrText] = useState(attrs.join(", "));
  const attrList = attrText.split(",").map((a) => a.trim()).filter(Boolean);
  const [routes, setRoutes] = useState(Boolean(s.pairCost));
  const setAttrs = (text: string) => {
    setAttrText(text);
    const list = text.split(",").map((a) => a.trim()).filter(Boolean);
    set({
      ...s,
      sources: s.sources.map((x) => ({ ...x, attributes: Object.fromEntries(list.map((a) => [a, x.attributes?.[a] ?? 0])) })),
      uses: s.uses.map((u) => ({ ...u, quality: Object.fromEntries(list.filter((a) => u.quality?.[a]).map((a) => [a, u.quality![a]])) })),
    });
  };
  const updS = (i: number, patch: Partial<AllocationSpec["sources"][number]>) => set({ ...s, sources: s.sources.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const updU = (j: number, patch: Partial<AllocationSpec["uses"][number]>) => set({ ...s, uses: s.uses.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
  const grid = s.pairCost ?? s.sources.map(() => s.uses.map(() => 0));
  return (
    <>
      <Row label="Goal">
        <Segmented size="sm" value={s.goal} onChange={(g) => set({ ...s, goal: g })} options={[{ value: "max", label: "Maximize profit" }, { value: "min", label: "Minimize cost" }]} />
        <span className="text-muted">unit</span><input aria-label="Unit" className={clsx(small, "w-40")} value={s.unitLabel} onChange={(e) => set({ ...s, unitLabel: e.target.value })} />
      </Row>
      <Row label="Quality attributes" hint="Properties averaged in a blend, e.g. octane, grade, sulfur"><input aria-label="Quality attributes" className={clsx(small, "w-full max-w-sm")} placeholder="e.g. octane  (comma-separated; blank if none)" value={attrText} onChange={(e) => setAttrs(e.target.value)} /></Row>

      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="font-semibold">Sources</span>
          <Button size="sm" variant="secondary" onClick={() => set({ ...s, sources: [...s.sources, { name: `Source ${s.sources.length + 1}`, cost: 0, supply: null, attributes: Object.fromEntries(attrList.map((a) => [a, 0])) }], pairCost: s.pairCost ? [...s.pairCost, s.uses.map(() => 0)] : undefined })}><Plus className="h-3.5 w-3.5" />Add source</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[560px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-2 py-1.5 text-left">Name</th><th className="px-2 py-1.5 text-left">Cost / unit</th><th className="px-2 py-1.5 text-left">Supply</th>{attrList.map((a) => <th key={a} className="px-2 py-1.5 text-left normal-case">{a}</th>)}<th /></tr></thead>
            <tbody className="divide-y divide-line">
              {s.sources.map((x, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5"><input aria-label="Source name" className={clsx(small, "w-32")} value={x.name} onChange={(e) => updS(i, { name: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`${x.name} cost`} type="number" className={clsx(small, "w-24")} value={x.cost ?? 0} onChange={(e) => updS(i, { cost: Number(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><div className="flex gap-1">
                    <select aria-label={`${x.name} supply relation`} className={clsx(small, "w-16 px-1")} value={x.supply === null || x.supply === undefined ? "" : x.supplyRelation ?? "<="} onChange={(e) => updS(i, e.target.value === "" ? { supply: null } : { supplyRelation: e.target.value as Relation, supply: x.supply ?? 0 })}>{REL_OPTS.map((o) => <option key={o.t} value={o.v}>{o.t}</option>)}</select>
                    {x.supply !== null && x.supply !== undefined && <input aria-label={`${x.name} supply`} type="number" className={clsx(small, "w-24")} value={x.supply} onChange={(e) => updS(i, { supply: Number(e.target.value) })} />}
                  </div></td>
                  {attrList.map((a) => <td key={a} className="px-2 py-1.5"><input aria-label={`${x.name} ${a}`} type="number" className={clsx(small, "w-20")} value={x.attributes?.[a] ?? 0} onChange={(e) => updS(i, { attributes: { ...x.attributes, [a]: Number(e.target.value) } })} /></td>)}
                  <td className="px-2 py-1.5"><button className="p-1 text-slate-400 hover:text-bad" onClick={() => set({ ...s, sources: s.sources.filter((_, k) => k !== i), pairCost: s.pairCost?.filter((_, k) => k !== i) })} aria-label={`Remove ${x.name}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="font-semibold">Uses (products, destinations)</span>
          <Button size="sm" variant="secondary" onClick={() => set({ ...s, uses: [...s.uses, { name: `Use ${s.uses.length + 1}`, value: 0, amount: null }], pairCost: s.pairCost?.map((r) => [...r, 0]) })}><Plus className="h-3.5 w-3.5" />Add use</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[620px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-2 py-1.5 text-left">Name</th><th className="px-2 py-1.5 text-left">Value / unit</th><th className="px-2 py-1.5 text-left">Requirement</th>{attrList.map((a) => <th key={a} className="px-2 py-1.5 text-left normal-case">avg {a} min / max</th>)}<th /></tr></thead>
            <tbody className="divide-y divide-line">
              {s.uses.map((u, j) => (
                <tr key={j}>
                  <td className="px-2 py-1.5"><input aria-label="Use name" className={clsx(small, "w-32")} value={u.name} onChange={(e) => updU(j, { name: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`${u.name} value`} type="number" className={clsx(small, "w-24")} value={u.value ?? 0} onChange={(e) => updU(j, { value: Number(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><div className="flex gap-1">
                    <select aria-label={`${u.name} requirement relation`} className={clsx(small, "w-16 px-1")} value={u.amount === null || u.amount === undefined ? "" : u.amountRelation ?? "="} onChange={(e) => updU(j, e.target.value === "" ? { amount: null } : { amountRelation: e.target.value as Relation, amount: u.amount ?? 0 })}>{REL_OPTS.map((o) => <option key={o.t} value={o.v}>{o.t}</option>)}</select>
                    {u.amount !== null && u.amount !== undefined && <input aria-label={`${u.name} requirement`} type="number" className={clsx(small, "w-24")} value={u.amount} onChange={(e) => updU(j, { amount: Number(e.target.value) })} />}
                  </div></td>
                  {attrList.map((a) => (
                    <td key={a} className="px-2 py-1.5"><div className="flex gap-1">
                      <input aria-label={`${u.name} minimum average ${a}`} placeholder="min" type="number" className={clsx(small, "w-20")} value={u.quality?.[a]?.min ?? ""} onChange={(e) => updU(j, { quality: { ...u.quality, [a]: { ...u.quality?.[a], min: numOrNull(e.target.value) } } })} />
                      <input aria-label={`${u.name} maximum average ${a}`} placeholder="max" type="number" className={clsx(small, "w-20")} value={u.quality?.[a]?.max ?? ""} onChange={(e) => updU(j, { quality: { ...u.quality, [a]: { ...u.quality?.[a], max: numOrNull(e.target.value) } } })} />
                    </div></td>
                  ))}
                  <td className="px-2 py-1.5"><button className="p-1 text-slate-400 hover:text-bad" onClick={() => set({ ...s, uses: s.uses.filter((_, k) => k !== j), pairCost: s.pairCost?.map((r) => r.filter((_, k) => k !== j)) })} aria-label={`Remove ${u.name}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <label className="flex items-center gap-2"><input type="checkbox" className="accent-indigo-600" checked={routes} onChange={(e) => { setRoutes(e.target.checked); set({ ...s, pairCost: e.target.checked ? grid : undefined }); }} /><span><b>Route costs</b> (shipping or handling per unit from each source to each use; type “x” where a route doesn&apos;t exist)</span></label>
      {routes && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[420px]">
            <thead className="bg-slate-50 text-[11px] text-muted"><tr><th className="px-2 py-1.5 text-left">From → To</th>{s.uses.map((u) => <th key={u.name} className="px-2 py-1.5 text-left">{u.name}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {s.sources.map((x, i) => (
                <tr key={i}><td className="px-2 py-1.5 font-medium">{x.name}</td>
                  {s.uses.map((u, j) => (
                    <td key={j} className="px-2 py-1.5"><input aria-label={`Route cost ${x.name} to ${u.name}`} className={clsx(small, "w-20")} value={grid[i]?.[j] === null ? "x" : grid[i]?.[j] ?? 0} onChange={(e) => {
                      const g = grid.map((r) => [...r]); const t = e.target.value.trim().toLowerCase();
                      g[i][j] = t === "x" ? null : Number(t) || 0; set({ ...s, pairCost: g });
                    }} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CoverageForm({ s, set }: { s: CoverageSpec; set: (s: CoverageSpec) => void }) {
  const [names, setNames] = useState((s.periodNames ?? []).join(", "));
  return (
    <>
      <Row label="Period name"><select aria-label="Period name" className={clsx(small, "w-28")} value={s.periodLabel} onChange={(e) => set({ ...s, periodLabel: e.target.value })}>{[...PERIOD_LABELS, "Shift"].map((p) => <option key={p}>{p}</option>)}</select></Row>
      <Row label="Requirement per period" hint="One value per period; the number of values sets the number of periods">
        <ListInput label="Requirement per period" value={s.requirement} onChange={(v) => set({ ...s, requirement: v === null ? [] : Array.isArray(v) ? v : [v] })} placeholder="e.g. 25, 10, 20, 10, 5" allowEmpty={false} />
      </Row>
      <Row label="Period names (optional)"><input aria-label="Period names" className={clsx(small, "w-full")} placeholder="e.g. 12 a.m., 4 a.m., 8 a.m., 12 p.m., 4 p.m., 8 p.m." value={names} onChange={(e) => { setNames(e.target.value); const list = e.target.value.split(",").map((x) => x.trim()).filter(Boolean); set({ ...s, periodNames: list.length ? list : undefined }); }} /></Row>
      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="font-semibold">Options (what can be started each period)</span>
          <Button size="sm" variant="secondary" onClick={() => set({ ...s, options: [...s.options, { length: (s.options.at(-1)?.length ?? 0) + 1, cost: 0 }] })}><Plus className="h-3.5 w-3.5" />Add option</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.options.map((o, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5">
              <span className="text-muted">lasts</span>
              <input aria-label={`Option ${i + 1} length`} type="number" min={1} className={clsx(small, "w-16")} value={o.length} onChange={(e) => set({ ...s, options: s.options.map((x, k) => (k === i ? { ...x, length: Math.max(1, Number(e.target.value) || 1) } : x)) })} />
              <span className="text-muted">period(s), cost</span>
              <input aria-label={`Option ${i + 1} cost`} type="number" className={clsx(small, "w-24")} value={o.cost} onChange={(e) => set({ ...s, options: s.options.map((x, k) => (k === i ? { ...x, cost: Number(e.target.value) } : x)) })} />
              <button className="p-1 text-slate-400 hover:text-bad" onClick={() => set({ ...s, options: s.options.filter((_, k) => k !== i) })} aria-label={`Remove option ${i + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
      <Row label="Periods wrap around"><input aria-label="Periods wrap around" type="checkbox" className="accent-indigo-600" checked={s.cyclic} onChange={(e) => set({ ...s, cyclic: e.target.checked })} /><span className="text-muted">Tick for 24-hour or weekly cycles (a shift starting in the last period continues into the first). Leave unticked for leases that must end within the horizon.</span></Row>
      <Row label="Whole numbers only"><input aria-label="Whole numbers only" type="checkbox" className="accent-indigo-600" checked={Boolean(s.integer)} onChange={(e) => set({ ...s, integer: e.target.checked })} /></Row>
      {s.requirement.length === 0 && <Callout tone="warn">Enter at least one requirement value.</Callout>}
    </>
  );
}

function NetworkForm({ s, set }: { s: NetworkSpec; set: (s: NetworkSpec) => void }) {
  const updN = (i: number, patch: Partial<NetworkSpec["nodes"][number]>) => set({ ...s, nodes: s.nodes.map((n, k) => (k === i ? { ...n, ...patch } : n)) });
  const updA = (i: number, patch: Partial<NetworkSpec["arcs"][number]>) => set({ ...s, arcs: s.arcs.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  const renameNode = (i: number, name: string) => {
    const old = s.nodes[i].name;
    set({ ...s, nodes: s.nodes.map((n, k) => (k === i ? { ...n, name } : n)), arcs: s.arcs.map((a) => ({ ...a, from: a.from === old ? name : a.from, to: a.to === old ? name : a.to })) });
  };
  const names = s.nodes.map((n) => n.name);
  return (
    <>
      <Row label="Periods">
        <input aria-label="Number of periods" type="number" min={1} max={60} className={clsx(small, "w-20")} value={s.periods} onChange={(e) => set({ ...s, periods: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
        <select aria-label="Period name" className={clsx(small, "w-28")} value={s.periodLabel} onChange={(e) => set({ ...s, periodLabel: e.target.value })}>{PERIOD_LABELS.map((p) => <option key={p}>{p}</option>)}</select>
        <span className="text-muted">Goal: minimize total cost</span>
      </Row>
      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="font-semibold">Locations</span>
          <Button size="sm" variant="secondary" onClick={() => set({ ...s, nodes: [...s.nodes, { name: `Location ${s.nodes.length + 1}`, startingStock: 0, holdingCost: 0 }] })}><Plus className="h-3.5 w-3.5" />Add location</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted"><tr>
              <th className="px-2 py-1.5 text-left">Name</th><th className="px-2 py-1.5 text-left" title="Blank = doesn't produce">Can produce (max/period)</th><th className="px-2 py-1.5 text-left">Production cost</th><th className="px-2 py-1.5 text-left">Demand per period</th><th className="px-2 py-1.5 text-left">Starting stock</th><th className="px-2 py-1.5 text-left">Holding cost</th><th className="px-2 py-1.5 text-left">Max stock</th><th className="px-2 py-1.5 text-left">Stores?</th><th />
            </tr></thead>
            <tbody className="divide-y divide-line">
              {s.nodes.map((n, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5"><input aria-label="Location name" className={clsx(small, "w-32")} value={n.name} onChange={(e) => renameNode(i, e.target.value)} /></td>
                  <td className="px-2 py-1.5"><ListInput label={`${n.name} production capacity`} value={n.produceMax} onChange={(v) => updN(i, { produceMax: v })} placeholder="—" width="w-28" /></td>
                  <td className="px-2 py-1.5"><ListInput label={`${n.name} production cost`} value={n.produceCost} onChange={(v) => updN(i, { produceCost: v })} placeholder="0" width="w-24" /></td>
                  <td className="px-2 py-1.5"><ListInput label={`${n.name} demand`} value={n.demand} onChange={(v) => updN(i, { demand: v })} placeholder="—" width="w-36" /></td>
                  <td className="px-2 py-1.5"><input aria-label={`${n.name} starting stock`} type="number" className={clsx(small, "w-24")} value={n.startingStock ?? 0} disabled={n.canStore === false} onChange={(e) => updN(i, { startingStock: Number(e.target.value) || 0 })} /></td>
                  <td className="px-2 py-1.5"><ListInput label={`${n.name} holding cost`} value={n.holdingCost} onChange={(v) => updN(i, { holdingCost: v })} placeholder="0" width="w-20" /></td>
                  <td className="px-2 py-1.5"><ListInput label={`${n.name} maximum stock`} value={n.maxStock} onChange={(v) => updN(i, { maxStock: v })} placeholder="none" width="w-24" /></td>
                  <td className="px-2 py-1.5 text-center"><input aria-label={`${n.name} can store`} type="checkbox" className="accent-indigo-600" checked={n.canStore !== false} onChange={(e) => updN(i, { canStore: e.target.checked })} /></td>
                  <td className="px-2 py-1.5"><button className="p-1 text-slate-400 hover:text-bad" onClick={() => set({ ...s, nodes: s.nodes.filter((_, k) => k !== i), arcs: s.arcs.filter((a) => a.from !== n.name && a.to !== n.name) })} aria-label={`Remove ${n.name}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="font-semibold">Routes</span>
          <Button size="sm" variant="secondary" disabled={s.nodes.length < 2} onClick={() => set({ ...s, arcs: [...s.arcs, { from: names[0], to: names[1], unitCost: 0 }] })}><Plus className="h-3.5 w-3.5" />Add route</Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-muted"><tr>
              <th className="px-2 py-1.5 text-left">From</th><th className="px-2 py-1.5 text-left">To</th><th className="px-2 py-1.5 text-left">Cost per unit</th><th className="px-2 py-1.5 text-left">Capacity</th><th className="px-2 py-1.5 text-left" title="Charged in each period the route is used; avoided when nothing ships">Fixed cost if used</th><th />
            </tr></thead>
            <tbody className="divide-y divide-line">
              {s.arcs.map((a, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5"><select aria-label={`Route ${i + 1} from`} className={clsx(small, "w-36")} value={a.from} onChange={(e) => updA(i, { from: e.target.value })}>{names.map((n) => <option key={n}>{n}</option>)}</select></td>
                  <td className="px-2 py-1.5"><select aria-label={`Route ${i + 1} to`} className={clsx(small, "w-36")} value={a.to} onChange={(e) => updA(i, { to: e.target.value })}>{names.map((n) => <option key={n}>{n}</option>)}</select></td>
                  <td className="px-2 py-1.5"><ListInput label={`Route ${i + 1} cost per unit`} value={a.unitCost} onChange={(v) => updA(i, { unitCost: v })} placeholder="0" width="w-24" /></td>
                  <td className="px-2 py-1.5"><ListInput label={`Route ${i + 1} capacity`} value={a.capacity} onChange={(v) => updA(i, { capacity: v })} placeholder="none" width="w-24" /></td>
                  <td className="px-2 py-1.5"><ListInput label={`Route ${i + 1} fixed cost`} value={a.fixedCost} onChange={(v) => updA(i, { fixedCost: v })} placeholder="none" width="w-28" /></td>
                  <td className="px-2 py-1.5"><button className="p-1 text-slate-400 hover:text-bad" onClick={() => set({ ...s, arcs: s.arcs.filter((_, k) => k !== i) })} aria-label={`Remove route ${i + 1}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {s.arcs.some((a) => a.from === a.to) && <div className="mt-2"><Callout tone="warn">A route goes from a location to itself; it will have no effect.</Callout></div>}
      </div>
      <Row label="Holding cost charged on">
        <Segmented size="sm" value={s.holdingOn} onChange={(v) => set({ ...s, holdingOn: v })} options={[{ value: "ending", label: "ending stock" }, { value: "average", label: "average of begin & end" }]} />
      </Row>
      <Row label="Whole units only"><input aria-label="Whole units only" type="checkbox" className="accent-indigo-600" checked={Boolean(s.integer)} onChange={(e) => set({ ...s, integer: e.target.checked })} /></Row>
    </>
  );
}
