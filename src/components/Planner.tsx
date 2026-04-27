// =============================================================================
// Planner.tsx — the planner UI: category checkboxes, daily-income input,
// planning horizon selector, "Calculate" button, and the rendered results
// (3 slot lists, summary card, Gantt chart).
//
// Storage / display key model (IMPORTANT, easy to confuse):
//
//   `ALL_TYPES` are the **stable storage keys** used in `enabledTypes`
//   inside localStorage (`sp_planner_config`). They MUST NOT change without
//   a migration step — existing users would lose their checkbox state.
//   The values include legacy stylized strings like "eDAMAGE" and
//   "SHARD PATH".
//
//   `TYPE_DISPLAY` maps storage keys → human display labels for the
//   checkbox spans. Only entries that need transformation appear here
//   (e.g. "regen" → "Regen", "SHARD PATH" → "Shard Path"); other types
//   render as-is via `TYPE_DISPLAY[type] ?? type`.
//
//   `TYPE_TO_SHEET_KEY` maps the storage key → the cache/sheet key used
//   in the `sheets` prop (which uses camelCase keys: eHP, regen, eDamage,
//   eEcon, shardPath). Used during `handleCalculate` to look up the right
//   TableData for each enabled type.
//
// Storage / display tables in TableGrid.tsx use a different but compatible
// scheme — see that file for its own legend.
//
// Persistence:
//   - Read on mount via `loadConfig` (lazy useState initializer).
//   - Written on every `updateConfig` call.
//   - Key: `sp_planner_config` (legacy "sp_" prefix; do not rename).
//
// Simulation runs synchronously in `handleCalculate` — the simulator caps
// itself at 5000 iterations and typically completes in single-digit ms.
// Results are stored in component state (not persisted) because they're
// derived from config + sheet data and trivially recomputed.
// =============================================================================

import { useState, useMemo } from "react";
import { Calculator } from "lucide-react";
import { parseLabSteps, runSimulation } from "../lib/planner";
import { buildLabColorMap } from "../lib/colors";
import { GanttChart } from "./GanttChart";
import type { TableData, PlannerConfig, SimulationResult, SlotPlan } from "../lib/types";

// Stable storage keys — see file-level comment. Reordering is fine; renaming
// any string here is a breaking change for existing users' localStorage.
const ALL_TYPES = ["eHP", "regen", "eDAMAGE", "eECON", "SHARD PATH"];

// Display overrides for storage keys that need humanizing. Anything not in
// this map renders as its raw key (eHP, eDAMAGE, eECON pass through).
const TYPE_DISPLAY: Record<string, string> = {
  regen: "Regen",
  "SHARD PATH": "Shard Path",
};

// Maps storage keys → the cache/sheet key in App.tsx's `sheets` prop.
// Note camelCase mismatches: storage key "eDAMAGE" / "eECON" / "SHARD PATH"
// vs. cache key "eDamage" / "eEcon" / "shardPath".
const TYPE_TO_SHEET_KEY: Record<string, string> = {
  eHP: "eHP",
  regen: "regen",
  eDAMAGE: "eDamage",
  eECON: "eEcon",
  "SHARD PATH": "shardPath",
};

// SI-style suffix multipliers for the income input. Same set as
// `COST_SUFFIXES` in lib/planner.ts but kept local so this file can be
// understood standalone.
const SUFFIX_MULTIPLIERS: Record<string, number> = {
  M: 1e6,
  B: 1e9,
  T: 1e12,
  q: 1e15,
  Q: 1e18,
};

/**
 * Reads persisted planner config from localStorage. Returns sensible
 * defaults when nothing is stored yet (all types enabled, 1q/day income,
 * 14-day horizon). The try/catch guards against malformed JSON without
 * crashing — defaults are returned in that case.
 */
function loadConfig(): PlannerConfig {
  try {
    const raw = localStorage.getItem("sp_planner_config");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore — fall through to defaults */
  }
  return {
    enabledTypes: [...ALL_TYPES],
    dailyIncome: 1e15,
    dailyIncomeSuffix: "q",
    dailyIncomeValue: 1,
    minDays: 14,
  };
}

/** Persists config under `sp_planner_config`. Called from `updateConfig`
 *  after every state mutation so the UI is always in sync with storage. */
function saveConfig(config: PlannerConfig): void {
  localStorage.setItem("sp_planner_config", JSON.stringify(config));
}

