"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Alias, Category, Dataset, ModuleKey, UploadedDoc, VaultDoc } from "@/lib/types";
import { buildSampleDataset } from "@/lib/sample";
import { attachDocToDataset, demoAlias, detachDocFromDataset, emptyDataset, migrateV1, newAlias } from "@/lib/aliases";

export interface ActionResult {
  ok: boolean;
  error?: string;
  warnings: string[];
}

interface State {
  aliases: Alias[];
  activeAliasId: string | null;
  docs: VaultDoc[];

  // ---- aliases
  createAlias: (name: string, modules: ModuleKey[], description?: string, activate?: boolean) => string;
  updateAlias: (id: string, patch: Partial<Pick<Alias, "name" | "description" | "modules" | "color">>) => void;
  deleteAlias: (id: string) => void;
  setActiveAlias: (id: string | null) => void;
  saveOptModel: (aliasId: string, model: unknown) => void;

  // ---- vault documents
  /** Save a document to the vault, optionally assigning it to an alias straight away. */
  addDoc: (doc: VaultDoc, aliasId: string | null, mode?: "merge" | "replace") => ActionResult;
  attachDoc: (docId: string, aliasId: string, mode?: "merge" | "replace") => ActionResult;
  detachDoc: (docId: string, aliasId: string) => void;
  deleteDoc: (docId: string) => void;
  renameDoc: (docId: string, name: string) => void;

  // ---- active alias data
  setDataset: (ds: Dataset) => void;
  loadSample: () => void;
  clear: () => void;
  updateLine: (id: string, patch: { category?: Category; group?: string; name?: string }) => void;
  removeLine: (id: string) => void;
  setMeta: (patch: Partial<Pick<Dataset, "company" | "currency" | "headcount">>) => void;
}

