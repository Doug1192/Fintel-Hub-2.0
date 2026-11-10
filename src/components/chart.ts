import type { ReactNode } from "react";

/**
 * Recharts' Formatter type is a wide union; this wrapper lets each chart declare the
 * value shape it actually renders (number, or [low, high] for range areas).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tipFmt<V = number>(f: (value: V, name: string) => ReactNode | [ReactNode, ReactNode]): any {
  return (value: V, name: string) => (value === undefined || value === null ? "—" : f(value, name));
}
