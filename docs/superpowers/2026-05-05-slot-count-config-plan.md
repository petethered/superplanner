# Configurable slot count + auto-recalc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick 1–5 research slots in the planner UI (default 3), and have the simulation re-run automatically whenever any planner config field changes.

**Architecture:** Parameterise `runSimulation` with an optional 4th `slotCount` argument that defaults to `3` (preserves all existing call sites and tests). Add a SLOTS dropdown to `Planner.tsx` next to DAYS. Extract today's `handleCalculate` body into a `runCalculation` function called both by a `useEffect([config, sheets])` and by the existing Calculate button. Migration for stored configs is a one-line spread-defaults change in `loadConfig`.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Tailwind v4. No new dependencies.

**Spec:** `docs/superpowers/2026-05-05-slot-count-config-design.md`

**Repo conventions to honour:**
- This project uses **heavy AI-oriented comments** (per `CLAUDE.md`). Every modified file gets file-header / function-level comments updated to match the change. Add a comment for any new constant or non-obvious branch.
- Storage keys (`sp_planner_config`) are stable and additive — do **not** rename.
- Per the user's global rule, run a sub-agent code review before each commit. The plan calls these out at every commit step.
- Per the user's global rule, **no `Co-Authored-By` trailer** in any commit message.
- Stage files explicitly by name (no `git add -A` / `git add .`).

**Commit boundaries:**
- **Commit 1** — simulator parameterisation: `types.ts` + `planner.ts` + `planner.test.ts`. Self-contained and independently verifiable (typecheck + tests stay green).
- **Commit 2** — UI + docs: `Planner.tsx` + `CLAUDE.md`. Wires the new param into the UI and updates the domain dictionary.

---

## Task 1: Add `slotCount` to `PlannerConfig`

**Files:**
- Modify: `src/lib/types.ts:105-111`

This is a pure additive type change. No behaviour yet.

- [ ] **Step 1: Open `src/lib/types.ts` and update the `PlannerConfig` interface**

Replace the existing block (lines ~92-111) with:

```ts
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
```

- [ ] **Step 2: Typecheck — expect failures in `Planner.tsx`'s `loadConfig`**

Run:

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: error(s) about `slotCount` missing from the literal returned by `loadConfig` in `src/components/Planner.tsx`. This is fine — Task 4 fixes it. We accept a transient typecheck failure within Commit 1's scope only if it covers the full path; we'll fix it in this commit before staging.

(If you want zero-failures incrementally, skip ahead to Task 4 step 1 to add `slotCount: 3` to the defaults, run typecheck again, then come back. Either order produces the same final commit.)

---

## Task 2: TDD — write failing tests for `slotCount=1` and `slotCount=5`

**Files:**
- Modify: `src/lib/__tests__/planner.test.ts` (append two `it` blocks inside the existing `describe("runSimulation", …)`)

- [ ] **Step 1: Add two failing tests to the `runSimulation` describe block**

Open `src/lib/__tests__/planner.test.ts`. Inside the `describe("runSimulation", () => { … })` block, immediately before the closing `});` (currently line 245), add:

```ts
  it("respects slotCount=1 — schedules sequentially in a single slot", () => {
    const steps = [
      step("eHP", "A", 1, 100, 24, 5),
      step("eHP", "B", 1, 100, 24, 4),
      step("eHP", "C", 1, 100, 24, 3),
    ];
    const { slots } = runSimulation(steps, 1000, 1, 1);
    expect(slots).toHaveLength(1);
    // Only the highest-gain step gets picked first; the rest follow in
    // the same slot since there's nowhere else to put them.
    expect(slots[0].steps[0].labStep.lab).toBe("A");
    // No second slot exists at all.
    expect(slots[1]).toBeUndefined();
  });

  it("respects slotCount=5 — distributes work across all five slots", () => {
    const steps = [
      step("eHP", "A", 1, 100, 24, 5),
      step("eHP", "B", 1, 100, 24, 4),
      step("eHP", "C", 1, 100, 24, 3),
      step("eHP", "D", 1, 100, 24, 2),
      step("eHP", "E", 1, 100, 24, 1),
      step("eHP", "F", 1, 100, 24, 0.5),
    ];
    const { slots } = runSimulation(steps, 10_000, 1, 5);
    expect(slots).toHaveLength(5);
    // Each of the five highest-gain labs should occupy a distinct slot
    // for the first scheduled step.
    const firstLabs = slots.map((s) => s.steps[0]?.labStep.lab).sort();
    expect(firstLabs).toEqual(["A", "B", "C", "D", "E"]);
  });
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
npx vitest run src/lib/__tests__/planner.test.ts
```

