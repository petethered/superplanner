// =============================================================================
// GanttChart.tsx — visual timeline of the simulator output.
//
// Layout (top to bottom):
//   - Header strip with "TIMELINE" label + total day count
//   - Day-marker labels ("D0", "D1", ...) above the lanes
//   - N swim lanes (S1..SN), one per slot, with:
//       - dashed amber blocks for idle gaps ("saving Nh")
//       - solid color-tinted blocks per scheduled lab, labeled "<lab> L<n>"
//
// Lane count is taken from `results.length` so the chart scales with
// the SLOTS dropdown in Planner (1–5). All lane-related layout math
// (chart height, gutter labels) derives from that single source.
//
// Coordinate model: lane X positions are computed as a percentage of
// totalHours. The wrapping container has a min-width so very short plans
// (< ~6 days) still get readable labels. The CSS-only tooltip on each lab
// block uses a `data-tooltip` attribute styled by `.gantt-block` in
// index.css.
//
// Per-lane vertical sizes are constants (LANE_HEIGHT, LANE_GAP,
// HEADER_HEIGHT, TOOLTIP_SPACE) to keep absolute positioning math
// straightforward. TOOLTIP_SPACE reserves room above the day labels for
// the floating tooltip to expand into without being clipped. The total
// CHART_HEIGHT is computed from those constants × the actual lane count.
// =============================================================================

import type { SlotPlan } from "../lib/types";

interface GanttChartProps {
  /** The SlotPlans from the simulator — one per concurrent research
   *  slot. Length is whatever the user picked in the SLOTS dropdown
   *  (1–5; defaults to game-canonical 3). Empty `steps` arrays render
   *  as empty lanes (background only). */
  results: SlotPlan[];
  /** Lab → palette color map from `buildLabColorMap`. Lookups falling
   *  through return a slate placeholder. */
  labColors: Record<string, string>;
}

/** Compact "Xd Yh" formatter — duplicated here from Planner.tsx so this
 *  component can be moved/dropped without dragging Planner along. */
function formatHours(h: number): string {
  const days = Math.floor(h / 24);
  const hrs = Math.floor(h % 24);
  if (days > 0) return `${days}d ${hrs}h`;
  return `${hrs}h`;
}

/** SI-suffix cost formatter — mirrored from Planner.tsx for the same
 *  decoupling reason. Keep these two formatters identical. */
function formatCost(cost: number): string {
  if (cost >= 1e18) return `${(cost / 1e18).toFixed(2)} Q`;
  if (cost >= 1e15) return `${(cost / 1e15).toFixed(2)} q`;
  if (cost >= 1e12) return `${(cost / 1e12).toFixed(2)} T`;
  if (cost >= 1e9) return `${(cost / 1e9).toFixed(2)} B`;
  if (cost >= 1e6) return `${(cost / 1e6).toFixed(2)} M`;
  return cost.toFixed(0);
}

