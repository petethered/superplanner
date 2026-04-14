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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        <select
          value={String(limit)}
          onChange={(e) => {
            const val = e.target.value;
            setLimit(val === "all" ? "all" : Number(val));
          }}
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {ROW_OPTIONS.map((opt) => (
            <option key={opt} value={String(opt)}>
              {opt === "all" ? "All" : `Show ${opt}`}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              {data.headers.map((header, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap"
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
                  className={bg ? undefined : (ri % 2 === 0 ? "bg-white" : "bg-gray-50/50")}
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-1.5 text-gray-700 whitespace-nowrap"
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