Expected outcome:
- `slotCount=1` test: **fails** because `runSimulation` ignores the 4th argument today and still returns 3 slots. The `expect(slots).toHaveLength(1)` assertion fails.
- `slotCount=5` test: **fails** for the same reason — only 3 slots returned, `toHaveLength(5)` fails.

The remaining 41 tests should still pass.

---

## Task 3: Parameterise `runSimulation` with `slotCount`

**Files:**
- Modify: `src/lib/planner.ts` (function signature, internal arrays, three loops, file-header comment block)

- [ ] **Step 1: Update the `runSimulation` signature and internal state**

Open `src/lib/planner.ts`. Find the `runSimulation` declaration (currently around line 195 — search for `export function runSimulation`). Update the signature and the four state initialisers:

```ts
export function runSimulation(
  allSteps: LabStep[],
  dailyIncome: number,
  minDays: number,
  // Number of concurrent research slots to simulate. Defaults to the
  // game-canonical value of 3 so existing call sites and the 41 pre-existing
  // tests don't need updating. The Planner UI restricts user input to
  // 1–5 via the SLOTS dropdown.
  slotCount: number = 3,
): SimulationResult {
```

Then locate the four state literals (currently around lines 213-217):

```ts
  // Per-slot scheduling state. The game has exactly 3 concurrent slots.
  const plans: PlannedStep[][] = [[], [], []];
  const slotFreeAt = [0, 0, 0];
  const slotLabKey: (string | null)[] = [null, null, null];
  const slotStep: (LabStep | null)[] = [null, null, null];
```

Replace with:

```ts
  // Per-slot scheduling state. Sized by `slotCount`. The game's canonical
  // value is 3; the caller may pass 1–5 via the SLOTS dropdown in the UI.
  // The greedy budget reservation below derives all its arithmetic from
  // `freeSlotIds.length` rather than this constant, so it generalises to
  // any `slotCount` without algorithmic change.
  const plans: PlannedStep[][] = Array.from({ length: slotCount }, () => []);
  const slotFreeAt = new Array(slotCount).fill(0) as number[];
  const slotLabKey: (string | null)[] = new Array(slotCount).fill(null);
  const slotStep: (LabStep | null)[] = new Array(slotCount).fill(null);
```

- [ ] **Step 2: Replace the three `for (let i = 0; i < 3; i++)` loops**

There are three loops to update. Find each `for (let i = 0; i < 3; i++)` and change `3` to `slotCount`. The locations are:

1. Inside `freeFinishedSlots` (currently line ~230) — sweeps completed slots.
2. Inside the main scheduling loop's free-slot enumeration (currently line ~303) — collects which slots are empty.
3. Inside the main loop's "find next finish" block (currently line ~354) — picks the earliest slot-finish event for time advancement.

After editing, verify with:

```bash
grep -n "i < 3" src/lib/planner.ts
```

Expected: no matches. (If any remain, they were missed.)

- [ ] **Step 3: Update the file-header comments to reflect the new behaviour**

Open `src/lib/planner.ts` and update the top-of-file block. Specifically:

Find the lines that currently read (around lines 7-11):

