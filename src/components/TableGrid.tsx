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

export function TableGrid({ sheets }: TableGridProps) {
  return (
    <div className="flex flex-wrap gap-6 justify-center p-6 w-full">
      {TABLE_CONFIG.map(
        ({ key, label }) =>
          sheets[key] && (
            <div key={key} className="w-full max-w-[600px]">
              <SheetTable title={label} data={sheets[key]} />
            </div>
          ),
      )}
    </div>
  );
}
