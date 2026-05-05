# Configurable slot count + auto-recalc — design

**Status:** approved 2026-05-05
**Author:** Claude (with Peter Azuolas)
**Scope:** `src/lib/planner.ts`, `src/lib/types.ts`, `src/components/Planner.tsx`,
`src/lib/__tests__/`, `CLAUDE.md`

## Goal

Let the user pick how many concurrent research slots the planner simulates
(1–5), with the result re-computed automatically whenever any planner config
field changes. The game's canonical value is 3; that remains the default.

## Background

Today the simulator hardcodes 3 slots — see `src/lib/planner.ts`:

- `plans: PlannedStep[][] = [[], [], []]`
- `slotFreeAt = [0, 0, 0]`
- `slotLabKey: (string | null)[] = [null, null, null]`
- `slotStep: (LabStep | null)[] = [null, null, null]`
- Three `for (let i = 0; i < 3; i++)` loops (in `freeFinishedSlots`, in
  free-slot enumeration, and in next-finish lookup)

The greedy scheduling logic — budget reservation, "best affordable" lab
picking, time-advancement — is already written in terms of "free slot count"
rather than the literal `3`, so it generalises without algorithmic change.

The Planner UI in `src/components/Planner.tsx` exposes a config bar with
category checkboxes, an income input, a DAYS dropdown, and a Calculate
button that triggers a single synchronous simulation pass.

## Requirements

1. User can choose a slot count from 1, 2, 3, 4, or 5.
2. Default for new and existing users (whose stored config doesn't have the
   field) is `3`.
3. The slot count is persisted in `sp_planner_config` alongside the other
   planner fields.
4. Whenever any planner config field changes — categories, income, days,
   slots — the simulation re-runs automatically and updates the result.
5. The Calculate button stays. Clicking it re-runs the simulation manually
   (visible affordance, identical effect to auto-recalc).
6. On initial mount, once `sheets` data is available and config is valid
   (income > 0, ≥1 type enabled), the simulation runs automatically without
   requiring a first click.
