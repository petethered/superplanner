import { useMemo } from "react";
import { SheetTable } from "./SheetTable";
import type { TableData } from "../lib/types";

interface TableGridProps {
  sheets: Record<string, TableData>;
}

const TABLE_CONFIG = [
  { key: "shardPath", label: "Shard Path" },
  { key: "eHP", label: "eHP" },
  { key: "eDamage", label: "eDamage" },
  { key: "eEcon", label: "eEcon" },
];

const LAB_PALETTE = [
  "#93c5fd", // blue-300
  "#f9a8d4", // pink-300
  "#6ee7b7", // emerald-300
  "#fcd34d", // amber-300
  "#a5b4fc", // indigo-300
  "#fda4af", // rose-300
  "#5eead4", // teal-300
  "#fde047", // yellow-300
  "#c4b5fd", // violet-300
  "#fdba74", // orange-300
  "#67e8f9", // cyan-300
  "#d8b4fe", // purple-300
  "#86efac", // green-300
  "#fca5a5", // red-300
  "#7dd3fc", // sky-300
  "#f0abfc", // fuchsia-300
];

function buildLabColorMap(sheets: Record<string, TableData>): Record<string, string> {
  const labs = new Set<string>();
  for (const { key } of TABLE_CONFIG) {
    const sheet = sheets[key];
    if (!sheet) continue;
    for (const row of sheet.rows) {
      const lab = row[0]?.trim();
      if (lab) labs.add(lab);
    }
  }
  const map: Record<string, string> = {};
  let i = 0;
  for (const lab of labs) {
    map[lab] = LAB_PALETTE[i % LAB_PALETTE.length];
    i++;
  }
  return map;
}

function parsePercent(value: string): number {
  const cleaned = value.replace(/[%\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? -Infinity : num;
}

function buildCombinedTable(
  sheets: Record<string, TableData>,
): TableData {
  const rows: string[][] = [];

  for (const { key, label } of TABLE_CONFIG) {
    const sheet = sheets[key];
    if (!sheet) continue;
    for (const row of sheet.rows) {
      if (row.every((cell) => cell === "")) continue;
      rows.push([label, ...row]);
    }
  }

  rows.sort((a, b) => parsePercent(b[5]) - parsePercent(a[5]));

  return {
    headers: ["TYPE", "LAB", "LEVEL", "COST", "DURATION", "% GAIN"],
    rows,
  };
}

export function TableGrid({ sheets }: TableGridProps) {
  const combined = useMemo(() => buildCombinedTable(sheets), [sheets]);
  const labColors = useMemo(() => buildLabColorMap(sheets), [sheets]);

  return (
    <div className="p-6 w-full space-y-6">
      <div className="w-full">
        <SheetTable title="Combined" data={combined} labColors={labColors} labColumn={1} />
      </div>
      <div className="flex flex-wrap gap-6 justify-center">
        {TABLE_CONFIG.map(
          ({ key, label }) =>
            sheets[key] && (
              <div key={key} className="w-full max-w-[600px]">
                <SheetTable title={label} data={sheets[key]} labColors={labColors} labColumn={0} />
              </div>
            ),
        )}
      </div>
    </div>
  );
}
