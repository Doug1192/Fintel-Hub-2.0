"use client";

import Papa from "papaparse";

export async function readCsv(file: File): Promise<unknown[][]> {
  const text = await file.text();
  const res = Papa.parse<unknown[]>(text, { skipEmptyLines: true, dynamicTyping: false });
  return res.data;
}

/** Read the sheet that looks most like a statement (most numeric cells). */
export async function readXlsx(file: File): Promise<{ rows: unknown[][]; sheet: string }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  let best = { rows: [] as unknown[][], sheet: wb.SheetNames[0], score: -1 };
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const score = rows.reduce((a, r) => a + r.filter((c) => typeof c === "number").length, 0);
    if (score > best.score) best = { rows, sheet: name, score };
  }
  return { rows: best.rows, sheet: best.sheet };
}

/** Extract text from a PDF, rebuilding rows from item positions. */
export async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string; w: number }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      const arr = rows.get(y) ?? [];
      arr.push({ x: it.transform[4], s: it.str, w: it.width });
      rows.set(y, arr);
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
      items.sort((a, b) => a.x - b.x);
      let line = "";
      let lastEnd = -1;
      for (const it of items) {
        if (lastEnd >= 0) line += it.x - lastEnd > 12 ? "   " : it.x - lastEnd > 1.5 ? " " : "";
        line += it.s;
        lastEnd = it.x + it.w;
      }
      out.push(line);
    });
  }
  return out.join("\n");
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function downloadText(name: string, text: string, type = "text/csv") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