```
//   2. Runs a greedy 3-slot scheduling simulation that picks which lab to
//      research in which slot at which hour, given a daily-income budget.
//
// Game-mechanics summary:
//   - The Tower has exactly 3 concurrent research slots.
```

Replace with:

```
//   2. Runs a greedy N-slot scheduling simulation that picks which lab to
//      research in which slot at which hour, given a daily-income budget.
//      `N` is supplied by the caller (the `slotCount` parameter); it
//      defaults to 3 so all existing call sites and tests continue to work.
//
// Game-mechanics summary:
//   - The Tower has exactly 3 concurrent research slots; this is the
//     game-canonical value and the simulator's default. The Planner UI
//     exposes a 1–5 dropdown so the user can run "what-if" simulations
//     for fewer or more slots.
```

Find the line in the simulator's docblock (around line 141) that reads:

```
 * greedy schedule that fills all 3 slots for at least `minDays` days.
```

Replace with:

```
 * greedy schedule that fills all `slotCount` slots for at least `minDays`
 * days. `slotCount` defaults to 3 (game canon) when omitted.
```

Find the line (around line 174) that reads:

```
 *   4. Budget reservation: when picking a lab for slot i with N slots
 *      remaining empty after it, we don't let slot i spend more than
```

Leave that block as-is — it's already written generically in terms of "N slots" and is correct for any slot count.

- [ ] **Step 4: Run the simulator tests and verify everything passes**

Run:

```bash
npx vitest run src/lib/__tests__/planner.test.ts
```

Expected: all 43 tests pass (41 existing + 2 new from Task 2).

- [ ] **Step 5: Run the full test suite and typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
```

Typecheck still complains about `Planner.tsx`'s `loadConfig` literal missing `slotCount` (left over from Task 1). Fix it next via the early portion of Task 4's defaults change before staging Commit 1.

- [ ] **Step 6: Patch `loadConfig` defaults so typecheck passes**

This is the small one-liner from Task 4 hoisted forward so Commit 1 is self-consistent. Open `src/components/Planner.tsx` and find the `loadConfig` function (around line 84). Replace it entirely with:

```ts
/**
 * Reads persisted planner config from localStorage. Returns sensible
 * defaults when nothing is stored yet (all types enabled, 1q/day income,
 * 14-day horizon, 3 concurrent research slots — game canon).
 *
 * Migration note: when the user has a stored config from before a new
 * field was added, we spread the parsed JSON over the defaults so missing
 * fields fall back to their default value rather than leaving the field
 * `undefined`. `slotCount` was added in this exact way (May 2026) — old
 * stored configs read back with `slotCount = 3`.
 *
 * The try/catch guards against malformed JSON without crashing — defaults
 * are returned in that case.
 */
function loadConfig(): PlannerConfig {
  const defaults: PlannerConfig = {
    enabledTypes: [...ALL_TYPES],
    dailyIncome: 1e15,
    dailyIncomeSuffix: "q",
    dailyIncomeValue: 1,
    minDays: 14,
    slotCount: 3,
  };
  try {
    const raw = localStorage.getItem("sp_planner_config");
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignore — fall through to defaults */
  }
  return defaults;
}
```

- [ ] **Step 7: Re-run typecheck and full tests**

Run:

```bash
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
```

Expected: silent typecheck, all 43 tests pass.

- [ ] **Step 8: Sub-agent code review for Commit 1**

Per the user's standing rule ("always run sub agents before commits"), dispatch the `superpowers:code-reviewer` agent to review the changes in `src/lib/types.ts`, `src/lib/planner.ts`, `src/lib/__tests__/planner.test.ts`, and the `loadConfig` portion of `src/components/Planner.tsx` against the spec at `docs/superpowers/2026-05-05-slot-count-config-design.md`.

Use the Agent tool with `subagent_type: "superpowers:code-reviewer"` and a prompt that includes:

- The spec path.
- A brief summary of what changed (simulator parameterisation + 2 new tests + loadConfig migration).
- A request to flag any deviation from spec, missed call sites, missing comments, or test-coverage gaps.
- A request to verify `grep -n 'i < 3' src/lib/planner.ts` returns nothing.

Address any issues the reviewer flags before proceeding.

- [ ] **Step 9: Stage and commit (Commit 1)**

Run:

```bash
git add src/lib/types.ts src/lib/planner.ts src/lib/__tests__/planner.test.ts src/components/Planner.tsx
git commit -m "feat(planner): parameterise simulator slot count (default 3)

