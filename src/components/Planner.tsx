import { useState, useMemo } from "react";
import { Calculator } from "lucide-react";
import { parseLabSteps, runSimulation } from "../lib/planner";
import { buildLabColorMap } from "../lib/colors";
import { GanttChart } from "./GanttChart";
import type { TableData, PlannerConfig, SimulationResult } from "../lib/types";

const ALL_TYPES = ["eHP", "regen", "eDAMAGE", "eECON", "SHARD PATH"];

const TYPE_TO_SHEET_KEY: Record<string, string> = {
  eHP: "eHP",
  regen: "regen",
  eDAMAGE: "eDamage",
  eECON: "eEcon",
  "SHARD PATH": "shardPath",
};

const SUFFIX_MULTIPLIERS: Record<string, number> = {
  T: 1e12,
  q: 1e15,
  Q: 1e18,
};

function loadConfig(): PlannerConfig {
  try {
    const raw = localStorage.getItem("sp_planner_config");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    enabledTypes: [...ALL_TYPES],
    dailyIncome: 1e15,
    dailyIncomeSuffix: "q",
    dailyIncomeValue: 1,
    minDays: 14,
  };
}

function saveConfig(config: PlannerConfig): void {
  localStorage.setItem("sp_planner_config", JSON.stringify(config));
}

function formatHours(h: number): string {
  const days = Math.floor(h / 24);
  const hrs = Math.floor(h % 24);
  if (days > 0) return `${days}d ${hrs}h`;
  return `${hrs}h`;
}

function formatDuration(h: number): string {
  const days = Math.floor(h / 24);
  const hrs = Math.floor(h % 24);
  const mins = Math.round((h % 1) * 60);
  return `${days}d ${hrs}h ${mins}m`;
}

function formatCost(cost: number): string {
  if (cost >= 1e18) return `${(cost / 1e18).toFixed(2)} Q`;
  if (cost >= 1e15) return `${(cost / 1e15).toFixed(2)} q`;
  if (cost >= 1e12) return `${(cost / 1e12).toFixed(2)} T`;
  if (cost >= 1e9) return `${(cost / 1e9).toFixed(2)} B`;
  return cost.toFixed(0);
}

interface PlanSummary {
  totalCost: number;
  gainByType: Record<string, number>;
}

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
  sheets: Record<string, TableData>;
}

export function Planner({ sheets }: PlannerProps) {
  const [config, setConfig] = useState<PlannerConfig>(loadConfig);
  const [results, setResults] = useState<SimulationResult | null>(null);
  const labColors = useMemo(() => buildLabColorMap(sheets), [sheets]);

  function updateConfig(patch: Partial<PlannerConfig>) {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveConfig(next);
      return next;
    });
  }

  function toggleType(type: string) {
    const enabled = config.enabledTypes.includes(type)
      ? config.enabledTypes.filter((t) => t !== type)
      : [...config.enabledTypes, type];
    updateConfig({ enabledTypes: enabled });
  }

  function handleIncomeChange(value: number, suffix: string) {
    updateConfig({
      dailyIncomeValue: value,
      dailyIncomeSuffix: suffix,
      dailyIncome: value * (SUFFIX_MULTIPLIERS[suffix] || 1),
    });
  }

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

      {/* Config bar */}
      <div className="px-4 py-3 border-b border-slate-800/50 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
              <span className="text-slate-400 font-mono-data">{type}</span>
            </label>
          ))}
        </div>

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
            <option value="T">T</option>
            <option value="q">q</option>
            <option value="Q">Q</option>
          </select>
        </div>

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

      {/* Results */}
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
          results.length > 0 &&
          results.slots.every((s) => s.steps.length === 0) && (
            <p className="text-center text-amber-400 text-xs font-mono-data py-8">
              No affordable labs with current income. Try increasing daily
              income.
            </p>
          )}

        {results && results.slots.some((s) => s.steps.length > 0) && (
          <>
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
                      const bg = labColors[planned.labStep.lab];
                      return (
                        <div key={j}>
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
          <GanttChart results={results.slots} labColors={labColors} />
          </>
        )}
      </div>
    </div>
  );
}
