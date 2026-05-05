// =============================================================================
// planner.ts — the simulator.
//
// What this module does:
//   1. Parses raw spreadsheet strings ("69.58 B", "2d 15h 14m", "16.455 638%",
//      "lvl 5") into typed numbers.
//   2. Runs a greedy N-slot scheduling simulation that picks which lab to
//      research in which slot at which hour, given a daily-income budget.
//      `N` is supplied by the caller (the `slotCount` parameter); it
//      defaults to 3 so all existing call sites and tests continue to work.
//
// THE GAME MODEL (read this before touching the simulator):
//   - The Tower has exactly 3 concurrent research slots; this is the
//     game-canonical value and the simulator's default. The Planner UI
//     exposes a 1–5 dropdown so the user can run "what-if" simulations
//     for fewer or more slots.
//   - Each "lab" has a sequence of upgrade levels; higher levels unlock as
//     you complete the lower ones, so per-lab progression is strictly
//     ordered.
//   - You can't run the SAME lab in two slots at once (this is the "running
//     set" check).
//   - Coins regenerate at `dailyIncome` coins per day. The user provides
//     this number. The simulator continuously accrues coins at this rate
//     when time advances.
//   - eECON labs raise daily income on completion (compounding). Other
//     categories don't affect income.
//
// SCHEDULING POLICY (greedy, with a budget reservation rule):
//   - At each tick, find every empty slot.
//   - For each empty slot in order, pick the affordable lab with the
//     highest gainPerDay (ties broken by shorter duration). "Affordable"
//     means cost <= (current pool) - (cheapest available × number of
//     remaining empty slots after this one). The reservation prevents one
//     greedy pick from leaving subsequent slots starving.
//   - When no slot can be filled, advance time to either:
//       (a) the next slot-completion event (and accrue income), or
//       (b) the moment we'll have enough coins for the cheapest-available
//           lab if no slot is currently working.
//   - Stop when every slot has been filled to at least minDays * 24 hours.
//
// Iteration cap (5000): a safety net so a malformed input set can't loop
// forever. In practice a 90-day plan completes in a few hundred iterations.
// =============================================================================

import type { LabStep, PlannedStep, SimulationResult, TableData } from "./types";

// SI-style suffixes used by the source spreadsheet. Note that `q`
// (lowercase quadrillion = 1e15) and `Q` (uppercase quintillion = 1e18) are
// case-sensitive — DO NOT lowercase the input before matching.
const COST_SUFFIXES: Record<string, number> = {
  M: 1e6,
  B: 1e9,
  T: 1e12,
  q: 1e15,
  Q: 1e18,
};

/**
 * Parses a cost string like "69.58 B" or "1.12 q" into a number.
 *
 * Accepts:
 *   - decimal point or comma as the thousands separator (we strip both)
 *   - optional whitespace
 *   - optional trailing suffix from COST_SUFFIXES
 *
 * Returns 0 on any unparseable input — the simulator treats 0-cost labs as
 * always-affordable, which is the correct fallback for a malformed cell.
 */
export function parseCost(str: string): number {
  const trimmed = str.trim();
  if (!trimmed) return 0;
  // Group 1 is the numeric portion (digits, dots, commas, spaces);
  // group 2 is one of the SI suffixes or empty.
  const match = trimmed.match(/^([\d.,\s]+?)\s*([MBTqQ]?)$/);
  if (!match) return 0;
  const numStr = match[1].replace(/[\s,]/g, "");
  const value = parseFloat(numStr);
  if (isNaN(value)) return 0;
  return value * (COST_SUFFIXES[match[2]] || 1);
}

/**
 * Parses a duration like "2d 15h 14m" into a fractional hour count.
 *
 * Each component is optional and matched independently — the function will
 * accept "1h", "30m", "3d 0h 0m", and any subset.
 */
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

/**
 * Parses a percentage gain like "16.455 638%" (note the embedded space —
 * the source spreadsheet uses a thin-space-style group separator).
 *
 * Returns the percentage value as a number (e.g. 16.455638), NOT a fraction.
 */
