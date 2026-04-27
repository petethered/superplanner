# EffectivePathPlanner

**Live site:** [effectivepathplanner.com](https://effectivepathplanner.com)

A companion planner for the idle game **[The Tower](https://www.techtreegames.com/)**.
Pull the community **Effective Paths** Google Sheets, browse the upgrade
tables, and run a 3-slot scheduling simulator that recommends which labs to
research next given your current daily income.

Everything runs client-side in your browser. There is no backend, no account,
and no analytics — your sheet URLs and planner config live in `localStorage`
on your machine.

---

## Table of contents

- [What it does](#what-it-does)
- [Quick start (using the live site)](#quick-start-using-the-live-site)
- [How the simulator works](#how-the-simulator-works)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Available scripts](#available-scripts)
- [Tech stack](#tech-stack)
- [Data model & domain glossary](#data-model--domain-glossary)
- [Privacy & data flow](#privacy--data-flow)
- [Contributing](#contributing)
- [License](#license)

---

## What it does

EffectivePathPlanner connects to two community Google Sheets:

1. **Effective Paths** — the eHP / Regen / eDamage / eEcon upgrade tables.
2. **Modules** — the Module Shard upgrade path.

It reads the raw upgrade rows (cost, duration, % gain, target level), groups
them by category, and lets you:

- **Browse** every category as a sortable, filterable table.
- **Plan** the most efficient research schedule across The Tower's 3
  concurrent research slots, given:
  - Which categories you want to include (eHP, Regen, eDamage, eEcon, Shard
    Path — toggle each).
  - Your current **daily income** (with `M` / `B` / `T` / `q` / `Q`
    suffixes).
  - A **planning horizon** (`minDays`) — how long each slot must remain
    scheduled out.
- **Visualize** the resulting plan as three slot lists, a Gantt timeline,
  and a summary card with totals.
- **Resync** anytime — sheets are cached locally and a navbar button
  re-fetches on demand. Stale data (older than 6 hours) is highlighted with
  an amber glow.

---

## Quick start (using the live site)

1. **Share your Google Sheets** as **"Anyone with the link" → Viewer**.
   The app fetches via Google's public `gviz/tq` JSONP endpoint, which
   refuses requests against private sheets. No data ever leaves your
   browser except the read request to Google.

2. **Visit [effectivepathplanner.com](https://effectivepathplanner.com)**.

3. **Paste your URLs** on the setup screen. At least one of the two is
   required:
   - **Effective Paths** — your copy of the community Effective Paths
     spreadsheet (eHP / Regen / eDamage / eEcon tabs).
   - **Modules** — your copy of the Modules spreadsheet (Shard Path tab).

4. **Configure the planner** in the planner panel:
   - Enable/disable categories with the checkboxes.
   - Enter your daily income (e.g. `1.5q`).
   - Pick a planning horizon.
   - Click **Calculate**.

5. **Read the plan.** Each of the 3 slots gets an ordered list of labs to
   research. The Gantt chart shows them on a real timeline; the summary
   card totals time, cost, and projected gains per category.

Settings (the gear icon in the navbar) lets you swap URLs at any time;
doing so clears the cache so the next sync pulls fresh data.

---

## How the simulator works

The simulator is documented in detail at the top of
[`src/lib/planner.ts`](src/lib/planner.ts). The short version:

**Game model**

- The Tower has exactly 3 concurrent research slots — this is hardcoded.
- Each lab has an ordered sequence of upgrade levels; lower levels must
  finish before higher ones unlock.
- The same lab can't run in two slots simultaneously.
- Coins regenerate at `dailyIncome` per day.
- **eECON** completions raise daily income, so the simulator naturally
  compounds when you include eEcon labs.

**Scheduling policy** (greedy with a budget reservation)

- At each tick, find every empty slot.
- For each empty slot, pick the affordable lab with the highest
  **gain-per-day**, breaking ties on shorter duration.
- "Affordable" reserves enough coins for the cheapest available lab in
  every other empty slot, so a single greedy pick can't starve later slots.
- When no slot can be filled, advance time to either:
  - The next slot-completion event (and accrue income), or
  - The moment we'll have enough coins for the cheapest available lab if
    nothing is currently in progress.
- Stop once every slot has been scheduled past `minDays * 24` hours.

**Safety nets**

- A 5000-iteration cap prevents pathological inputs from looping forever.
  Realistic 90-day plans complete in a few hundred iterations and run in
  single-digit milliseconds.
- Unparseable cells default to 0 (treated as always-affordable) rather
  than crashing the planner.

---

## Development setup

**Requirements:** Node.js 20+ and npm.

```bash
git clone https://github.com/petethered/superplanner.git
cd superplanner
npm install
npm run dev
```

The dev server starts on the URL Vite prints (typically
`http://localhost:5173`). Hot reload is enabled.

### Verification before committing

```bash
npx tsc --noEmit -p tsconfig.app.json   # strict TypeScript check
npx vitest run                          # full unit test suite
npm run build                           # production build (also typechecks)
```

Both `tsc` and `vitest` should be silent / all-green. The build step
re-captures `__BUILD_DATE__`, which is shown in the footer.

---

## Project layout

```
src/
├─ App.tsx                  ← top-level orchestrator + view router
├─ main.tsx                 ← Vite entry, renders <App />
├─ components/
│  ├─ Navbar.tsx            ← brand, resync button, settings button
│  ├─ Footer.tsx            ← LAST SYNC + build date + GitHub link
│  ├─ SetupPage.tsx         ← first-run URL collection
│  ├─ SettingsModal.tsx     ← in-app URL editing
│  ├─ Planner.tsx           ← planner UI: config bar + results + summary + Gantt
│  ├─ GanttChart.tsx        ← visual timeline
│  ├─ TableGrid.tsx         ← combined + per-category tables
│  └─ SheetTable.tsx        ← generic table renderer
├─ lib/
│  ├─ types.ts              ← shared types only, no runtime code
│  ├─ storage.ts            ← localStorage adapter
│  ├─ sheets.ts             ← gviz JSONP fetcher + extractor + cache loader
│  ├─ planner.ts            ← parsers + the simulator
│  ├─ colors.ts             ← lab name → palette color mapping
│  └─ __tests__/            ← Vitest specs (planner, sheets, storage)
└─ vite-env.d.ts            ← declares __BUILD_DATE__ global
```

Top-level files of note:

- `vite.config.ts` — injects `__BUILD_DATE__` and configures React +
  Tailwind v4. `base: "/"` is intentional (custom domain at root).
- `CLAUDE.md` — guidance for AI agents working in this repo. Worth a read
  if you plan to use Claude Code or another agent here.
- `public/` — static assets, including the favicon set, OG image, web
  manifest, and `CNAME` for the custom domain.

---

## Available scripts

| Script           | What it does                                       |
| ---------------- | -------------------------------------------------- |
| `npm run dev`    | Vite dev server with HMR.                          |
| `npm run build`  | `tsc -b && vite build` — typechecks then builds.   |
| `npm run preview`| Serves the production build locally.               |
| `npm run lint`   | ESLint.                                            |
| `npm test`       | Vitest in watch mode.                              |
| `npx vitest run` | Vitest single run (CI-style).                      |

---

## Tech stack

- **React 19** + **TypeScript** (strict mode)
- **Vite 6** for dev server and build
- **Tailwind CSS v4** via the official Vite plugin
- **Vitest** + **@testing-library/react** + **jsdom** for tests
- **lucide-react** for icons
- Google Fonts: Exo 2, JetBrains Mono, Orbitron

No state-management library, no router, no UI kit. The whole app is React
function components + a few hand-rolled hooks.

---

## Data model & domain glossary

**Lab categories** (storage key → display label):

| Storage key   | Display     | What it is                                         |
| ------------- | ----------- | -------------------------------------------------- |
| `eHP`         | eHP         | Effective HP (defensive stat path).                |
| `regen`       | Regen       | Health regeneration (column slice of eHP tab).     |
| `eDAMAGE`     | eDAMAGE     | Effective damage.                                  |
| `eECON`       | eECON       | Effective economy. eEcon labs raise daily income.  |
| `SHARD PATH`  | Shard Path  | Module shard upgrade path (Modules sheet).         |

**Storage keys** (all use the legacy `sp_` prefix from before the
EffectivePathPlanner rename — these are stable and must not be renamed
without a migration step):

- `sp_urls` — JSON `SheetUrls` (the two configured URLs).
- `sp_last_sync` — epoch ms of the last successful sync.
- `sp_cache_<sheet-key>` — one entry per sheet tab.
- `sp_planner_config` — planner config including `enabledTypes`.

**Cost / duration / gain parsers** live in `src/lib/planner.ts`:

- `parseCost("69.58 B")` → `6.958e10` (suffixes: `M`, `B`, `T`, `q`, `Q`;
  case-sensitive — `q` ≠ `Q`).
- `parseDuration("2d 15h 14m")` → fractional hours.
- `parseGain("16.455 638%")` → `16.455638`.
- `parseLevel("lvl 5")` → `5`.

---

## Privacy & data flow

EffectivePathPlanner is a static site with **no backend** and **no
analytics**. The data flow is:

1. The browser reads your sheet URLs from `localStorage`.
2. It JSONP-fetches each tab from
   `https://docs.google.com/spreadsheets/d/.../gviz/tq` — a public,
   anonymous endpoint Google provides for read-sharing-enabled sheets.
3. Parsed tables are cached in `localStorage` and rendered.
4. The simulator runs synchronously in your browser; results are kept in
   React state and never persisted or transmitted.

JSONP (script-tag injection) is used instead of `fetch()` because the
`gviz/tq` endpoint does not send CORS headers; this is also why your
sheets must be shared as "Anyone with the link" (Viewer).

---

## Contributing

Bug reports and PRs are welcome at
[github.com/petethered/superplanner](https://github.com/petethered/superplanner).
The repo name still reflects the project's original "SuperPlanner" name —
that's intentional.

If you're using an AI agent (e.g. Claude Code) on this repo, read
[`CLAUDE.md`](CLAUDE.md) first. It documents the comment-density
convention, stable storage keys, and the verification workflow this
project expects before commits.

---

## License

[MIT](LICENSE) © 2026 Peter Azuolas.

The Tower is a trademark of its respective owners. EffectivePathPlanner
is an unofficial fan tool with no affiliation to the game's developers.
