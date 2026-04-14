import { useMemo } from "react";
import { SheetTable } from "./SheetTable";
import { buildLabColorMap } from "../lib/colors";
import type { TableData } from "../lib/types";

interface TableGridProps {
  sheets: Record<string, TableData>;
}

const TABLE_CONFIG = [
  { key: "eHP", label: "eHP" },
  { key: "regen", label: "regen" },
  { key: "eDamage", label: "eDAMAGE" },
  { key: "eEcon", label: "eECON" },
  { key: "shardPath", label: "SHARD PATH" },
];

const TYPE_LABELS: Record<string, string> = {
  eHP: "eHP",
  regen: "regen",
  eDamage: "eDAMAGE",
  eEcon: "eECON",
  shardPath: "SHARD PATH",
};

function parsePercent(value: string): number {
  const cleaned = value.replace(/[%\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? -Infinity : num;
}

function buildCombinedTable(sheets: Record<string, TableData>): TableData {
  const rows: string[][] = [];

  for (const { key } of TABLE_CONFIG) {
    const sheet = sheets[key];
    if (!sheet) continue;
    for (const row of sheet.rows) {
      if (row.every((cell) => cell === "")) continue;
      rows.push([TYPE_LABELS[key], ...row]);
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
