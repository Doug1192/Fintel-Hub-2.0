"use client";

import { useEffect, useState } from "react";

export interface AiStatus {
  configured: boolean;
  model: string | null;
}

let cached: AiStatus | null = null;
let inflight: Promise<AiStatus> | null = null;

export function useAiStatus(): AiStatus | null {
  const [s, setS] = useState<AiStatus | null>(cached);
  useEffect(() => {
    if (cached) return;
    inflight ??= fetch("/api/ai/status")
      .then((r) => r.json() as Promise<AiStatus>)
      .catch(() => ({ configured: false, model: null }));
    inflight.then((v) => {
      cached = v;
      setS(v);
    });
  }, []);
  return s;
}

export async function postAi<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({ error: `Request failed (${r.status})` }));
  if (!r.ok) throw new Error((data as { error?: string }).error || `Request failed (${r.status})`);
  return data as T;
}
