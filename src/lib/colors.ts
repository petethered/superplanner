import type { TableData } from "./types";

export const LAB_PALETTE = [
  "rgba(59, 130, 246, 0.18)",
  "rgba(236, 72, 153, 0.18)",
  "rgba(16, 185, 129, 0.18)",
  "rgba(245, 158, 11, 0.18)",
  "rgba(99, 102, 241, 0.18)",
  "rgba(244, 63, 94, 0.18)",
  "rgba(20, 184, 166, 0.18)",
  "rgba(234, 179, 8, 0.18)",
  "rgba(139, 92, 246, 0.18)",
  "rgba(249, 115, 22, 0.18)",
  "rgba(6, 182, 212, 0.18)",
  "rgba(168, 85, 247, 0.18)",
  "rgba(34, 197, 94, 0.18)",
  "rgba(239, 68, 68, 0.18)",
  "rgba(14, 165, 233, 0.18)",
  "rgba(217, 70, 239, 0.18)",
];

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
