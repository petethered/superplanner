import { useState, useMemo } from "react";
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

function buildCombinedTable(
  sheets: Record<string, TableData>,
  enabledKeys: Set<string>,
): TableData {
  const rows: string[][] = [];

  for (const { key } of TABLE_CONFIG) {
    if (!enabledKeys.has(key)) continue;
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
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(
    () => new Set(TABLE_CONFIG.map((t) => t.key)),
  );

  function toggleKey(key: string) {
    setEnabledKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const combined = useMemo(
    () => buildCombinedTable(sheets, enabledKeys),
    [sheets, enabledKeys],
  );
  const labColors = useMemo(() => buildLabColorMap(sheets), [sheets]);

  return (
    <div className="p-6 w-full space-y-6">
      <div className="w-full">
        <SheetTable
          title="Combined"
          data={combined}
          labColors={labColors}
          labColumn={1}
          headerExtra={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {TABLE_CONFIG.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-1.5 cursor-pointer text-[10px]"
                >
                  <input
                    type="checkbox"
                    checked={enabledKeys.has(key)}
                    onChange={() => toggleKey(key)}
                    className="accent-cyan-500"
                  />
                  <span className="text-slate-400 font-mono-data">{label}</span>
                </label>
              ))}
            </div>
          }
        />
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
