import type { LabStep, PlannedStep, SimulationResult, TableData } from "./types";

const COST_SUFFIXES: Record<string, number> = {
  M: 1e6,
  B: 1e9,
  T: 1e12,
  q: 1e15,
  Q: 1e18,
};

export function parseCost(str: string): number {
  const trimmed = str.trim();
  if (!trimmed) return 0;
  const match = trimmed.match(/^([\d.,\s]+?)\s*([MBTqQ]?)$/);
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

export function runSimulation(
  allSteps: LabStep[],
  dailyIncome: number,
  minDays = 10,
): SimulationResult {
  const minHours = minDays * 24;
  // Build lab queues grouped by unique lab identity, sorted by level
  const labQueues = new Map<string, LabStep[]>();
  for (const s of allSteps) {
    const key = `${s.type}::${s.lab}`;
    if (!labQueues.has(key)) labQueues.set(key, []);
    labQueues.get(key)!.push(s);
  }
  for (const queue of labQueues.values()) {
    queue.sort((a, b) => a.level - b.level);
  }

  // Next available level index per lab
  const labNextIdx = new Map<string, number>();
  for (const key of labQueues.keys()) {
    labNextIdx.set(key, 0);
  }

  // Currently running lab keys
  const running = new Set<string>();

  // Slot state
  const plans: PlannedStep[][] = [[], [], []];
  const slotFreeAt = [0, 0, 0];
  const slotLabKey: (string | null)[] = [null, null, null];
  const slotStep: (LabStep | null)[] = [null, null, null];

  let hour = 0;
  let pool = dailyIncome;
  let currentDailyIncome = dailyIncome;

  function freeFinishedSlots(): void {
    for (let i = 0; i < 3; i++) {
      if (slotLabKey[i] && slotFreeAt[i] <= hour) {
        // If completed lab is eECON, boost daily income
        if (slotStep[i] && slotStep[i]!.type === "eECON") {
          const gain = (slotStep[i]!.gainPerDay / 24) * slotStep[i]!.durationHours;
          currentDailyIncome *= 1 + gain / 100;
        }
        running.delete(slotLabKey[i]!);
        slotLabKey[i] = null;
        slotStep[i] = null;
      }
    }
  }

  function findBestAffordable(budget?: number): { step: LabStep; key: string } | null {
    const maxBudget = budget ?? pool;
    let best: { step: LabStep; key: string } | null = null;
    for (const [key, queue] of labQueues) {
      if (running.has(key)) continue;
      const idx = labNextIdx.get(key)!;
      if (idx >= queue.length) continue;
      const candidate = queue[idx];
      if (candidate.cost > maxBudget) continue;
      if (
        !best ||
        candidate.gainPerDay > best.step.gainPerDay ||
        (candidate.gainPerDay === best.step.gainPerDay &&
          candidate.durationHours < best.step.durationHours)
      ) {
        best = { step: candidate, key };
      }
    }
    return best;
  }

  function findCheapestAvailable(): LabStep | null {
    let cheapest: LabStep | null = null;
    for (const [key, queue] of labQueues) {
      if (running.has(key)) continue;
      const idx = labNextIdx.get(key)!;
      if (idx >= queue.length) continue;
      const candidate = queue[idx];
      if (!cheapest || candidate.cost < cheapest.cost) {
        cheapest = candidate;
      }
    }
    return cheapest;
  }

  for (let iter = 0; iter < 5000; iter++) {
    if (slotFreeAt.every((t) => t >= minHours)) break;

    freeFinishedSlots();

    // Count free slots and find cheapest lab for budget reservation
    const freeSlotIds: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (slotLabKey[i] === null && slotFreeAt[i] < minHours) {
        freeSlotIds.push(i);
      }
    }

    const cheapest = freeSlotIds.length > 1 ? findCheapestAvailable() : null;
    const reserveCost = cheapest?.cost ?? 0;

    // Try to assign to each free slot, reserving budget for remaining slots
    let assigned = false;
    for (let fi = 0; fi < freeSlotIds.length; fi++) {
      const i = freeSlotIds[fi];
      const slotsAfter = freeSlotIds.length - fi - 1;
      const budget = pool - reserveCost * slotsAfter;

      const best = findBestAffordable(budget > 0 ? budget : 0);
      if (!best) continue;

      plans[i].push({
        labStep: best.step,
        startHour: hour,
        poolAtStart: pool,
        idleHoursBefore:
          plans[i].length === 0 ? 0 : Math.max(0, hour - slotFreeAt[i]),
      });

      pool -= best.step.cost;
      slotFreeAt[i] = hour + best.step.durationHours;
      slotLabKey[i] = best.key;
      slotStep[i] = best.step;
      running.add(best.key);
      labNextIdx.set(best.key, labNextIdx.get(best.key)! + 1);
      assigned = true;
    }

    if (assigned) continue;

    // Nothing assigned — advance time
    let nextFinish = Infinity;
    for (let i = 0; i < 3; i++) {
      if (slotLabKey[i] && slotFreeAt[i] > hour) {
        nextFinish = Math.min(nextFinish, slotFreeAt[i]);
      }
    }

    if (nextFinish !== Infinity) {
      pool += currentDailyIncome * ((nextFinish - hour) / 24);
      hour = nextFinish;
    } else {
      const cheapest = findCheapestAvailable();
      if (!cheapest) break;
      const needed = cheapest.cost - pool;
      if (needed <= 0) continue;
      const hoursToWait = (needed / currentDailyIncome) * 24;
      hour += hoursToWait;
      pool += needed;
    }
  }

  return {
    slots: plans.map((steps) => ({ steps })),
    finalDailyIncome: currentDailyIncome,
  };
}
