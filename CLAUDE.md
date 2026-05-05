# CLAUDE.md — guidance for AI agents working in this repo

This file is read on every session. Keep it current.

## Project at a glance

- **Name:** EffectivePathPlanner (site: effectivepathplanner.com).
- **What it is:** companion planner for the mobile game **The Tower**. Loads
  community "Effective Paths" Google Sheets, parses upgrade tables, and runs
  a 3-slot scheduling simulator to recommend which labs to research next.
- **Stack:** Vite + React 19 + TypeScript + Tailwind v4. Vitest for tests.
  No backend — everything is client-side. Sheets are fetched via the public
  `gviz/tq` JSONP endpoint.
- **Domain:** the user (Peter Azuolas) plays The Tower and is the primary
  user. He understands the game's mechanics; you don't need to explain
  them — but the planner simulator's logic is documented in detail in
  `src/lib/planner.ts` for your reference.

## Comment density (mandatory for this repo)

**This project uses heavy AI-oriented comments by design. Default
"no comments" guidance does NOT apply here.**

When writing or modifying ANY file in `src/` or any config file:

- Every file gets a top-of-file header block describing role, role in app,
  dependencies, and any non-obvious invariants.
- Constants get comments explaining what they encode.
- Functions and components get docstring-style comments covering purpose,
  parameters, side effects, and unusual behavior.
- Magic numbers get a "why this number" comment.
- Complex algorithms (the simulator, fetch dedup, storage layout) get
  walkthrough comments at decision points.
- Don't write tautological comments ("increment i"). Write what an agent
  couldn't easily derive from a single read.

If you add a new file without this comment density, you're not following
the project convention. The user explicitly asked for this so future AI
sessions can ramp up faster.

## Storage keys are STABLE — do not rename

LocalStorage keys all use the legacy `sp_` prefix from the SuperPlanner
naming era:

- `sp_urls` — JSON SheetUrls
- `sp_last_sync` — number (epoch ms)
- `sp_cache_<sheet-key>` — one entry per sheet tab
- `sp_planner_config` — written by `Planner.tsx`, includes `enabledTypes`

The values inside `enabledTypes` are also stable — `"eHP" / "regen" /
"eDAMAGE" / "eECON" / "SHARD PATH"`. Display labels are mapped via
`TYPE_DISPLAY` in `Planner.tsx` and `TYPE_LABELS` in `TableGrid.tsx`. If you
need to rename any storage key, write a one-shot migration in
`App.tsx` first.

## Architecture map

Top-level entry: `src/main.tsx` → `<App />`.

```
src/
├─ App.tsx                  ← top-level orchestrator + view router
├─ main.tsx                 ← Vite entry, renders <App />
├─ components/
│  ├─ Navbar.tsx            ← brand, resync button, settings button
│  ├─ Footer.tsx            ← "LAST SYNC" + build date + GitHub link
│  ├─ SetupPage.tsx         ← first-run URL collection
│  ├─ SettingsModal.tsx     ← in-app URL editing
│  ├─ Planner.tsx           ← planner UI: config bar + results + summary + Gantt
│  ├─ GanttChart.tsx        ← visual timeline (rendered inside Planner)
│  ├─ TableGrid.tsx         ← combined + per-category tables
│  └─ SheetTable.tsx        ← generic table renderer (used by TableGrid)
├─ lib/
│  ├─ types.ts              ← shared types only, no runtime code
│  ├─ storage.ts            ← localStorage adapter
│  ├─ sheets.ts             ← gviz JSONP fetcher + extractor + cache loader
│  ├─ planner.ts            ← parsers + the simulator (see file header)
│  ├─ colors.ts             ← lab name → palette color mapping
│  └─ __tests__/            ← vitest specs
└─ vite-env.d.ts            ← declares __BUILD_DATE__ global
```

`vite.config.ts` injects `__BUILD_DATE__` and configures the React +
Tailwind plugins. The `base: "/"` setting is load-bearing — production is
served from the root of a custom domain, NOT a subpath. Don't change it.

## Common commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build` (also re-captures `__BUILD_DATE__`)
- `npx tsc --noEmit -p tsconfig.app.json` — typecheck only
- `npx vitest run` — full test suite (41 tests today)

