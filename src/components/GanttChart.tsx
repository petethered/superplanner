import type { SlotPlan } from "../lib/types";

interface GanttChartProps {
  results: SlotPlan[];
  labColors: Record<string, string>;
}

function formatHours(h: number): string {
  const days = Math.floor(h / 24);
  const hrs = Math.floor(h % 24);
  if (days > 0) return `${days}d ${hrs}h`;
  return `${hrs}h`;
}

export function GanttChart({ results, labColors }: GanttChartProps) {
  // Calculate total time span
  let maxHour = 0;
  for (const slot of results) {
    for (const step of slot.steps) {
      const end = step.startHour + step.labStep.durationHours;
      if (end > maxHour) maxHour = end;
    }
  }

  if (maxHour === 0) return null;

  // Round up to nearest day for clean axis
  const totalDays = Math.ceil(maxHour / 24);
  const totalHours = totalDays * 24;
  const dayMarkers = Array.from({ length: totalDays + 1 }, (_, i) => i);

  const LANE_HEIGHT = 32;
  const LANE_GAP = 6;
  const HEADER_HEIGHT = 16;
  const CHART_HEIGHT = HEADER_HEIGHT + 3 * LANE_HEIGHT + 2 * LANE_GAP;

  return (
    <div className="mt-4 bg-slate-800/30 rounded border border-slate-700/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700/30">
        <span className="font-display text-[10px] font-bold tracking-[0.15em] text-cyan-400">
          TIMELINE
        </span>
        <span className="text-[10px] text-slate-600 font-mono-data ml-3">
          {totalDays} days
        </span>
      </div>
      <div className="p-3 overflow-x-auto">
        <div className="flex">
          {/* Slot labels */}
          <div
            className="shrink-0 flex flex-col"
            style={{ width: "32px" }}
          >
            <div style={{ height: `${HEADER_HEIGHT}px` }} />
            {[1, 2, 3].map((n, i) => (
              <div
                key={n}
                className="flex items-center"
                style={{
                  height: `${LANE_HEIGHT}px`,
                  marginTop: i > 0 ? `${LANE_GAP}px` : 0,
                }}
              >
                <span className="font-display text-[9px] font-bold tracking-wider text-cyan-500/60">
                  S{n}
                </span>
              </div>
            ))}
          </div>

          {/* Timeline area */}
          <div className="flex-1 min-w-0">
            <div
              className="relative"
              style={{
                minWidth: `${Math.max(500, totalDays * 80)}px`,
                height: `${CHART_HEIGHT}px`,
              }}
            >
              {/* Day marker lines */}
              {dayMarkers.map((day) => {
                const left = `${(day / totalDays) * 100}%`;
                return (
                  <div key={day} className="absolute" style={{ left, top: 0, bottom: 0 }}>
                    <div
                      className="text-[8px] text-slate-600 font-mono-data whitespace-nowrap"
                      style={{ transform: "translateX(-50%)" }}
                    >
                      D{day}
                    </div>
                    <div
                      className="absolute border-l border-slate-700/20"
                      style={{
                        top: `${HEADER_HEIGHT}px`,
                        bottom: 0,
                      }}
                    />
                  </div>
                );
              })}

              {/* Swim lanes */}
              {results.map((slot, slotIdx) => {
                const laneTop = HEADER_HEIGHT + slotIdx * (LANE_HEIGHT + LANE_GAP);
                return (
                  <div key={slotIdx}>
                    {/* Lane background */}
                    <div
                      className="absolute left-0 right-0 rounded-sm bg-slate-800/20"
                      style={{ top: `${laneTop}px`, height: `${LANE_HEIGHT}px` }}
                    />

                    {/* Idle gaps */}
                    {slot.steps.map((planned, j) => {
                      if (planned.idleHoursBefore <= 0.5) return null;
                      const idleStart = planned.startHour - planned.idleHoursBefore;
                      const left = (idleStart / totalHours) * 100;
                      const width = (planned.idleHoursBefore / totalHours) * 100;
                      return (
                        <div
                          key={`idle-${j}`}
                          className="absolute rounded-sm border border-dashed border-amber-500/20 flex items-center justify-center"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            top: `${laneTop}px`,
                            height: `${LANE_HEIGHT}px`,
                          }}
                          title={`Saving ${formatHours(planned.idleHoursBefore)}`}
                        >
                          {width > 3 && (
                            <span className="text-[8px] text-amber-500/40 font-mono-data">
                              {formatHours(planned.idleHoursBefore)}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* Lab blocks */}
                    {slot.steps.map((planned, j) => {
                      const left = (planned.startHour / totalHours) * 100;
                      const width = Math.max(
                        (planned.labStep.durationHours / totalHours) * 100,
                        0.3,
                      );
                      const bg =
                        labColors[planned.labStep.lab] ||
                        "rgba(100, 116, 139, 0.3)";

                      // Boost opacity for Gantt blocks
                      const ganttBg = bg.replace(/[\d.]+\)$/, "0.35)");

                      return (
                        <div
                          key={`block-${j}`}
                          className="absolute rounded-sm border border-white/10 overflow-hidden flex items-center px-1 cursor-default transition-all hover:brightness-125 hover:border-white/25"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            top: `${laneTop}px`,
                            height: `${LANE_HEIGHT}px`,
                            backgroundColor: ganttBg,
                          }}
                          title={[
                            `${planned.labStep.lab} lvl ${planned.labStep.level}`,
                            `${planned.labStep.gainPerDay.toFixed(2)}%/day`,
                            `Duration: ${formatHours(planned.labStep.durationHours)}`,
                            `Starts: Day ${(planned.startHour / 24).toFixed(1)}`,
                          ].join("\n")}
                        >
                          <span className="text-[9px] text-slate-200 font-mono-data truncate leading-none">
                            {planned.labStep.lab}
                          </span>
                          <span className="text-[8px] text-slate-400 font-mono-data ml-1 shrink-0 leading-none">
                            L{planned.labStep.level}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
