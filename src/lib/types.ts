// =============================================================================
// types.ts — shared TypeScript types used across the EffectivePathPlanner app.
//
// This is the single source of truth for data shapes. Keep this file thin —
// it should contain only types/interfaces with no runtime code, so that any
// module can import from here without pulling in side effects or large deps.
//
// Concept overview:
//   - The app fetches Google Sheets data via the public gviz endpoint and
//     reshapes it into `TableData` (header row + body rows of strings).
//   - `LabStep` is the parsed, typed form of a single row (one upgrade level
//     for one lab in one category). The planner simulator consumes LabSteps.
//   - `PlannerConfig` is the user's persisted planner settings (which
//     categories are enabled, daily income, planning horizon).
//   - `SimulationResult` describes the output of the simulator: 3 build slots,
//     each with an ordered list of `PlannedStep`s that include timing info.
// =============================================================================

/**
 * Raw response shape from Google Sheets' gviz/tq JSONP endpoint.
 *
 * The endpoint returns rows-of-cells where each cell can be `null` (sparse
 * sheets) or an object with `v` (raw value) and optional `f` (formatted/
 * display value). We always prefer `f` over `v` when present so the UI
 * shows "1,234.50" rather than "1234.5".
 */
export interface SheetResponse {
  version: string;
  reqId: string;
  status: string;
  table: {
    cols: Array<{ id: string; label: string; type: string }>;
    rows: Array<{ c: Array<{ v: unknown; f?: string } | null> }>;
  };
}

/**
 * Generic 2D table shape after extraction from a SheetResponse.
 *
 * `headers` is hardcoded by `extractTableData` (LAB / LEVEL / COST / DURATION
 * / % GAIN) — we don't trust the spreadsheet's own headers because the source
 * sheets aren't always consistent across tabs.
 */
export interface TableData {
  headers: string[];
  rows: string[][];
}

/**
 * One sheet's cached payload. `timestamp` lets the UI compute "last synced X
 * minutes ago" without a separate timestamp store, though in practice the
 * top-level `sp_last_sync` key is what the footer reads.
 */
export interface CachedSheet {
  timestamp: number;
  data: TableData;
}

/**
 * The two Google Sheets URLs the user supplies. Either can be empty (but at
 * least one is required to render the planner). Stored under `sp_urls`.
 */
export interface SheetUrls {
  effectivePaths: string;
  modules: string;
}

/**
 * One row of an Effective Paths table after parsing strings into numbers.
 *
 * - `type`        — category label as the user sees it ("eHP", "regen",
 *                   "eDAMAGE", "eECON", "SHARD PATH"). NOTE: these are
 *                   **storage keys** for `enabledTypes`. Display labels are
 *                   mapped via TYPE_DISPLAY in Planner.tsx.
 * - `lab`         — lab name, e.g. "Recovery Package"
 * - `level`       — integer upgrade level
 * - `cost`        — coin cost as a number (suffixes like "1.12 q" expanded
 *                   to 1.12e15 by parseCost)
 * - `durationHours` — research duration as a fractional hour count
 * - `gainPerDay`  — % stat gain per day, used both as the simulator's
 *                   ranking key and to update daily income for eECON labs
 */
export interface LabStep {
  type: string;
  lab: string;
  level: number;
  cost: number;
  durationHours: number;
  gainPerDay: number;
}

/**
 * User-controlled planner settings, persisted to localStorage under
 * `sp_planner_config`. Fields:
 *
 * - `enabledTypes`        — which category strings are currently checked
 *                           (subset of ALL_TYPES in Planner.tsx)
 * - `dailyIncome`         — fully expanded number used by the simulator
 * - `dailyIncomeSuffix`   — UI-only: which suffix is selected (M/B/T/q/Q)
 * - `dailyIncomeValue`    — UI-only: the numeric input (before suffix)
 *                           dailyIncome = dailyIncomeValue * suffixMultiplier
 * - `minDays`             — planning horizon; the simulator fills slots until
 *                           every slot has at least this many days scheduled
 * - `slotCount`           — number of concurrent research slots to simulate.
 *                           Valid range 1–5 (UI-enforced via the SLOTS
 *                           dropdown). Game canon is 3, which is the default
 *                           applied by `loadConfig` and by `runSimulation`'s
 *                           default parameter. Stored configs from before
 *                           this field existed are migrated to `3` on read
 *                           via spread-defaults in `loadConfig`.
 */
export interface PlannerConfig {
  enabledTypes: string[];
  dailyIncome: number;
  dailyIncomeSuffix: string;
  dailyIncomeValue: number;
  minDays: number;
  slotCount: number;
}

/**
 * One scheduled lab in a slot, produced by `runSimulation`.
 *
 * - `startHour`        — hour offset from t=0 when this lab begins research
 * - `poolAtStart`      — coin pool size at `startHour`. Useful for debugging
 *                        and for the UI to display "we had X coins available"
 * - `idleHoursBefore`  — gap (in hours) between the previous step finishing
 *                        and this step starting. Drawn as an amber dashed
 *                        block in the Gantt chart and as "saving Xh" in the
 *                        slot list when > 0.5h.
 */
export interface PlannedStep {
  labStep: LabStep;
  startHour: number;
  poolAtStart: number;
  idleHoursBefore: number;
}

/**
 * One of the 3 research slots ("S1"/"S2"/"S3") with its ordered list of
 * planned steps. The game has 3 concurrent research slots, so the simulator
 * always returns exactly 3 entries — some may have empty `steps`.
 */
export interface SlotPlan {
  steps: PlannedStep[];
}

/**
 * Output of `runSimulation`.
 *
 * - `slots`             — exactly 3 SlotPlans
 * - `finalDailyIncome`  — the projected daily income at the end of the plan
 *                         (starts at config.dailyIncome and grows when eECON
 *                         labs complete; non-eECON labs do not affect this)
 */
export interface SimulationResult {
  slots: SlotPlan[];
  finalDailyIncome: number;
}
