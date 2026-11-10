"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Category, Dataset, UploadedDoc } from "@/lib/types";
import { buildSampleDataset } from "@/lib/sample";

interface State {
  dataset: Dataset;
  docs: UploadedDoc[];
  setDataset: (ds: Dataset) => void;
  loadSample: () => void;
  clear: () => void;
  updateLine: (id: string, patch: { category?: Category; group?: string; name?: string }) => void;
  removeLine: (id: string) => void;
  setMeta: (patch: Partial<Pick<Dataset, "company" | "currency" | "headcount">>) => void;
  addDoc: (d: UploadedDoc) => void;
  removeDoc: (id: string) => void;
}

const empty = (): Dataset => ({ company: "My Company", currency: "USD", periods: [], granularity: "month", lines: [] });

export const useStore = create<State>()(
  persist(
    (set) => ({
      dataset: buildSampleDataset(),
      docs: [],
      setDataset: (dataset) => set({ dataset }),
      loadSample: () => set({ dataset: buildSampleDataset(), docs: [] }),
      clear: () => set({ dataset: empty(), docs: [] }),
      updateLine: (id, patch) =>
        set((s) => ({
          dataset: {
            ...s.dataset,
            lines: s.dataset.lines.map((l) => (l.id === id ? { ...l, ...patch, confidence: patch.category ? 1 : l.confidence } : l)),
          },
        })),
      removeLine: (id) => set((s) => ({ dataset: { ...s.dataset, lines: s.dataset.lines.filter((l) => l.id !== id) } })),
      setMeta: (patch) => set((s) => ({ dataset: { ...s.dataset, ...patch } })),
      addDoc: (d) => set((s) => ({ docs: [...s.docs.filter((x) => x.name !== d.name), d] })),
      removeDoc: (id) => set((s) => ({ docs: s.docs.filter((d) => d.id !== id) })),
    }),
    {
      // Storage key kept from the original name so saved browser data survives the rebrand.
      name: "fin-zeus-v1",
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

/** True once the persisted store has rehydrated on the client (avoids SSR mismatch). */
export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => {
    if (useStore.persist.hasHydrated()) setH(true);
    return useStore.persist.onFinishHydration(() => setH(true));
  }, []);
  return h;
}