/**
 * Compact "Xd Yh" formatter for slot durations.
 * Drops the day prefix when 0 days — used in the slot total label.
 */
function formatHours(h: number): string {
  const days = Math.floor(h / 24);
  const hrs = Math.floor(h % 24);
  if (days > 0) return `${days}d ${hrs}h`;
  return `${hrs}h`;
}

/** Verbose "Xd Yh Zm" formatter for the slot total (always shows all three
 *  components even when zero — kept distinct from `formatHours` because the
 *  callers want different visuals). */
function formatDuration(h: number): string {
  const days = Math.floor(h / 24);
  const hrs = Math.floor(h % 24);
  const mins = Math.round((h % 1) * 60);
  return `${days}d ${hrs}h ${mins}m`;
}

/**
 * Compact cost formatter using the same SI suffixes as `parseCost`.
 * Picks the largest applicable suffix and shows two decimal places. For
 * sub-million costs returns the integer count.
 */
function formatCost(cost: number): string {
  if (cost >= 1e18) return `${(cost / 1e18).toFixed(2)} Q`;
  if (cost >= 1e15) return `${(cost / 1e15).toFixed(2)} q`;
  if (cost >= 1e12) return `${(cost / 1e12).toFixed(2)} T`;
  if (cost >= 1e9) return `${(cost / 1e9).toFixed(2)} B`;
  if (cost >= 1e6) return `${(cost / 1e6).toFixed(2)} M`;
  return cost.toFixed(0);
}

/** Aggregated totals shown in the SUMMARY card. */
interface PlanSummary {
  totalCost: number;
  /** Per-category cumulative gain (e.g. {"eHP": 32.4, "eECON": 18.1}). */
  gainByType: Record<string, number>;
}

/**
 * Walks all planned steps across all 3 slots and computes the SUMMARY
 * card's totals. Cost is the sum of `labStep.cost`. Gain per type is
 * computed prorated: `(gainPerDay/24) * durationHours` per step, summed by
 * type. This matches the formula used by the simulator's eECON income
 * boost — see runSimulation#freeFinishedSlots.
 */
function computeSummary(results: SlotPlan[]): PlanSummary {
  let totalCost = 0;
  const gainByType: Record<string, number> = {};

  for (const slot of results) {
    for (const planned of slot.steps) {
      const { labStep } = planned;
      totalCost += labStep.cost;
      // gain = (% per day / 24) * durationHours
      const gain = (labStep.gainPerDay / 24) * labStep.durationHours;
      gainByType[labStep.type] = (gainByType[labStep.type] || 0) + gain;
    }
  }

  return { totalCost, gainByType };
}

interface PlannerProps {
  /** Map of cache/sheet key → TableData. Provided by App.tsx after
   *  `loadFromCache`/`fetchAndCacheAll`. */
  sheets: Record<string, TableData>;
}

