import type { Alias, Dataset, LineItem, ModuleKey, UploadedDoc, VaultDoc } from "./types";
import { ALL_MODULES } from "./types";
import { uid } from "./format";
import { buildSampleDataset } from "./sample";

export const ALIAS_COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#db2777", "#7c3aed", "#dc2626", "#0d9488", "#65a30d", "#475569"];

export function emptyDataset(company = "My Company", currency = "USD"): Dataset {
  return { company, currency, periods: [], granularity: "month", lines: [] };
}

export function newAlias(name: string, modules: ModuleKey[] = ALL_MODULES, index = 0, dataset?: Dataset): Alias {
  return {
    id: uid("al"),
    name: name.trim() || "Untitled alias",
    color: ALIAS_COLORS[index % ALIAS_COLORS.length],
    modules: modules.length ? modules : ["optimize"],
    dataset: dataset ?? emptyDataset(name.trim() || "My Company"),
    docIds: [],
    createdAt: new Date().toISOString(),
  };
}

export function demoAlias(): Alias {
  const a = newAlias("Demo · Northwind Outfitters", ALL_MODULES, 0, buildSampleDataset());
  a.description = "Sample company data for exploring every feature.";
  return a;
}

export interface AttachResult {
  dataset: Dataset;
  error?: string;
  warnings: string[];
}

/**
 * Add a vault document's statement lines to an alias's dataset.
 * Lines keep a link to the document so it can be detached later.
 * Reference-only documents (no statement lines) leave the dataset unchanged.
 */
export function attachDocToDataset(ds: Dataset, doc: VaultDoc, mode: "merge" | "replace" = "merge"): AttachResult {
  const warnings: string[] = [];
  if (!doc.items.length) return { dataset: ds, warnings };
  const fresh = (): LineItem[] => doc.items.map((l) => ({ ...l, id: uid("ln"), docId: doc.id, source: doc.name, values: [...l.values] }));

  if (mode === "replace" || !ds.lines.length || ds.isSample) {
    return {
      dataset: {
        company: ds.isSample ? doc.name.replace(/\.[^.]+$/, "") : ds.company,
        currency: ds.currency,
        headcount: ds.isSample ? undefined : ds.headcount,
        periods: [...doc.periods],
        granularity: doc.granularity,
        lines: fresh(),
      },
      warnings,
    };
  }
  if (ds.granularity !== doc.granularity) {
    return {
      dataset: ds,
      warnings,
      error: `"${doc.name}" is ${doc.granularity}ly data but this alias holds ${ds.granularity}ly data. Put it in a separate alias, or replace this alias's data with it.`,
    };
  }
  const periods = [...new Set([...ds.periods, ...doc.periods])].sort((a, b) => a.localeCompare(b));
  const remap = (vals: number[], from: string[]) => periods.map((p) => {
    const i = from.indexOf(p);
    return i >= 0 ? vals[i] ?? 0 : 0;
  });
  const existing = ds.lines.map((l) => ({ ...l, values: remap(l.values, ds.periods) }));
  const added = fresh().map((l) => ({ ...l, values: remap(l.values, doc.periods) }));

  // Flag likely double counting: the same line name already has values in the same periods.
  const overlap = added.filter((a) =>
    existing.some((e) => e.name.toLowerCase() === a.name.toLowerCase() && e.values.some((v, i) => v !== 0 && a.values[i] !== 0)),
  );
  if (overlap.length) {
    warnings.push(`${overlap.length} line(s) in "${doc.name}" overlap periods this alias already has (e.g. "${overlap[0].name}"). Check you haven't added the same statement twice.`);
  }
  return { dataset: { ...ds, periods, lines: [...existing, ...added] }, warnings };
}

/** Remove a document's lines from a dataset. */
export function detachDocFromDataset(ds: Dataset, docId: string): Dataset {
  const lines = ds.lines.filter((l) => l.docId !== docId);
  if (!lines.length) return { ...ds, lines, periods: [] };
  // Drop periods that no remaining line has data for at the edges.
  let start = 0;
  let end = ds.periods.length;
  const has = (i: number) => lines.some((l) => (l.values[i] ?? 0) !== 0);
  while (start < end && !has(start)) start++;
  while (end > start && !has(end - 1)) end--;
  return { ...ds, periods: ds.periods.slice(start, end), lines: lines.map((l) => ({ ...l, values: l.values.slice(start, end) })) };
}

/** Documents not assigned to any alias. */
export function generalVault(docs: VaultDoc[], aliases: Alias[]): VaultDoc[] {
  const used = new Set(aliases.flatMap((a) => a.docIds));
  return docs.filter((d) => !used.has(d.id));
}

export function aliasesForDoc(docId: string, aliases: Alias[]): Alias[] {
  return aliases.filter((a) => a.docIds.includes(docId));
}

/** Convert the single-dataset storage format (v1) into aliases + vault (v2). */
export function migrateV1(old: { dataset?: Dataset; docs?: UploadedDoc[] }): { aliases: Alias[]; docs: VaultDoc[]; activeAliasId: string | null } {
  const ds = old.dataset;
  if (!ds || ds.isSample || !ds.lines?.length) {
    const demo = demoAlias();
    return { aliases: [demo], docs: [], activeAliasId: demo.id };
  }
  const alias = newAlias(ds.company || "My Company", ALL_MODULES, 0, ds);
  const docs: VaultDoc[] = (old.docs ?? []).map((d) => ({
    id: d.id, name: d.name, size: d.size, kind: d.kind, addedAt: d.addedAt, via: "legacy",
    periods: [], granularity: ds.granularity, items: [],
    notes: "Uploaded before aliases existed. Its lines are already in this alias.",
  }));
  alias.docIds = docs.map((d) => d.id);
  const demo = demoAlias();
  demo.color = ALIAS_COLORS[1];
  return { aliases: [alias, demo], docs, activeAliasId: alias.id };
}
