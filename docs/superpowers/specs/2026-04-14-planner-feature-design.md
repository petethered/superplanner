# Lab Planner Feature Design

## Goal

Add a planning feature to SuperPlanner that computes the optimal sequence of lab upgrades across 3 simultaneous slots, maximizing % gain per day while respecting a daily coin income budget.

## Context

The app already displays lab data from 4 Google Sheets tabs (eHP, eDAMAGE, eECON, SHARD PATH). A 5th data source, **regen**, comes from the same eHP sheet but uses columns AB-AF (indices 27-31) instead of F-J. Each table has rows with columns: LAB, LEVEL, COST, DURATION, % GAIN. The planner reads this existing data and runs a scheduling simulation.

## Data Model

### LabStep

Each row from the data tables is parsed into a structured object:

```ts
interface LabStep {
  type: string;          // "eHP" | "eDAMAGE" | "eECON" | "SHARD PATH" | "regen"
  lab: string;           // e.g. "Recovery Package Chance Mastery"
  level: number;         // e.g. 1
  cost: number;          // raw number, parsed from display string
  durationHours: number; // decimal hours, parsed from display string
  gainPerDay: number;    // already a daily rate from the sheet
}
```

### Parsing

**Cost strings** use game notation with suffixes:
- `B` = 1e9 (billion)
- `T` = 1e12 (trillion)
- `q` = 1e15 (quadrillion)
- `Q` = 1e18 (quintillion)

Examples: `"944.9 T"` → `944.9e12`, `"1.12 q"` → `1.12e15`

**Duration strings** use day/hour/minute format:

Examples: `"2d 15h 14m"` → `63.233` hours, `"0d 18h 9m"` → `18.15` hours

**% GAIN strings**: strip `%` and all whitespace (spaces are cosmetic thousands separators in the decimal portion), then parse as float.

Examples: `"16.455 638%"` → strip to `"16.455638"` → `16.455638`, `"0.174 697%"` → `0.174697`

### PlannerConfig

```ts
interface PlannerConfig {
  enabledTypes: string[];     // subset of ["eHP", "regen", "eDAMAGE", "eECON", "SHARD PATH"]
  dailyIncome: number;        // raw number
  dailyIncomeSuffix: string;  // "T" | "q" | "Q" for display
  dailyIncomeValue: number;   // display value (e.g. 1.5)
}
```

Persisted to localStorage under key `sp_planner_config`.

### Lab Ordering Constraint

Labs within the same name must be completed in level order. The planner tracks which level is "next" for each lab name. At the start, all labs begin at their first level (row 1 of each lab in the table data).

## Scheduling Algorithm

### Overview

A time-stepping simulation that fills 3 slots with 10 lab assignments each, respecting budget and ordering constraints.

### Initial State

- `pool = dailyIncome` (start with 1 full day of income)
- `slots = [empty, empty, empty]`
- All lab steps from enabled categories are available
- Each lab name tracks its next available level (starts at first)

### Simulation Loop

The simulation advances through discrete time events (slot completions and income accrual):

1. **Accrue income**: `pool += dailyIncome * (hoursSinceLastTick / 24)`

2. **Collect finished slots**: Any slot whose current lab has completed.

3. **For each open slot** (in order), find the best available lab step:
   - Category must be enabled (checkbox on)
   - Must be the next level in sequence for that lab name
   - That lab name must not be currently running in another slot
   - Cost must be ≤ current pool

4. **Assignment priority**:
   - Pick the highest `gainPerDay` lab that is affordable
   - If the best lab is too expensive, **backfill** with the highest-gain lab that IS affordable (keeps the slot active)
   - If nothing is affordable, the slot stays idle and the pool accumulates

5. **On assignment**: Deduct cost from pool, mark the lab level as consumed, advance that lab's next level pointer.

6. **Tie-breaking**: When multiple labs share the same `gainPerDay`, prefer shorter `durationHours` (frees the slot sooner).

