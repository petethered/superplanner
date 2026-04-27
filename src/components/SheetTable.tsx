// =============================================================================
// SheetTable.tsx — generic table renderer used by TableGrid and the
// combined view. Knows how to:
//   - render a header strip with title + caller-supplied `headerExtra`
//     (used by TableGrid for the category-filter checkboxes)
//   - paginate via a Show-N selector (10 / 20 / 50 / All)
//   - apply per-row background tints from a lab→color map, where the lab
//     name comes from a configurable column index (`labColumn`)
//   - alternate row backgrounds when no lab tint is available
//
// This component is purely presentational — it doesn't fetch, mutate, or
// persist anything. Pagination state is local and resets on remount.
// =============================================================================

import { useState } from "react";
import type { TableData } from "../lib/types";

interface SheetTableProps {
  /** Heading label shown in the title strip. */
  title: string;
  /** Table data to render. Headers drive the <thead> labels; rows are the
   *  visible body. Empty rows should be filtered out before this point. */
  data: TableData;
  /** Optional lab→color map. When provided, rows whose `data[labColumn]`
   *  matches a key are tinted with that color. */
  labColors?: Record<string, string>;
  /** Column index where the lab name lives. Defaults to 0 (per-category
   *  tables). The Combined table uses 1 because of the prepended TYPE
   *  column — see TableGrid.tsx. */
  labColumn?: number;
  /** Optional content rendered in the title strip next to the title.
   *  Used by TableGrid to inject the category checkboxes. */
  headerExtra?: React.ReactNode;
}

// Pagination presets. "all" disables limiting (no pagination needed at the
// row counts we deal with — usually < 200 rows total).
const ROW_OPTIONS = [10, 20, 50, "all"] as const;
type RowLimit = (typeof ROW_OPTIONS)[number];

export function SheetTable({ title, data, labColors, labColumn = 0, headerExtra }: SheetTableProps) {
  const [limit, setLimit] = useState<RowLimit>(10);
  // Slice when limit is numeric; show everything when "all".
  const visibleRows = limit === "all" ? data.rows : data.rows.slice(0, limit);

  return (
    <div className="bg-slate-900/80 rounded-lg border border-slate-700/40 overflow-hidden card-shimmer animate-fade-up">
      {/* Title strip: title + optional extras + pagination select */}
      <div className="px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/40 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-display text-xs font-bold tracking-[0.15em] text-cyan-300">
          {title}
        </h2>
        {headerExtra}
        <div className="ml-auto">
        <select
          value={String(limit)}
          onChange={(e) => {
            const val = e.target.value;
            // Coerce back to either "all" or a number from ROW_OPTIONS.
            // The cast is safe because the <select> only emits values
            // from ROW_OPTIONS.
            setLimit(val === "all" ? "all" : Number(val) as 10 | 20 | 50);
          }}
          className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-400 focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
        >
          {ROW_OPTIONS.map((opt) => (
            <option key={opt} value={String(opt)}>
              {opt === "all" ? "All" : `Show ${opt}`}
            </option>
          ))}
        </select>
        </div>
      </div>
      {/* Horizontal scroll wrapper: lets wide tables scroll instead of
          forcing the page wider. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono-data">
          <thead>
            <tr className="bg-slate-800/30">
              {data.headers.map((header, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-semibold text-slate-500 tracking-wider uppercase whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => {
              // Look up the lab tint by name. Falls back to alternating
              // slate stripes when no lab map is supplied or the lab
              // isn't in the map.
              const lab = row[labColumn] ?? "";
              const bg = labColors?.[lab];
              return (
                <tr
                  key={ri}
                  style={bg ? { backgroundColor: bg } : undefined}
                  className={`border-t border-slate-800/50 transition-colors hover:bg-slate-800/40 ${
                    bg ? "" : ri % 2 === 0 ? "bg-slate-900/30" : "bg-slate-800/15"
                  }`}
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-1.5 text-slate-300 whitespace-nowrap"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