export function parseGain(str: string): number {
  const cleaned = str.replace(/[%\s]/g, "");
  if (!cleaned) return 0;
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/** Parses "lvl 5" or any string containing a number → 5. Returns 0 if no
 *  digits are found. */
export function parseLevel(str: string): number {
  const match = str.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Converts a `TableData` (one category's worth of rows) into typed
 * `LabStep[]`. The `type` argument is the category label used as the
 * grouping key in the simulator (eHP / regen / eDAMAGE / eECON / SHARD PATH).
 *
 * Rows with an empty `lab` column are skipped (these appear in the source
 * spreadsheet as blank spacers between sections).
 */
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

/**
 * The simulator. Returns `{ slots, finalDailyIncome }` describing a
 * greedy schedule that fills all `slotCount` slots for at least `minDays`
 * days. `slotCount` defaults to 3 (game canon) when omitted.
 *
 * Inputs:
 *   - `allSteps`     — every candidate LabStep across all enabled categories
 *   - `dailyIncome`  — coin generation rate per 24h
 *   - `minDays`      — planning horizon; loop exits once each slot's
 *                      `slotFreeAt` is >= minDays*24
 *
 * Algorithm sketch:
 *
 *   1. Group steps by (type, lab) — these are the "lab queues". Within
 *      each queue, sort by level ascending so we always advance level by
 *      level. `labNextIdx` tracks how many levels we've already scheduled
 *      for each lab.
 *
 *   2. State:
 *      - `running`    — set of lab keys currently in a slot (used to
 *                       prevent the same lab in two slots simultaneously)
 *      - `slotFreeAt` — hour when each slot becomes free
 *      - `slotLabKey` — which lab key is in each slot, or null
 *      - `slotStep`   — full LabStep currently assigned (used for eECON
 *                       income boost on completion)
 *      - `pool`       — current coin balance
 *      - `currentDailyIncome` — starts at `dailyIncome`, grows when eECON
 *                       labs finish (compounding multiplicatively)
 *
 *   3. Each iteration of the main loop either fills one or more slots, or
 *      advances time. Time advances to whichever comes first:
 *        - the next slot-finish event (so we can free that slot and
 *          re-evaluate with one more slot available)
 *        - the moment we have enough coins for the cheapest available lab
 *          (only when nothing is currently running)
 *
 *   4. Budget reservation: when picking a lab for slot i with N slots
 *      remaining empty after it, we don't let slot i spend more than
 *      `pool - cheapest_cost * N`. This keeps subsequent free slots viable.
 *
 *   5. eECON income boost: when a slot finishes and the completed lab was
 *      type "eECON", we compute the prorated gain (`(gainPerDay/24)*hours`)
 *      and multiply `currentDailyIncome` by `(1 + gain/100)`. This is the
 *      ONLY place income changes during simulation.
 */
export function runSimulation(
  allSteps: LabStep[],
  dailyIncome: number,
  minDays: number = 10,
  // Number of concurrent research slots to simulate. Defaults to the
  // game-canonical value of 3 so existing call sites and the pre-existing
  // tests don't need updating. The Planner UI restricts user input to
  // 1–5 via the SLOTS dropdown.
  slotCount: number = 3,
): SimulationResult {
  const minHours = minDays * 24;

  // Build lab queues grouped by unique lab identity, sorted by level.
  // Key shape: `${type}::${lab}` so the same lab name in two categories
  // (rare but possible) doesn't collide.
  const labQueues = new Map<string, LabStep[]>();
  for (const s of allSteps) {
    const key = `${s.type}::${s.lab}`;
    if (!labQueues.has(key)) labQueues.set(key, []);
    labQueues.get(key)!.push(s);
  }
  for (const queue of labQueues.values()) {
    queue.sort((a, b) => a.level - b.level);
  }

  // Per-lab cursor: the index of the next un-scheduled level in its queue.
  const labNextIdx = new Map<string, number>();
  for (const key of labQueues.keys()) {
    labNextIdx.set(key, 0);
  }

  // Set of lab keys currently in a slot — used to enforce
  // "same lab can't run in 2 slots simultaneously".
  const running = new Set<string>();

  // Per-slot scheduling state. Sized by `slotCount`. The game's canonical
  // value is 3; the caller may pass 1–5 via the SLOTS dropdown in the UI.
  // The greedy budget reservation below derives all its arithmetic from
  // `freeSlotIds.length` rather than this constant, so it generalises to
  // any `slotCount` without algorithmic change.
  const plans: PlannedStep[][] = Array.from({ length: slotCount }, () => []);
  const slotFreeAt: number[] = new Array(slotCount).fill(0);
  const slotLabKey: (string | null)[] = new Array(slotCount).fill(null);
  const slotStep: (LabStep | null)[] = new Array(slotCount).fill(null);

  let hour = 0;
  // Start the pool at one full day of income — the user has presumably
  // been accumulating coins before they start planning.
  let pool = dailyIncome;
  let currentDailyIncome = dailyIncome;

  /**
   * Sweeps slots whose research has completed by `hour` and frees them.
   * If the completed lab is an eECON, applies the prorated income boost.
   */
  function freeFinishedSlots(): void {
    for (let i = 0; i < slotCount; i++) {
      if (slotLabKey[i] && slotFreeAt[i] <= hour) {
        // eECON labs grant a percentage daily-income boost based on the
        // duration they ran for. Other categories don't affect income.
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

  /**
   * Picks the best lab we can afford up to `budget`.
   * "Best" = highest gainPerDay; ties broken by shorter duration.
   * Skips labs that are currently running (slot conflict) or whose queue
   * is exhausted.
   */
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

  /**
   * Returns the cheapest lab we *could* run (ignoring affordability).
   * Used both for budget reservation (so we don't blow our pool on slot 0
   * and starve slots 1 and 2) and as the time-advancement target when no
   * slot is currently running.
   */
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

  // Main loop. The cap of 5000 iterations is a safety net for malformed
  // input that could otherwise loop forever; real plans converge in
  // hundreds of iterations.
  for (let iter = 0; iter < 5000; iter++) {
    // Termination: every slot has been filled past the planning horizon.
    if (slotFreeAt.every((t) => t >= minHours)) break;

    freeFinishedSlots();

    // Identify which slots are currently empty AND still need work.
    const freeSlotIds: number[] = [];
    for (let i = 0; i < slotCount; i++) {
      if (slotLabKey[i] === null && slotFreeAt[i] < minHours) {
        freeSlotIds.push(i);
      }
    }

    // Budget reservation: when there are ≥2 empty slots, we reserve at
    // least the cost of the cheapest-available lab × (slots-after-this-one)
    // so we don't blow the pool on a single greedy pick.
    const cheapest = freeSlotIds.length > 1 ? findCheapestAvailable() : null;
    const reserveCost = cheapest?.cost ?? 0;

    // Try to fill each empty slot in turn, decreasing the reservation as
    // we fill slots (since fewer slots remain after this assignment).
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
        // First step in a slot has no idle gap; subsequent steps measure
        // the gap from the previous step's completion (slotFreeAt[i]) to
        // the current `hour`.
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

    // If we placed at least one step this iteration, restart the loop —
    // there may be more empty slots we can fill at the same `hour`.
    if (assigned) continue;

    // Nothing was assigned. Advance time. Two cases:
    //   (a) Some slot is currently running — fast-forward to its finish
    //       so we can free it and try again. Coins accrue during the wait.
    let nextFinish = Infinity;
    for (let i = 0; i < slotCount; i++) {
      if (slotLabKey[i] && slotFreeAt[i] > hour) {
        nextFinish = Math.min(nextFinish, slotFreeAt[i]);
      }
    }

    if (nextFinish !== Infinity) {
      pool += currentDailyIncome * ((nextFinish - hour) / 24);
      hour = nextFinish;
    } else {
      // (b) Nothing is running and we couldn't afford anything. Wait
      // exactly long enough to afford the cheapest available lab.
      const cheapest = findCheapestAvailable();
      if (!cheapest) break; // no labs left at all
      const needed = cheapest.cost - pool;
      if (needed <= 0) continue; // shouldn't happen, but be safe
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