7. **Termination**: Stop when each slot has 10 assignments.

### Output

```ts
interface SlotPlan {
  steps: PlannedStep[];
}

interface PlannedStep {
  labStep: LabStep;
  startHour: number;       // simulation hour when this step begins
  poolAtStart: number;     // coin balance when this step starts
  idleHoursBefore: number; // hours this slot waited (saving up) before this step
}
```

3 `SlotPlan` objects, one per slot, each with 10 `PlannedStep` entries.

## UI Layout

### Placement

The planner section sits **above** the existing data tables in the main view, inside a card matching the app's dark tactical theme.

### Config Bar

A horizontal bar at the top of the planner card:

- **Category checkboxes**: `eHP`, `regen`, `eDAMAGE`, `eECON`, `SHARD PATH` — all checked by default
- **Daily income input**: Number input + suffix dropdown (`T` / `q` / `Q`)
- **"Calculate" button**: Runs the simulation and displays results
- Config is persisted to `localStorage` so the user doesn't re-enter it each session

### Slot Columns

Below the config bar, 3 equal-width columns (flex-wrap to stack on mobile):

- Column headers: "SLOT 1", "SLOT 2", "SLOT 3"
- Each column shows 10 rows with: LAB, LEVEL, COST, DURATION, % GAIN
- Lab rows use the same color coding as the existing data tables (shared `labColors` map)
- If a slot has idle time before a step (waiting for budget), show a subtle indicator: e.g. "saving 4h" between rows
- Always shows 10 items per slot (no dropdown)

### Empty State

Before the user clicks "Calculate", display: "Configure your settings and click Calculate to generate a plan."

### Error State

If no labs are affordable with the given income, or no categories are selected, show an appropriate message.

## File Structure

### New Files

- `src/lib/planner.ts` — All parsing functions and scheduling algorithm. Pure functions, no side effects, fully testable.
- `src/lib/__tests__/planner.test.ts` — Tests for cost/duration/gain parsing, lab ordering, simulation logic.
- `src/components/Planner.tsx` — Planner UI: config bar, slot columns, empty/error states.

### Modified Files

- `src/App.tsx` — Render `<Planner>` above `<TableGrid>`, pass `sheets` data.
- `src/lib/types.ts` — Add `LabStep`, `PlannerConfig`, `SlotPlan`, `PlannedStep` interfaces.

### Modified Existing Files

- `src/lib/sheets.ts` — Refactor `extractTableData` to accept column range config instead of hardcoding F-J. Add `regen` to the sheet tab config. Since regen comes from the same Google Sheet tab as eHP (just different columns), fetch the eHP response once and extract two table ranges from it.
- `src/components/TableGrid.tsx` — Add regen to `TABLE_CONFIG` (after eHP), add its label to `TYPE_LABELS`.

### Data Flow

```
Google Sheets fetch
  → eHP sheet response → extract cols F-J as "eHP" table
                        → extract cols AB-AF as "regen" table
  → eDamage, eEcon, Shard Path → extract cols F-J as usual

sheets (Record<string, TableData>) now has 5 keys
  → Planner component receives sheets as prop
  → On "Calculate", parses TableData rows into LabStep[]
  → Runs scheduling simulation
  → Renders 3 SlotPlan columns
```

Regen is fetched alongside existing data — no separate fetch. The planner operates entirely on already-fetched sheet data.

## localStorage

| Key | Purpose |
|-----|---------|
| `sp_planner_config` | Checkbox states + daily income value/suffix |

## Edge Cases

- **No categories selected**: Show "Select at least one category" message
- **Daily income = 0 or empty**: Disable Calculate button
- **All labs too expensive**: Slots show "No affordable labs" after whatever they could schedule
- **Lab data not loaded yet**: Planner shows empty state until sheets are fetched
- **Fewer than 10 steps available**: Show as many as possible, don't pad with empty rows
