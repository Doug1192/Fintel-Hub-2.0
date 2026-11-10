import { classifyLine } from "./classify";
import type { Dataset, Granularity, LineItem } from "./types";
import { uid } from "./format";

export interface ParsedStatement {
  periods: string[];
  granularity: Granularity;
  lines: { name: string; values: number[] }[];
  warnings: string[];
  layout: "wide" | "long" | "single";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function y2(y: string) {
  const n = Number(y);
  return y.length === 2 ? (n > 70 ? 1900 + n : 2000 + n) : n;
}

/** Recognise a column header / cell as a reporting period. */
export function parsePeriod(raw: unknown): { key: string; gran: Granularity } | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (raw >= 1990 && raw <= 2100 && Number.isInteger(raw)) return { key: String(raw), gran: "year" };
    if (raw > 30000 && raw < 70000) {
      // Excel serial date
      const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
      return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, gran: "month" };
    }
    return null;
  }
  if (raw instanceof Date) return { key: `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}`, gran: "month" };
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  if (!s || s.length > 30) return null;
  let m: RegExpExecArray | null;
  const mon = (t: string) => MONTHS.indexOf(t.slice(0, 3)) + 1;
  if ((m = /^(\d{4})[-/.](\d{1,2})([-/.]\d{1,2})?$/.exec(s))) return { key: `${m[1]}-${m[2].padStart(2, "0")}`, gran: "month" };
  if ((m = /^(\d{1,2})[-/.](\d{4})$/.exec(s))) return { key: `${m[2]}-${m[1].padStart(2, "0")}`, gran: "month" };
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) return { key: `${y2(m[3])}-${m[1].padStart(2, "0")}`, gran: "month" };
  if ((m = /^([a-z]{3,9})\.?[ \-/']*'?(\d{2}|\d{4})$/.exec(s)) && mon(m[1]) > 0) return { key: `${y2(m[2])}-${String(mon(m[1])).padStart(2, "0")}`, gran: "month" };
  if ((m = /^q([1-4])[ \-/']*'?(\d{2}|\d{4})$/.exec(s))) return { key: `${y2(m[2])}-Q${m[1]}`, gran: "quarter" };
  if ((m = /^(\d{4})[ \-/]*q([1-4])$/.exec(s))) return { key: `${m[1]}-Q${m[2]}`, gran: "quarter" };
  if ((m = /^(?:fy|cy|year)?[ \-]?'?(\d{4})( actual| total)?$/.exec(s)) && Number(m[1]) >= 1990 && Number(m[1]) <= 2100) return { key: m[1], gran: "year" };
  if ((m = /^fy[ \-]?'?(\d{2})$/.exec(s))) return { key: String(y2(m[1])), gran: "year" };
  return null;
}

export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "—") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    neg = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/[$€£¥₦,\s]|usd|eur|gbp/gi, "");
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }
  let mult = 1;
  if (/k$/i.test(s)) { mult = 1e3; s = s.slice(0, -1); }
  else if (/m$/i.test(s)) { mult = 1e6; s = s.slice(0, -1); }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const v = parseFloat(s) * mult;
  return neg ? -v : v;
}

function sortPeriods(keys: string[]) {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

/** Turn a 2-D table (from CSV / XLSX) into statement lines. */
export function parseTable(rows: unknown[][], fallbackPeriod?: string): ParsedStatement {
  const warnings: string[] = [];
  const clean = rows.filter((r) => r && r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
  if (!clean.length) return { periods: [], granularity: "month", lines: [], warnings: ["The file appears to be empty."], layout: "wide" };

  // ---- Try long format: header with date/period + account + amount columns.
  const header = clean[0].map((c) => String(c ?? "").toLowerCase().trim());
  const dateCol = header.findIndex((h) => /^(date|period|month|posting date|transaction date)$/.test(h));
  const acctCol = header.findIndex((h) => /^(account|account name|category|description|line item|item|gl account|name)$/.test(h));
  const amtCol = header.findIndex((h) => /^(amount|value|total|net amount|balance|debit)$/.test(h));
  if (dateCol >= 0 && acctCol >= 0 && amtCol >= 0) {
    const bucket = new Map<string, Map<string, number>>();
    const keys = new Set<string>();
    const grans = new Map<Granularity, number>();
    for (const r of clean.slice(1)) {
      const p = parsePeriod(r[dateCol]);
      const v = parseNumber(r[amtCol]);
      const name = String(r[acctCol] ?? "").trim();
      if (!p || v === null || !name) continue;
      grans.set(p.gran, (grans.get(p.gran) ?? 0) + 1);
      keys.add(p.key);
      const m = bucket.get(name) ?? new Map();
      m.set(p.key, (m.get(p.key) ?? 0) + v);
      bucket.set(name, m);
    }
    const gran = [...grans.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "month";
    const periods = sortPeriods([...keys]);
    return {
      periods,
      granularity: gran,
      lines: [...bucket.entries()].map(([name, m]) => ({ name, values: periods.map((p) => m.get(p) ?? 0) })),
      warnings,
      layout: "long",
    };
  }

  // ---- Wide format: find the header row with the most period cells.
  let headerIdx = -1;
  let periodCols: { col: number; key: string; gran: Granularity }[] = [];
  let bestScore = 0;
  for (let i = 0; i < Math.min(clean.length, 15); i++) {
    const found = clean[i].map((c, col) => ({ col, c, p: parsePeriod(c) })).filter((x) => x.p);
    // Score by distinct periods; bare numbers (e.g. 2000) are weak evidence because data rows contain them too.
    const seen = new Set<string>();
    let score = 0;
    for (const x of found) {
      if (seen.has(x.p!.key)) continue;
      seen.add(x.p!.key);
      score += /^\s*\d+(\.0+)?\s*$/.test(String(x.c)) ? 0.5 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
      periodCols = found.map((x) => ({ col: x.col, key: x.p!.key, gran: x.p!.gran }));
    }
  }
  let granularity: Granularity = "month";
  if (periodCols.length) {
    const counts = new Map<Granularity, number>();
    periodCols.forEach((p) => counts.set(p.gran, (counts.get(p.gran) ?? 0) + 1));
    granularity = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const dropped = periodCols.filter((p) => p.gran !== granularity).length;
    if (dropped) warnings.push(`Ignored ${dropped} column(s) with a different period type.`);
    periodCols = periodCols.filter((p) => p.gran === granularity);
  }

  const labelCol = (r: unknown[]) => {
    const firstPeriod = periodCols.length ? periodCols[0].col : r.length;
    for (let c = 0; c < firstPeriod; c++) {
      const s = String(r[c] ?? "").trim();
      if (s && parseNumber(s) === null) return s;
    }
    return "";
  };

  if (!periodCols.length) {
    // ---- Single-period statement: label + one amount (use the last number in the row).
    const key = fallbackPeriod ?? String(new Date().getFullYear() - 1);
    const lines: { name: string; values: number[] }[] = [];
    for (const r of clean) {
      const name = r.map((c) => String(c ?? "").trim()).find((s) => s && parseNumber(s) === null) ?? "";
      const nums = r.map(parseNumber).filter((v): v is number => v !== null);
      if (name && nums.length) lines.push({ name, values: [nums[nums.length - 1]] });
    }
    warnings.push(`No period columns found, so the values were treated as a single period (${key}). You can rename it on the Data page.`);
    const gran: Granularity = /^\d{4}$/.test(key) ? "year" : /Q/.test(key) ? "quarter" : "month";
    return { periods: [key], granularity: gran, lines, warnings, layout: "single" };
  }

  const order = periodCols.map((p, i) => ({ ...p, i })).sort((a, b) => a.key.localeCompare(b.key));
  const uniq: typeof order = [];
  for (const p of order) if (!uniq.some((u) => u.key === p.key)) uniq.push(p);
  const lines: { name: string; values: number[] }[] = [];
  for (const r of clean.slice(headerIdx + 1)) {
    const name = labelCol(r);
    if (!name) continue;
    const vals = uniq.map((p) => parseNumber(r[p.col]));
    if (vals.every((v) => v === null)) continue; // section header row
    lines.push({ name, values: vals.map((v) => v ?? 0) });
  }
  return { periods: uniq.map((p) => p.key), granularity, lines, warnings, layout: "wide" };
}

/** Split loose text (e.g. extracted from a PDF) into a table, then parse it. */
export function parseText(text: string, fallbackPeriod?: string): ParsedStatement {
  const rows: unknown[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/ /g, " ").trim();
    if (!line) continue;
    // Split on 2+ spaces or tabs first; fall back to peeling trailing numbers.
    let cells = line.split(/\t| {2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) {
      const tokens = line.split(" ");
      const tail: string[] = [];
      while (tokens.length > 1 && (parseNumber(tokens[tokens.length - 1]) !== null || parsePeriod(tokens.slice(-2).join(" ")))) {
        const two = tokens.slice(-2).join(" ");
        if (parsePeriod(two) && parseNumber(tokens[tokens.length - 1]) === null) {
          tail.unshift(two);
          tokens.splice(-2, 2);
        } else tail.unshift(tokens.pop()!);
      }
      cells = [tokens.join(" "), ...tail].filter(Boolean);
    }
    rows.push(cells);
  }
  return parseTable(rows, fallbackPeriod);
}

/** Classify parsed lines and normalise signs so costs are positive magnitudes. */
export function toLineItems(parsed: ParsedStatement, source: string): LineItem[] {
  return parsed.lines.map((l) => {
    const c = classifyLine(l.name);
    let values = l.values;
    const total = values.reduce((a, b) => a + b, 0);
    const isCost = !["revenue", "other_income", "ignore"].includes(c.category);
    if (c.group === "Discounts & returns") values = values.map((v) => -Math.abs(v));
    else if (isCost && total < 0) values = values.map((v) => -v);
    else if (!isCost && c.category !== "ignore" && total < 0 && c.category === "revenue") values = values.map((v) => -v);
    return { id: uid("ln"), name: l.name, category: c.category, group: c.group, values, confidence: c.confidence, source };
  });
}

/** Merge new lines into a dataset (union of periods; same-name lines are overwritten per period). */
export function mergeIntoDataset(base: Dataset | null, parsed: ParsedStatement, items: LineItem[], company: string): Dataset {
  if (!base || base.isSample || base.granularity !== parsed.granularity) {
    return { company: company || base?.company || "My Company", currency: base?.currency ?? "USD", periods: parsed.periods, granularity: parsed.granularity, lines: items, headcount: base?.isSample ? undefined : base?.headcount };
  }
  const periods = sortPeriods([...new Set([...base.periods, ...parsed.periods])]);
  const remap = (vals: number[], from: string[]) => periods.map((p) => {
    const i = from.indexOf(p);
    return i >= 0 ? vals[i] : 0;
  });
  const lines: LineItem[] = base.lines.map((l) => ({ ...l, values: remap(l.values, base.periods) }));
  for (const it of items) {
    const existing = lines.find((l) => l.name.toLowerCase() === it.name.toLowerCase());
    const vals = remap(it.values, parsed.periods);
    if (existing) {
      existing.values = existing.values.map((v, i) => (parsed.periods.includes(periods[i]) ? vals[i] : v));
    } else lines.push({ ...it, values: vals });
  }
  return { ...base, periods, lines };
}
