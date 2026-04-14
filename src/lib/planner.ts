import type { LabStep, TableData } from "./types";

const COST_SUFFIXES: Record<string, number> = {
  B: 1e9,
  T: 1e12,
  q: 1e15,
  Q: 1e18,
};

export function parseCost(str: string): number {
  const trimmed = str.trim();
  if (!trimmed) return 0;
  const match = trimmed.match(/^([\d.,\s]+?)\s*([BTqQ]?)$/);
  if (!match) return 0;
  const numStr = match[1].replace(/[\s,]/g, "");
  const value = parseFloat(numStr);
  if (isNaN(value)) return 0;
  return value * (COST_SUFFIXES[match[2]] || 1);
}

export function parseDuration(str: string): number {
  let hours = 0;
  const d = str.match(/(\d+)\s*d/);
  const h = str.match(/(\d+)\s*h/);
  const m = str.match(/(\d+)\s*m/);
  if (d) hours += parseInt(d[1]) * 24;
  if (h) hours += parseInt(h[1]);
  if (m) hours += parseInt(m[1]) / 60;
  return hours;
}

export function parseGain(str: string): number {
  const cleaned = str.replace(/[%\s]/g, "");
  if (!cleaned) return 0;
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

export function parseLevel(str: string): number {
  const match = str.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

export function parseLabSteps(type: string, data: TableData): LabStep[] {
  const steps: LabStep[] = [];
  for (const row of data.rows) {
    const [lab, levelStr, costStr, durationStr, gainStr] = row;
    if (!lab?.trim()) continue;
    steps.push({
      type,
      lab: lab.trim(),
      level: parseLevel(levelStr),
      cost: parseCost(costStr),
      durationHours: parseDuration(durationStr),
      gainPerDay: parseGain(gainStr),
    });
  }
  return steps;
}