export function Planner({ sheets }: PlannerProps) {
  // `loadConfig` runs once on mount via the lazy initializer form.
  const [config, setConfig] = useState<PlannerConfig>(loadConfig);
  // Simulation result is null until the user clicks Calculate.
  const [results, setResults] = useState<SimulationResult | null>(null);
  // Memoize lab→color so we don't rebuild the map on every keystroke.
  const labColors = useMemo(() => buildLabColorMap(sheets), [sheets]);

  /** Single mutation point for config — patches state and persists in
   *  one go so storage is always consistent. */
  function updateConfig(patch: Partial<PlannerConfig>) {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveConfig(next);
      return next;
    });
  }

  /** Toggles one category in `enabledTypes`. */
  function toggleType(type: string) {
    const enabled = config.enabledTypes.includes(type)
      ? config.enabledTypes.filter((t) => t !== type)
      : [...config.enabledTypes, type];
    updateConfig({ enabledTypes: enabled });
  }

  /** Updates both the displayed value/suffix AND the fully expanded
   *  `dailyIncome` number used by the simulator. They must stay in sync. */
  function handleIncomeChange(value: number, suffix: string) {
    updateConfig({
      dailyIncomeValue: value,
      dailyIncomeSuffix: suffix,
      dailyIncome: value * (SUFFIX_MULTIPLIERS[suffix] || 1),
    });
  }

  /**
   * Runs the simulator. Walks `enabledTypes`, looks up each one's TableData
   * via TYPE_TO_SHEET_KEY, parses to LabStep[], then concatenates and
   * passes the whole pile to `runSimulation`.
   *
   * If no enabled type has data (or no types are enabled), we still set
   * an empty result so the UI moves out of its "click Calculate" state
   * and into a clear "no labs available" message.
   */
  function handleCalculate() {
    const allSteps = config.enabledTypes.flatMap((type) => {
      const key = TYPE_TO_SHEET_KEY[type];
      const data = key ? sheets[key] : null;
      return data ? parseLabSteps(type, data) : [];
    });

    if (allSteps.length === 0) {
      setResults({ slots: [], finalDailyIncome: config.dailyIncome });
      return;
    }

    const result = runSimulation(allSteps, config.dailyIncome, config.minDays);
    setResults(result);
  }

  const noTypesSelected = config.enabledTypes.length === 0;
  const noIncome = !config.dailyIncomeValue || config.dailyIncomeValue <= 0;

  return (
    <div className="bg-slate-900/80 rounded-lg border border-slate-700/40 overflow-hidden card-shimmer animate-fade-up">
      <div className="px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/40">
        <h2 className="font-display text-xs font-bold tracking-[0.15em] text-cyan-300">
          PLANNER
        </h2>
      </div>

      {/* Config bar: category toggles + income + horizon + calculate */}
      <div className="px-4 py-3 border-b border-slate-800/50 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {/* One checkbox per ALL_TYPES entry. The `type` value is the
              storage key; the visible label runs through TYPE_DISPLAY for
              humanization. */}
          {ALL_TYPES.map((type) => (
            <label
              key={type}
              className="flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                checked={config.enabledTypes.includes(type)}
                onChange={() => toggleType(type)}
                className="accent-cyan-500"
              />
              <span className="text-slate-400 font-mono-data">{TYPE_DISPLAY[type] ?? type}</span>
            </label>
          ))}
        </div>

        {/* Daily income: numeric input + suffix dropdown. They stay in
            sync via `handleIncomeChange`. */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono-data">INCOME/DAY:</span>
          <input
            type="number"
            value={config.dailyIncomeValue || ""}
            onChange={(e) =>
              handleIncomeChange(
                parseFloat(e.target.value) || 0,
                config.dailyIncomeSuffix,
              )
            }
            className="w-20 px-2 py-1 bg-slate-800/70 border border-slate-700 rounded text-xs text-slate-200 font-mono-data focus:outline-none focus:border-cyan-500 transition-colors"
            min={0}
            step="any"
          />
          <select
            value={config.dailyIncomeSuffix}
            onChange={(e) =>
              handleIncomeChange(config.dailyIncomeValue, e.target.value)
            }
            className="px-2 py-1 bg-slate-800/70 border border-slate-700 rounded text-xs text-slate-400 font-mono-data focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
          >
            <option value="M">M</option>
            <option value="B">B</option>
            <option value="T">T</option>
            <option value="q">q</option>
            <option value="Q">Q</option>
          </select>
        </div>

        {/* Planning horizon (minDays). Discrete options; the simulator
            keeps filling slots until each one has at least this much
            scheduled. */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono-data">DAYS:</span>
          <select
            value={config.minDays}
            onChange={(e) => updateConfig({ minDays: Number(e.target.value) })}
            className="px-2 py-1 bg-slate-800/70 border border-slate-700 rounded text-xs text-slate-400 font-mono-data focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCalculate}
          disabled={noTypesSelected || noIncome}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold tracking-wider uppercase rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/20"
        >
          <Calculator className="w-3.5 h-3.5" />
          Calculate
        </button>
      </div>

      {/* Results pane. Three render states:
            (a) no result yet     — instructional placeholder
            (b) empty result       — "no labs available" hint
            (c) all-empty slots    — "no affordable labs" hint
            (d) populated result   — slot lists + summary + Gantt
      */}
      <div className="p-4">
        {!results && (
          <p className="text-center text-slate-600 text-xs font-mono-data py-8">
            Configure your settings and click Calculate to generate a plan.
          </p>
        )}

        {results && results.slots.length === 0 && (
          <p className="text-center text-amber-400 text-xs font-mono-data py-8">
            No labs available. Check your category selections.
          </p>
        )}

        {results &&
          results.slots.length > 0 &&
          results.slots.every((s) => s.steps.length === 0) && (
            <p className="text-center text-amber-400 text-xs font-mono-data py-8">
              No affordable labs with current income. Try increasing daily
              income.
            </p>
          )}

        {results && results.slots.some((s) => s.steps.length > 0) && (
          <>
          {/* Per-slot lists. Each slot shows ordered planned steps with
              cost, duration, and %/day, color-coded by lab. Idle gaps
              ("saving Xh") appear when the simulator chose to wait for
              budget. */}
          <div className="flex flex-wrap gap-4">
            {results.slots.map((slot, i) => (
              <div
                key={i}
                className="flex-1 min-w-[200px] bg-slate-800/30 rounded border border-slate-700/30"
              >
                <div className="px-3 py-2 border-b border-slate-700/30 flex items-center gap-2">
                  <span className="font-display text-[10px] font-bold tracking-[0.15em] text-cyan-400">
                    SLOT {i + 1}
                  </span>
                  {slot.steps.length > 0 && (
                    <span className="text-[10px] text-slate-500 font-mono-data">
                      {/* Total slot duration: sum of step durations + idle gaps */}
                      ({formatDuration(slot.steps.reduce((sum, s) => sum + s.labStep.durationHours + s.idleHoursBefore, 0))})
                    </span>
                  )}
                </div>
                {slot.steps.length === 0 ? (
                  <p className="text-center text-slate-600 text-xs py-4 font-mono-data">
                    No assignments
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800/50">
                    {slot.steps.map((planned, j) => {
                      // Background tint comes from the lab→color map.
                      // Undefined means the lab wasn't in any sheet (rare
                      // edge case); just leave the row uncolored.
                      const bg = labColors[planned.labStep.lab];
                      return (
                        <div key={j}>
                          {/* Idle gap indicator. The 0.5h threshold avoids
                              showing "saving 0h" for trivial sub-30min
                              gaps from rounding. */}
                          {planned.idleHoursBefore > 0.5 && (
                            <div className="px-3 py-1 text-center">
                              <span className="text-[10px] text-amber-500/60 font-mono-data">
                                saving {formatHours(planned.idleHoursBefore)}
                              </span>
                            </div>
                          )}
                          <div
                            className="px-3 py-1.5 grid grid-cols-[16px_1fr_auto_auto_auto] gap-x-2 items-center"
                            style={bg ? { backgroundColor: bg } : undefined}
                          >
                            <span className="text-[10px] text-slate-600 font-mono-data">
                              {j + 1}.
                            </span>
                            <span className="text-xs text-slate-300 font-mono-data truncate">
                              {planned.labStep.lab} L{planned.labStep.level}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono-data">
                              {formatCost(planned.labStep.cost)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono-data">
                              {formatHours(planned.labStep.durationHours)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono-data">
                              {planned.labStep.gainPerDay.toFixed(2)}%/d
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* SUMMARY card. IIFE keeps the `summary` calculation co-located
              with its only consumer; useMemo is overkill here because the
              parent already only re-renders when `results` changes. */}
          {(() => {
            const summary = computeSummary(results.slots);
            return (
              <div className="mt-4 bg-slate-800/30 rounded border border-slate-700/30 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-700/30">
                  <span className="font-display text-[10px] font-bold tracking-[0.15em] text-cyan-400">
                    SUMMARY
                  </span>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-x-8 gap-y-2">
                  <div>
                    <div className="text-[10px] text-slate-500 font-mono-data uppercase tracking-wider mb-1">Total Spend</div>
                    <div className="text-sm text-slate-200 font-mono-data">{formatCost(summary.totalCost)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-mono-data uppercase tracking-wider mb-1">Income/Day</div>
                    <div className="text-sm text-slate-200 font-mono-data">
                      {/* Starting income → ending income. Only eECON labs
                          move this number; other categories will show
                          identical start/end values. */}
                      {formatCost(config.dailyIncome)}
                      <span className="text-slate-500 mx-1">&rarr;</span>
                      <span className="text-emerald-400">{formatCost(results.finalDailyIncome)}</span>
                    </div>
                  </div>
                  {Object.entries(summary.gainByType).map(([type, gain]) => (
                    <div key={type}>
                      <div className="text-[10px] text-slate-500 font-mono-data uppercase tracking-wider mb-1">{type}</div>
                      <div className="text-sm text-cyan-300 font-mono-data">{gain.toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {/* Visual timeline. Renders all 3 slots as horizontal swim lanes
              spanning the full plan duration, with color-coded lab blocks
              and dashed amber blocks for idle gaps. */}
          <GanttChart results={results.slots} labColors={labColors} />
          </>
        )}
      </div>
    </div>
  );
}