Adds an optional 4th slotCount argument to runSimulation, replacing the
hardcoded 3-slot arrays and loops. Default of 3 preserves all existing
call sites and the 41 pre-existing tests. Two new tests cover slotCount=1
and slotCount=5.

Also adds slotCount to PlannerConfig with a defaults-spread migration in
loadConfig so stored configs from before this change read back with the
canonical default of 3.

UI wiring (the SLOTS dropdown, auto-recalc) lands in the next commit."
git status
```

Expected: clean working tree (Planner.tsx still has the old `handleCalculate` flow because the UI changes happen in Commit 2).

Wait — `Planner.tsx` was partially modified in Step 6 above (only `loadConfig`). The remaining UI changes happen in Tasks 4–6 below. The commit will contain that partial change to `Planner.tsx`, which is fine: the file will compile and behave identically to today (because nothing reads `config.slotCount` yet).

---

## Task 4: Add the SLOTS dropdown

**Files:**
- Modify: `src/components/Planner.tsx` (add the dropdown to the config bar, around lines 305-318 next to the existing DAYS dropdown)

- [ ] **Step 1: Add the SLOTS dropdown immediately to the left of DAYS**

Open `src/components/Planner.tsx`. Find the DAYS dropdown block (currently line ~305-318):

```tsx
        {/* Planning horizon (minDays). Discrete options; the simulator
            keeps filling slots until each one has at least this much
            scheduled. */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono-data">DAYS:</span>
          <select
            value={config.minDays}
            onChange={(e) => updateConfig({ minDays: Number(e.target.value) })}
            …
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
```

Insert the SLOTS dropdown immediately before it. The full new block to add (visually mirrors the DAYS block):

```tsx
        {/* Slot count (1–5). The simulator's hardcoded 3-slot model used
            to be a game-truth invariant; now exposed so the user can
            run what-if plans for fewer or more concurrent slots. The
            simulator's `runSimulation` defaults to 3 if the parameter
            is omitted, but here we always pass the configured value. */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono-data">SLOTS:</span>
          <select
            value={config.slotCount}
            onChange={(e) => updateConfig({ slotCount: Number(e.target.value) })}
            className="px-2 py-1 bg-slate-800/70 border border-slate-700 rounded text-xs text-slate-400 font-mono-data focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
```

- [ ] **Step 2: Wire `slotCount` into the simulator call**

Find the `handleCalculate` function (currently line ~223). Update the `runSimulation` call. Locate this line (currently around line 235):

```ts
    const result = runSimulation(allSteps, config.dailyIncome, config.minDays);
```

Change to:

```ts
    const result = runSimulation(
      allSteps,
      config.dailyIncome,
      config.minDays,
      config.slotCount,
    );
```

- [ ] **Step 3: Typecheck and run tests**

Run:

```bash
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
```

Expected: silent typecheck, all 43 tests pass.

---

## Task 5: Auto-recalc with `useEffect`; refactor `handleCalculate` into `runCalculation`

**Files:**
- Modify: `src/components/Planner.tsx` (extract function, add useEffect, change button handler)

- [ ] **Step 1: Add `useEffect` to the React import**

At the top of `src/components/Planner.tsx`, find:

```ts
import { useState, useMemo } from "react";
```

Change to:

```ts
import { useState, useMemo, useEffect } from "react";
```

- [ ] **Step 2: Rename and refactor `handleCalculate` → `runCalculation`**

Find the current `handleCalculate` function (currently line ~223). Replace it entirely with:

```ts
  /**
   * Runs the simulator. Single source of truth for both the auto-recalc
   * `useEffect` and the manual Calculate button. Walks `enabledTypes`,
   * looks up each one's TableData via TYPE_TO_SHEET_KEY, parses to
   * LabStep[], then concatenates and passes the whole pile to
   * `runSimulation` along with the configured slot count.
   *
   * Preconditions:
   *   - At least one type is enabled.
   *   - dailyIncomeValue > 0.
   * If either fails, we clear `results` to null so the UI shows the
   * "Configure your settings…" placeholder rather than stale results.
   *
   * If preconditions pass but no enabled type has any data (e.g. URLs
   * not configured for the selected sheets), we still set an explicit
   * empty result so the UI moves into the "no labs available" state.
   *
   * The simulator runs synchronously and typically completes in
   * single-digit ms — fast enough that per-keystroke recomputation on
   * the income input feels instantaneous, so we don't bother debouncing.
   */
  function runCalculation() {
    if (config.enabledTypes.length === 0 || config.dailyIncomeValue <= 0) {
      setResults(null);
      return;
    }

    const allSteps = config.enabledTypes.flatMap((type) => {
      const key = TYPE_TO_SHEET_KEY[type];
      const data = key ? sheets[key] : null;
      return data ? parseLabSteps(type, data) : [];
    });

    if (allSteps.length === 0) {
      setResults({ slots: [], finalDailyIncome: config.dailyIncome });
      return;
    }

    const result = runSimulation(
      allSteps,
      config.dailyIncome,
      config.minDays,
      config.slotCount,
    );
    setResults(result);
  }
```

- [ ] **Step 3: Add the auto-recalc effect**

Immediately after the `runCalculation` function (still inside the `Planner` component), add:

```ts
  /**
   * Auto-recalculate whenever `config` or `sheets` changes. `config` is
   * a stable reference between renders (single mutation point in
   * `updateConfig`), so this fires exactly when the user edits a config
   * field or `sheets` is repopulated. On initial mount it fires once
   * with the persisted config and the freshly-loaded sheets, producing
   * a plan immediately — no first-click required.
   *
   * The Calculate button still works as a manual re-run affordance
   * (clicking it calls `runCalculation` directly with the same inputs,
   * producing an identical result).
   */
  useEffect(() => {
    runCalculation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, sheets]);
```

The `eslint-disable` comment is intentional: `runCalculation` closes over `config` and `sheets` plus calls `setResults` (which is stable). Adding `runCalculation` to the deps array would require wrapping it in `useCallback` for no observable benefit — `[config, sheets]` is already the precise correctness-preserving dependency set.

- [ ] **Step 4: Update the Calculate button's `onClick`**

Find the button (currently line ~320):

```tsx
        <button
          onClick={handleCalculate}
          …
        >
```

Change `onClick={handleCalculate}` to `onClick={runCalculation}`. Leave the `disabled` and styling unchanged.

- [ ] **Step 5: Typecheck and run tests**

Run:

```bash
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
```

Expected: silent typecheck, all 43 tests pass.

- [ ] **Step 6: Manual smoke test in the dev server**

Run:

```bash
npm run dev
```

Open the URL Vite prints (port 5666 per `vite.config.ts`). With sheets already configured from a previous session, verify each:

1. Initial mount: planner renders **with results already populated** — no first click on Calculate required.
2. Change SLOTS to **1**: results re-render to a single slot. Gantt chart shrinks to one lane.
3. Change SLOTS to **5**: results re-render with five slots. Gantt chart shows five lanes.
4. Toggle a category checkbox: results re-render with the new category mix.
5. Edit DAYS: results re-render to the new horizon.
6. Edit INCOME numeric input: results re-render per-keystroke without visible lag. (Clearing the field to empty/0 hides results — placeholder text returns. Typing a value back brings them back.)
7. Click Calculate with no config change: results stay identical (button still functional as a re-run affordance).
8. Hard-refresh the browser tab: stored `slotCount` round-trips through localStorage (the SLOTS dropdown shows the previously selected value).

Stop the dev server when done.

---

## Task 6: Update `CLAUDE.md` Domain Dictionary

**Files:**
- Modify: `CLAUDE.md` (the Domain Dictionary entry for **Slot**)

- [ ] **Step 1: Update the **Slot** entry**

Open `CLAUDE.md`. Find the line under "## Domain dictionary (game-specific)" that reads:

```
- **Slot** — one of 3 concurrent research queues. The simulator targets
  exactly 3 slots; this is a hardcoded game constant.
```

Replace with:

```
- **Slot** — one of N concurrent research queues, where N is user-selectable
  from 1–5 via the SLOTS dropdown in the Planner. Game canon is 3, which is
  the default for new users and the fallback for stored configs that
  predate this field. Stored as `slotCount` in `sp_planner_config`. The
  simulator's `runSimulation` accepts `slotCount` as an optional 4th
  argument (defaulting to 3), so existing call sites and the test suite
  did not need updating when this became user-configurable.
```

- [ ] **Step 2: Verify the file still parses by running typecheck and tests one last time**

Run:

```bash
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
```

Expected: silent typecheck, all 43 tests pass.

- [ ] **Step 3: Sub-agent code review for Commit 2**

Dispatch `superpowers:code-reviewer` again. Prompt should include:

- The spec path `docs/superpowers/2026-05-05-slot-count-config-design.md`.
- A summary of UI changes: SLOTS dropdown, `runCalculation` extraction, auto-recalc `useEffect`, CLAUDE.md update.
- A request to verify the auto-recalc preconditions match the spec ("no types enabled OR income ≤ 0 → clear results to null"), and that the button still functions.
- A request to flag any missing comments per the heavy-comments convention.
- A request to confirm Step 6's manual smoke test items can all be verified by reading the diff (e.g., the eslint-disable-next-line is present, useEffect deps are exactly `[config, sheets]`, button still has `disabled`).

Address any issues before proceeding.

- [ ] **Step 4: Stage and commit (Commit 2)**

Run:

```bash
git add src/components/Planner.tsx CLAUDE.md
git commit -m "feat(planner): SLOTS dropdown + auto-recalculation

Adds a SLOTS dropdown (1–5, default 3) next to DAYS in the Planner
config bar. Whenever any config field changes — categories, income,
days, or slots — the simulation re-runs automatically. The Calculate
button stays as a manual re-run affordance.

handleCalculate is extracted to runCalculation, called both by a
useEffect([config, sheets]) and by the button. Initial mount produces
a plan immediately without requiring a first click.

CLAUDE.md domain dictionary updated to reflect that slot count is no
longer a hardcoded constant."
git status
```

Expected: clean working tree.

---

## Self-review notes (for the engineer)

After Commit 2, sanity-check:

1. **Spec coverage:** the spec calls for type changes, simulator parameterisation, UI dropdown, auto-recalc, tests, CLAUDE.md update. Each has at least one task. ✓
2. **Frequent commits:** two commits, split along a clean "library / UI" boundary. Each commit leaves the app in a working state.
3. **Test count:** rises from 41 to 43. Verify with `npx vitest run`.
4. **Storage stability:** no key renames; `slotCount` is purely additive. Existing users' stored configs round-trip unchanged on first load and gain `slotCount: 3` on the next `updateConfig` call.
5. **TypeScript strict:** no new `any`, no `as` casts beyond the one on `slotFreeAt` (which is a deliberate `as number[]` because `Array(n).fill(0)` widens to `any[]`).
6. **Comment hygiene:** every modified function/file picked up updated header or inline comments per the project's heavy-AI-comments convention.

If any of the above doesn't hold, fix it in a small follow-up commit on the same branch before declaring the work done.
