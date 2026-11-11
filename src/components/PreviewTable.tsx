"use client";

/** Shows the first rows of a raw uploaded table (reference documents). */
export function PreviewTable({ rows }: { rows: string[][] }) {
  return (
    <div className="max-h-72 overflow-auto p-3">
      <table className="w-full border-collapse text-[12px]">
        <tbody>
          {rows.slice(0, 25).map((r, i) => (
            <tr key={i} className={i === 0 ? "bg-slate-50 font-semibold" : "border-t border-line"}>
              {r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 25 && <div className="px-2 pt-1 text-[11px] text-muted">Showing 25 of {rows.length} rows</div>}
    </div>
  );
}