export function GanttChart({ results, labColors }: GanttChartProps) {
  // Find the latest end time across all slots; this anchors the X-axis.
  let maxHour = 0;
  for (const slot of results) {
    for (const step of slot.steps) {
      const end = step.startHour + step.labStep.durationHours;
      if (end > maxHour) maxHour = end;
    }
  }

  // No work scheduled — render nothing (parent shows a "no labs" message).
  if (maxHour === 0) return null;

  // Round up to a clean day boundary so D-marker labels line up nicely.
  const totalDays = Math.ceil(maxHour / 24);
  const totalHours = totalDays * 24;
  const dayMarkers = Array.from({ length: totalDays + 1 }, (_, i) => i);

  // Per-lane layout constants. CHART_HEIGHT is derived from these PLUS
  // the actual lane count (`results.length`) so the chart grows or
  // shrinks with the user's SLOTS selection. With slotCount=1 the chart
  // collapses to ~92px; with slotCount=5 it expands to ~228px. Lane
  // height itself stays fixed — same visual density per lane regardless
  // of how many lanes there are.
  const LANE_HEIGHT = 32;
  const LANE_GAP = 6;
  const HEADER_HEIGHT = 16;
  const TOOLTIP_SPACE = 28;
  const slotCount = results.length;
  const CHART_HEIGHT =
    TOOLTIP_SPACE +
    HEADER_HEIGHT +
    slotCount * LANE_HEIGHT +
    Math.max(0, slotCount - 1) * LANE_GAP;

  return (
    <div className="mt-4 bg-slate-800/30 rounded border border-slate-700/30">
      {/* Header strip with total span */}
      <div className="px-3 py-2 border-b border-slate-700/30">
        <span className="font-display text-[10px] font-bold tracking-[0.15em] text-cyan-400">
          TIMELINE
        </span>
        <span className="text-[10px] text-slate-600 font-mono-data ml-3">
          {totalDays} days
        </span>
      </div>
      {/* overflow-x: auto lets long plans scroll horizontally; overflow-y
          stays visible so the tooltip can render outside the chart. */}
      <div className="p-3" style={{ overflowX: "auto", overflowY: "visible" }}>
        <div className="flex">
          {/* Left gutter: slot labels (S1..SN). Generated from
              `results.length` so the gutter always matches the lane
              count; same vertical math as the swim lanes so they line
              up exactly. */}
          <div
            className="shrink-0 flex flex-col"
            style={{ width: "32px" }}
          >
            <div style={{ height: `${TOOLTIP_SPACE + HEADER_HEIGHT}px` }} />
            {results.map((_, i) => (
              <div
                key={i}
                className="flex items-center"
                style={{
                  height: `${LANE_HEIGHT}px`,
                  // First lane has no top margin; subsequent lanes get
                  // LANE_GAP to separate them visually.
                  marginTop: i > 0 ? `${LANE_GAP}px` : 0,
                }}
              >
                <span className="font-display text-[9px] font-bold tracking-wider text-cyan-500/60">
                  S{i + 1}
                </span>
              </div>
            ))}
          </div>

          {/* Main timeline area. min-width forces a sane size for short
              plans; longer plans stretch the container and trigger the
              parent's overflow-x scroll. */}
          <div className="flex-1 min-w-0">
            <div
              className="relative"
              style={{
                minWidth: `${Math.max(500, totalDays * 80)}px`,
                height: `${CHART_HEIGHT}px`,
              }}
            >
              {/* Day markers: vertical guidelines + "DN" labels above. */}
              {dayMarkers.map((day) => {
                // Position as percentage of totalDays so resizing keeps
                // markers aligned with the lab blocks (same coordinate
                // basis).
                const left = `${(day / totalDays) * 100}%`;
                return (
                  <div key={day} className="absolute" style={{ left, top: `${TOOLTIP_SPACE}px`, bottom: 0 }}>
                    <div
                      className="text-[8px] text-slate-600 font-mono-data whitespace-nowrap"
                      // Center the label on the marker line.
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

              {/* Swim lanes (one per slot). Each lane renders, in z-order:
                    1. Lane background (slate stripe)
                    2. Idle-gap markers (dashed amber)
                    3. Lab blocks (color-coded, with tooltip)
              */}
              {results.map((slot, slotIdx) => {
                // Vertical position of this lane's top edge.
                const laneTop = TOOLTIP_SPACE + HEADER_HEIGHT + slotIdx * (LANE_HEIGHT + LANE_GAP);
                return (
                  <div key={slotIdx}>
                    {/* Lane background — full width, subtle slate tint. */}
                    <div
                      className="absolute left-0 right-0 rounded-sm bg-slate-800/20"
                      style={{ top: `${laneTop}px`, height: `${LANE_HEIGHT}px` }}
                    />

                    {/* Idle gaps. The 0.5h threshold suppresses noise
                        from sub-30min rounding artifacts. */}
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
                          {/* Hide the inline label on very narrow
                              gaps where it would be unreadable. */}
                          {width > 3 && (
                            <span className="text-[8px] text-amber-500/40 font-mono-data">
                              {formatHours(planned.idleHoursBefore)}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* Lab blocks. */}
                    {slot.steps.map((planned, j) => {
                      const left = (planned.startHour / totalHours) * 100;
                      // Clamp width to a minimum 0.3% so very short labs
                      // are still clickable / hoverable.
                      const width = Math.max(
                        (planned.labStep.durationHours / totalHours) * 100,
                        0.3,
                      );
                      const bg =
                        labColors[planned.labStep.lab] ||
                        "rgba(100, 116, 139, 0.3)"; // slate fallback when unmapped

                      // labColors uses 0.18 alpha for table backgrounds;
                      // boost to 0.35 here for stronger contrast on the
                      // small Gantt blocks.
                      const ganttBg = bg.replace(/[\d.]+\)$/, "0.35)");

                      return (
                        <div
                          key={`block-${j}`}
                          className="gantt-block absolute rounded-sm border border-white/10 flex items-center px-1 cursor-default transition-all hover:brightness-125 hover:border-white/25"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            top: `${laneTop}px`,
                            height: `${LANE_HEIGHT}px`,
                            backgroundColor: ganttBg,
                          }}
                          // Tooltip content. The CSS pseudo-element in
                          // index.css renders this as a floating bubble
                          // on hover via `[data-tooltip]::after`.
                          data-tooltip={`${planned.labStep.lab} lvl ${planned.labStep.level} • ${formatCost(planned.labStep.cost)} • ${planned.labStep.gainPerDay.toFixed(2)}%/d • ${formatHours(planned.labStep.durationHours)}`}
                        >
                          <span className="text-[9px] text-slate-200 font-mono-data truncate leading-none overflow-hidden">
                            {planned.labStep.lab}
                          </span>
                          <span className="text-[8px] text-slate-400 font-mono-data ml-1 shrink-0 leading-none overflow-hidden">
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
