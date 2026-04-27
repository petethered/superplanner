// =============================================================================
// TableGrid.tsx — the data-browse view (below the planner).
//
// Renders two things:
//   1. A "Combined" table that interleaves all enabled categories and
//      sorts by % gain descending — useful for spotting the highest-yield
//      labs across all categories at once.
//   2. One per-category table per available sheet (eHP, Regen, eDamage,
//      eEcon, Shard Path) for browsing any single category in isolation.
//
// Storage / display key model (different scheme than Planner.tsx — this
// file uses cache keys directly because that's what the `sheets` prop is
// keyed by):
//
//   `TABLE_CONFIG`  — array of {key, label} where `key` is the cache/sheet
//   key in `sheets` (camelCase: eHP, regen, eDamage, eEcon, shardPath) and
//   `label` is the user-facing display string. Order matters — drives
//   the order of tabs and per-category tables.
//
//   `TYPE_LABELS`   — same {cache key → display label} map but flat, used
//   when prepending the category to each row in the Combined view.
//
// The "enabled" filter here is local component state (NOT persisted) —
// users get a fresh "all enabled" set on every page load. This is
// intentional; the planner's enabled-types is the persisted source of
// truth for category selection.
// =============================================================================

import { useState, useMemo } from "react";
import { SheetTable } from "./SheetTable";
import { buildLabColorMap } from "../lib/colors";
import type { TableData } from "../lib/types";

interface TableGridProps {
  /** Map of cache/sheet key → TableData, same shape as `Planner` consumes. */
  sheets: Record<string, TableData>;
}

// Drives both the per-category table list and the combined-table filter
// checkboxes. Ordering here = display order on screen.
const TABLE_CONFIG = [
  { key: "eHP", label: "eHP" },
  { key: "regen", label: "Regen" },
  { key: "eDamage", label: "eDAMAGE" },
  { key: "eEcon", label: "eECON" },
  { key: "shardPath", label: "Shard Path" },
];

// Flat lookup used by `buildCombinedTable` to label each row with its
// originating category. Kept in sync with TABLE_CONFIG above.
const TYPE_LABELS: Record<string, string> = {
  eHP: "eHP",
  regen: "Regen",
  eDamage: "eDAMAGE",
  eEcon: "eECON",
  shardPath: "Shard Path",
};

/**
 * Parses a "% gain" cell like "16.455 638%" into a comparable number.
 * Used by the combined-table sort. Empty / unparseable cells become
 * `-Infinity` so they sort to the bottom.
 *
 * Note: this strips both `%` and ALL whitespace (including the embedded
 * thin-space-style separator the source spreadsheet uses for grouping).
 */
function parsePercent(value: string): number {
  const cleaned = value.replace(/[%\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? -Infinity : num;
}

/**
 * Builds the Combined view: one table interleaving rows from every enabled
 * category, with the category name prepended as a "TYPE" column, sorted
 * by % gain descending.
 *
 * The output schema is intentionally fixed — it matches the column count
 * SheetTable expects (TYPE / LAB / LEVEL / COST / DURATION / % GAIN). Sort
 * happens on column index 5 (% GAIN) in the output, which is column 4 of
 * the original row plus one for the prepended TYPE.
 */
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
      // Skip empty spacer rows — same logic as parseLabSteps.
      if (row.every((cell) => cell === "")) continue;
      // Prepend the category label so the user can tell which sheet a row
      // came from in the combined view.
      rows.push([TYPE_LABELS[key], ...row]);
    }
  }

  // Sort highest gain first. Index 5 = % GAIN column (after TYPE prefix).
  rows.sort((a, b) => parsePercent(b[5]) - parsePercent(a[5]));

  return {
    headers: ["TYPE", "LAB", "LEVEL", "COST", "DURATION", "% GAIN"],
    rows,
  };
}

export function TableGrid({ sheets }: TableGridProps) {
  // Default: every category enabled. Lazy initializer avoids creating a
  // new Set on every render. State is intentionally NOT persisted —
  // this is just a view filter local to this session.
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(
    () => new Set(TABLE_CONFIG.map((t) => t.key)),
  );

  /** Toggles one category in the local "enabled" set. We clone the Set on
   *  every change so React detects the state update. */
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

  // Memoize the combined table — building it iterates every row of every
  // enabled sheet plus a sort, so re-running on every render would be
  // wasteful even at this scale.
  const combined = useMemo(
    () => buildCombinedTable(sheets, enabledKeys),
    [sheets, enabledKeys],
  );
  const labColors = useMemo(() => buildLabColorMap(sheets), [sheets]);

  return (
    <div className="p-6 w-full space-y-6">
      {/* Combined table — full width, with the category-filter checkboxes
          rendered into the SheetTable header via `headerExtra`. */}
      <div className="w-full">
        <SheetTable
          title="Combined"
          data={combined}
          labColors={labColors}
          // labColumn=1 because the LAB cell is at index 1 (after the
          // prepended TYPE column).
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
      {/* Per-category tables. Only rendered for sheets that actually
          loaded — handles the partial-config case (e.g. only Effective
          Paths configured, no Modules). */}
      <div className="flex flex-wrap gap-6 justify-center">
        {TABLE_CONFIG.map(
          ({ key, label }) =>
            sheets[key] && (
              <div key={key} className="w-full max-w-[600px]">
                {/* labColumn=0 here — these tables have no TYPE prefix
                    column, so LAB is column 0. */}
                <SheetTable title={label} data={sheets[key]} labColors={labColors} labColumn={0} />
              </div>
            ),
        )}
      </div>
    </div>
  );
}