7. If preconditions fail (no types enabled, income ≤ 0), the result is
   cleared and the placeholder text shows. (`sheets` is always populated
   when `Planner` mounts — `App.tsx` gates rendering on `sheets &&` —
   so a "sheets not loaded" state isn't reachable inside this component.)

## Design

### Type changes (`src/lib/types.ts`)

Add `slotCount: number` to `PlannerConfig`. Comment notes the valid range
(1–5) and that the game-canonical value is 3.

### Simulator parameterisation (`src/lib/planner.ts`)

Add a 4th optional parameter to `runSimulation`:

```ts
export function runSimulation(
  allSteps: LabStep[],
  dailyIncome: number,
  minDays: number,
  slotCount: number = 3,
): SimulationResult
```

The default of `3` preserves the existing 41 tests that call without it.

Replace the four hardcoded literals:

- `plans: PlannedStep[][] = Array.from({ length: slotCount }, () => [])`
- `slotFreeAt = new Array(slotCount).fill(0)`
- `slotLabKey: (string | null)[] = new Array(slotCount).fill(null)`
- `slotStep: (LabStep | null)[] = new Array(slotCount).fill(null)`

Replace the three `for (let i = 0; i < 3; i++)` loops with `< slotCount`.
The locations are in `freeFinishedSlots`, the free-slot enumeration step,
and the next-finish lookup before time advancement.

Update the file-header comments per project convention:

- The "exactly 3 slots" invariant becomes "N concurrent slots supplied by
  caller; defaults to game-canonical 3".
- Add a one-line note that the budget-reservation maths already work for
  any N because it derives from `freeSlotIds.length`, not the literal 3.

### UI changes (`src/components/Planner.tsx`)

**`loadConfig` migration:** the returned object spreads stored fields over
defaults, so missing `slotCount` falls back to `3` without an explicit
migration step. New users start with `slotCount: 3` from the defaults
literal.

**SLOTS dropdown:** placed immediately to the left of the DAYS dropdown,
mirroring its visual treatment (label + `<select>` with the same Tailwind
classes). Options are `[1, 2, 3, 4, 5]`. `onChange` calls
`updateConfig({ slotCount: Number(e.target.value) })`.

**`runCalculation` extraction:** the body of today's `handleCalculate`
becomes a standalone function. It checks preconditions and either runs
`runSimulation(allSteps, config.dailyIncome, config.minDays, config.slotCount)`
or clears `results` to `null`.

**Auto-recalc effect:**

```tsx
useEffect(() => {
  runCalculation();
}, [config, sheets]);
```

`config` is shallow-equal stable across renders (single mutation point in
`updateConfig`), so the effect re-fires exactly when a config field
changes or `sheets` is repopulated. Per-keystroke income changes are fine
— the simulator runs in single-digit ms.

**Calculate button:** unchanged behaviour. `onClick={runCalculation}`,
`disabled` when no types selected or income ≤ 0. It now functions as a
manual re-run affordance.

### Tests (`src/lib/__tests__/planner.test.ts`)

Add two specs to the existing simulator test file:

1. `runSimulation` with `slotCount = 1` — single-slot plan; verifies the
   simulator schedules sequentially and returns exactly 1 entry in
   `result.slots`.
2. `runSimulation` with `slotCount = 5` — five-slot plan; verifies the
   simulator distributes work across all 5 slots without crashing and the
   result has length 5.

Existing 3-slot tests stay as-is — they call `runSimulation` without the
4th argument and exercise the default.

### Documentation hygiene (`CLAUDE.md`)

The Domain Dictionary entry for **Slot** currently reads:

> Slot — one of 3 concurrent research queues. The simulator targets
> exactly 3 slots; this is a hardcoded game constant.

Update to:

> Slot — one of N concurrent research queues, where N is user-selectable
> from 1 to 5 via the SLOTS dropdown in the Planner. Game canon is 3,
> which is the default. Stored as `slotCount` in `sp_planner_config`.

## Non-goals / out of scope

- No debouncing on the income input. Simulator is fast enough that
  per-keystroke recomputation is imperceptible.
- No animation or skeleton state during recompute. Simulation is sub-10ms;
  the result swap is effectively instantaneous.
- No change to storage-key naming. `sp_planner_config` continues to hold
  all planner fields under a single JSON blob; adding `slotCount` is a
  pure additive field migration.
- No change to the Gantt chart or slot-list rendering. They already
  iterate `results.slots` without assuming length 3.

## Edge cases

- **Stored config from before this change:** `loadConfig` defaults absorb
  the missing field; `slotCount` becomes `3` on first read after upgrade
  and is persisted on the next `updateConfig` call.
- **`sheets` empty during initial load:** not reachable in practice —
  `App.tsx` only renders `<Planner />` once `sheets` is populated, so the
  effect's first run already has data.
- **User clears the income field mid-typing:** `dailyIncomeValue` becomes
  `0`, precondition fails, `results` is cleared. When they type a valid
  value again, the effect re-fires and produces a fresh plan.
- **User toggles slot count from 5 to 1 with results showing:** the
  effect re-fires, `runCalculation` returns a 1-slot plan, the UI
  re-renders with one slot and a regenerated Gantt chart. No flicker
  expected because React batches the state update.

## Verification

After implementation:

```bash
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
```

Both should be silent. The test count rises from 41 to 43 with the two
new specs.

Manual smoke test in `npm run dev`:

1. Load with no stored config → planner shows defaults, runs automatically
   if both URLs and income are present.
2. Change SLOTS to 1 → result re-renders with one slot.
3. Change SLOTS to 5 → result re-renders with five slots; Gantt chart
   shows five lanes.
4. Toggle a category → result re-renders.
5. Click Calculate with unchanged config → result is identical (button
   still works as a manual re-run).
6. Refresh the page → stored `slotCount` round-trips through localStorage.
