import { useState } from "react";
import type { TableData } from "../lib/types";

interface SheetTableProps {
  title: string;
  data: TableData;
  labColors?: Record<string, string>;
  labColumn?: number;
}

const ROW_OPTIONS = [10, 20, 50, "all"] as const;
type RowLimit = (typeof ROW_OPTIONS)[number];

export function SheetTable({ title, data, labColors, labColumn = 0 }: SheetTableProps) {
  const [limit, setLimit] = useState<RowLimit>(10);
  const visibleRows = limit === "all" ? data.rows : data.rows.slice(0, limit);

  return (
    <div className="bg-slate-900/80 rounded-lg border border-slate-700/40 overflow-hidden card-shimmer animate-fade-up">
      <div className="px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/40 flex items-center justify-between">
        <h2 className="font-display text-xs font-bold tracking-[0.15em] text-cyan-300">
          {title}
        </h2>
        <select
          value={String(limit)}
          onChange={(e) => {
            const val = e.target.value;
            setLimit(val === "all" ? "all" : Number(val));
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
