export function fmtMoney(v: number, currency = "USD", compact = true): string {
  if (!isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: compact && Math.abs(v) >= 10000 ? "compact" : "standard",
      maximumFractionDigits: compact && Math.abs(v) >= 10000 ? 1 : 0,
    }).format(v);
  } catch {
    return `${currency} ${Math.round(v).toLocaleString()}`;
  }
}

export function fmtNum(v: number, digits = 0): string {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtPct(v: number, digits = 1, signed = false): string {
  if (!isFinite(v)) return "—";
  const s = (v * 100).toFixed(digits) + "%";
  return signed && v > 0 ? "+" + s : s;
}

export function periodLabel(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    return d.toLocaleString("en-US", { month: "short" }) + " " + m[1].slice(2);
  }
  const q = /^(\d{4})-Q([1-4])$/.exec(p);
  if (q) return `Q${q[2]} ${q[1].slice(2)}`;
  return p;
}

export function uid(prefix = "id"): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