const initial = () => {
  const demo = demoAlias();
  return { aliases: [demo], activeAliasId: demo.id as string | null, docs: [] as VaultDoc[] };
};

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Apply a change to the active alias's dataset. */
      const patchActive = (fn: (ds: Dataset) => Dataset) =>
        set((s) => ({ aliases: s.aliases.map((a) => (a.id === s.activeAliasId ? { ...a, dataset: fn(a.dataset) } : a)) }));

      const attach = (docs: VaultDoc[], docId: string, aliasId: string, mode: "merge" | "replace"): ActionResult => {
        const s = get();
        const alias = s.aliases.find((a) => a.id === aliasId);
        const doc = docs.find((d) => d.id === docId);
        if (!alias || !doc) return { ok: false, error: "Alias or document not found.", warnings: [] };
        if (alias.docIds.includes(docId)) return { ok: false, error: `"${doc.name}" is already in ${alias.name}.`, warnings: [] };
        let base = alias.dataset;
        let docIds = alias.docIds;
        if (mode === "replace" && doc.items.length) {
          // Replacing the data removes the statement documents that supplied it; reference docs stay.
          const statementDocs = new Set(s.docs.filter((d) => d.items.length || d.via === "legacy").map((d) => d.id));
          docIds = docIds.filter((id) => !statementDocs.has(id));
          base = emptyDataset(base.company, base.currency);
        }
        const r = attachDocToDataset(base, doc, mode);
        if (r.error) return { ok: false, error: r.error, warnings: r.warnings };
        set((st) => ({
          docs,
          aliases: st.aliases.map((a) => (a.id === aliasId ? { ...a, dataset: r.dataset, docIds: [...docIds, docId] } : a)),
        }));
        return { ok: true, warnings: r.warnings };
      };

      return {
        ...initial(),

        createAlias: (name, modules, description, activate = true) => {
          const a = newAlias(name, modules, get().aliases.length);
          a.description = description;
          set((s) => ({ aliases: [...s.aliases, a], activeAliasId: activate ? a.id : s.activeAliasId }));
          return a.id;
        },
        updateAlias: (id, patch) => set((s) => ({ aliases: s.aliases.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
        deleteAlias: (id) =>
          set((s) => {
            const aliases = s.aliases.filter((a) => a.id !== id);
            return { aliases, activeAliasId: s.activeAliasId === id ? aliases[0]?.id ?? null : s.activeAliasId };
          }),
        setActiveAlias: (id) => set({ activeAliasId: id }),
        saveOptModel: (aliasId, model) => set((s) => ({ aliases: s.aliases.map((a) => (a.id === aliasId ? { ...a, optModel: model } : a)) })),

        addDoc: (doc, aliasId, mode = "merge") => {
          const docs = [...get().docs, doc];
          if (!aliasId) {
            set({ docs });
            return { ok: true, warnings: [] };
          }
          const r = attach(docs, doc.id, aliasId, mode);
          // Keep the document in the vault even if it couldn't join the alias.
          if (!r.ok) set({ docs });
          return r;
        },
        attachDoc: (docId, aliasId, mode = "merge") => attach(get().docs, docId, aliasId, mode),
        detachDoc: (docId, aliasId) =>
          set((s) => ({
            aliases: s.aliases.map((a) =>
              a.id === aliasId ? { ...a, docIds: a.docIds.filter((d) => d !== docId), dataset: detachDocFromDataset(a.dataset, docId) } : a,
            ),
          })),
        deleteDoc: (docId) =>
          set((s) => ({
            docs: s.docs.filter((d) => d.id !== docId),
            aliases: s.aliases.map((a) =>
              a.docIds.includes(docId) ? { ...a, docIds: a.docIds.filter((d) => d !== docId), dataset: detachDocFromDataset(a.dataset, docId) } : a,
            ),
          })),
        renameDoc: (docId, name) => set((s) => ({ docs: s.docs.map((d) => (d.id === docId ? { ...d, name } : d)) })),

        setDataset: (dataset) => patchActive(() => dataset),
        loadSample: () =>
          set((s) => ({ aliases: s.aliases.map((a) => (a.id === s.activeAliasId ? { ...a, dataset: buildSampleDataset(), docIds: [] } : a)) })),
        clear: () =>
          set((s) => ({
            aliases: s.aliases.map((a) => (a.id === s.activeAliasId ? { ...a, dataset: emptyDataset(a.dataset.company, a.dataset.currency), docIds: [] } : a)),
          })),
        updateLine: (id, patch) =>
          patchActive((ds) => ({ ...ds, lines: ds.lines.map((l) => (l.id === id ? { ...l, ...patch, confidence: patch.category ? 1 : l.confidence } : l)) })),
        removeLine: (id) => patchActive((ds) => ({ ...ds, lines: ds.lines.filter((l) => l.id !== id) })),
        setMeta: (patch) => patchActive((ds) => ({ ...ds, ...patch })),
      };
    },
    {
      // Storage key kept from the original name so saved browser data survives the rebrand.
      name: "fin-zeus-v1",
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) return migrateV1(persisted as { dataset?: Dataset; docs?: UploadedDoc[] }) as unknown as State;
        return persisted as State;
      },
      partialize: (s) => ({ aliases: s.aliases, activeAliasId: s.activeAliasId, docs: s.docs }),
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
      }),
    },
  ),
);

const EMPTY = emptyDataset();

export function useActiveAlias(): Alias | null {
  return useStore((s) => s.aliases.find((a) => a.id === s.activeAliasId) ?? null);
}

/** The active alias's dataset (an empty dataset when no alias is selected). */
export function useDataset(): Dataset {
  return useStore((s) => s.aliases.find((a) => a.id === s.activeAliasId)?.dataset ?? EMPTY);
}

/** Vault documents assigned to the active alias. */
export function useAliasDocs(): VaultDoc[] {
  const alias = useActiveAlias();
  const docs = useStore((s) => s.docs);
  return alias ? docs.filter((d) => alias.docIds.includes(d.id)) : [];
}

/** True once the persisted store has rehydrated on the client (avoids SSR mismatch). */
export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    if (useStore.persist.hasHydrated()) setH(true);
    return useStore.persist.onFinishHydration(() => setH(true));
  }, []);
  return h;
}
