// =============================================================================
// colors.ts — assigns a stable background color to each unique lab name.
//
// Why: the planner UI (slot lists + Gantt chart) and the table grid both want
// to color-code rows by lab so the user can visually track which sessions
// involve the same lab. We map each distinct lab name to a color from a
// fixed palette in insertion order, so a lab keeps the same color across
// renders within a single session (the order is stable as long as the
// underlying sheets don't reorder).
//
// All colors use 18% alpha so they sit comfortably as a row background
// against the slate-900 page surface. The Gantt chart later boosts this
// to 35% (see GanttChart.tsx#ganttBg) for stronger contrast on the small
// timeline blocks.
// =============================================================================

import type { TableData } from "./types";

/**
 * 16-entry palette. The order is hand-tuned for visual diversity — adjacent
 * entries deliberately come from different hue families so consecutive labs
 * (which appear adjacent in the table) look distinct.
 *
 * Wraps at 16 labs via modulo. Most plans use ~10-15 distinct labs so
 * collisions are uncommon in practice.
 */
export const LAB_PALETTE = [
  "rgba(59, 130, 246, 0.18)",  // blue-500
  "rgba(236, 72, 153, 0.18)",  // pink-500
  "rgba(16, 185, 129, 0.18)",  // emerald-500
  "rgba(245, 158, 11, 0.18)",  // amber-500
  "rgba(99, 102, 241, 0.18)",  // indigo-500
  "rgba(244, 63, 94, 0.18)",   // rose-500
  "rgba(20, 184, 166, 0.18)",  // teal-500
  "rgba(234, 179, 8, 0.18)",   // yellow-500
  "rgba(139, 92, 246, 0.18)",  // violet-500
  "rgba(249, 115, 22, 0.18)",  // orange-500
  "rgba(6, 182, 212, 0.18)",   // cyan-500
  "rgba(168, 85, 247, 0.18)",  // purple-500
  "rgba(34, 197, 94, 0.18)",   // green-500
  "rgba(239, 68, 68, 0.18)",   // red-500
  "rgba(14, 165, 233, 0.18)",  // sky-500
  "rgba(217, 70, 239, 0.18)",  // fuchsia-500
];

/**
 * Walks every row of every sheet, collects the unique lab names (column 0,
 * trimmed), and returns a map from lab name → palette color. Insertion
 * order in the resulting Set determines color assignment, which makes
 * colors stable across renders for as long as the source data is stable.
 *
 * Empty/whitespace-only lab cells are skipped.
 *
 * Used by:
 *   - Planner.tsx (slot list backgrounds, Gantt block fills)
 *   - TableGrid.tsx (row backgrounds in the Combined and per-category
 *     tables, via SheetTable.tsx#labColors)
 */
export function buildLabColorMap(
  sheets: Record<string, TableData>,
): Record<string, string> {
  const labs = new Set<string>();
  for (const data of Object.values(sheets)) {
    for (const row of data.rows) {
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