## Brand wordmark rule

The wordmark is **EffectivePathPlanner** in CamelCase. Components rendering
it (`Navbar.tsx`, `SetupPage.tsx`) MUST NOT apply the `uppercase` class or
wide `tracking-` (`>1px`). The legacy SUPERPLANNER all-caps form is gone;
uppercasing CamelCase looks broken because the word boundaries disappear.

## Regenerating image assets

Sources of truth in `public/`: `og-image.svg`, `icon.svg`, `maskable-icon.svg`.
When edited, re-rasterize ALL the PNG variants — there's no build-time
automation. Recipe:

```bash
npm install --no-save sharp
node -e "
  const sharp = require('sharp');
  const t = [
    ['public/og-image.svg','public/og-image.png',1200,630],
    ['public/icon.svg','public/favicon-16x16.png',16,16],
    ['public/icon.svg','public/favicon-32x32.png',32,32],
    ['public/icon.svg','public/favicon-48x48.png',48,48],
    ['public/icon.svg','public/apple-touch-icon.png',180,180],
    ['public/icon.svg','public/android-chrome-192x192.png',192,192],
    ['public/icon.svg','public/android-chrome-512x512.png',512,512],
    ['public/maskable-icon.svg','public/maskable-icon-512x512.png',512,512],
  ];
  (async()=>{for(const[s,o,w,h]of t)await sharp(s,{density:384}).resize(w,h).png().toFile(o);})();
"
magick public/favicon-16x16.png public/favicon-32x32.png public/favicon-48x48.png public/favicon.ico
```

Do NOT use ImageMagick to render the SVGs themselves — its SVG renderer
overflows text and drops strokes. Sharp works because it bundles libvips.
`brew install librsvg` is blocked by Homebrew sandbox permissions in this
environment.

## Verification workflow before claiming success

After any non-trivial change:

```bash
npx tsc --noEmit -p tsconfig.app.json   # typecheck
npx vitest run                          # unit tests (currently 41 tests)
```

Both should be silent / all-green. UI-level changes also benefit from a
manual `npm run dev` smoke test if you can run it.

## Pre-commit habits

- The user (per their global CLAUDE.md) wants you to run sub-agents before
  commits. The `superpowers:code-reviewer` agent has been used here before
  release; use it for non-trivial changes.
- The user does NOT want `Co-Authored-By` trailers in commit messages.
- Stage specific files (not `git add -A`) to avoid accidentally including
  experimental files / temporary node_modules artifacts.

## Things to leave alone unless explicitly asked

- The MIT `LICENSE` file (Peter Azuolas, 2026).
- The `private: true` field in `package.json` — release is GitHub-only,
  not npm.
- The historical planning docs under `docs/superpowers/` — they predate
  the rename to EffectivePathPlanner and shouldn't be rewritten.
- The repo URL in `package.json` and `Footer.tsx` still points to
  `github.com/petethered/superplanner` — that's intentional; the GitHub
  repo wasn't renamed when the brand changed.

## Domain dictionary (game-specific)

These appear throughout the codebase:

- **eHP** — effective HP (defensive stat path)
- **Regen** — health regeneration (storage key `regen`, slice of the eHP
  tab via columns 27-31)
- **eDAMAGE** — effective damage (storage key, cache key `eDamage`)
- **eECON** — effective economy (storage key, cache key `eEcon`). eECON
  labs uniquely raise daily income on completion — this drives the
  simulator's compounding behavior.
- **Shard Path** — Module shard upgrade path from the Modules sheet
  (storage key `"SHARD PATH"`, cache key `shardPath`).
- **Slot** — one of N concurrent research queues, where N is user-selectable
  from 1–5 via the SLOTS dropdown in the Planner. Game canon is 3, which is
  the default for new users and the fallback for stored configs that
  predate this field. Stored as `slotCount` in `sp_planner_config`. The
  simulator's `runSimulation` accepts `slotCount` as an optional 4th
  argument (defaulting to 3), so existing call sites and the test suite
  did not need updating when this became user-configurable.
