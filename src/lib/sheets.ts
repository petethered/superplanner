// =============================================================================
// sheets.ts — fetches Google Sheets data via the public gviz endpoint and
// reshapes it into the app's `TableData` form.
//
// JSONP, not fetch:
//   Google's gviz/tq endpoint supports a JSONP callback via the
//   `tqx=responseHandler:<name>` param. We use JSONP (script tag injection)
//   instead of `fetch()` because the endpoint does not send CORS headers for
//   anonymous shared sheets, so a regular `fetch()` would be blocked by the
//   browser. This is also why sheets must be shared as "Anyone with the
//   link" (Viewer) — the gviz endpoint refuses unauthenticated requests
//   otherwise. There is no server in this app; everything is client-side.
//
// Fetch-deduplication:
//   Both "eHP" (full table) and "regen" (column slice 27-31 of the eHP tab)
//   live in the same spreadsheet tab. `fetchAndCacheAll` groups requests by
//   (sheetId, tab) so we only hit the network once per physical tab and then
//   slice the response into multiple `TableData`s.
//
// Hardcoded COLUMNS, discovered ROWS:
//   `extractTableData` needs a per-tab COLUMN LIST that matches the layout of
//   the Effective Paths spreadsheet. If the upstream sheet structure changes,
//   the column lists in `getSheetTabs` must change too. Current per-tab lists:
//     - eHP / eDamage / shardPath: [5,6,7,8,9]  (the default — Lab, lvl,
//       Cost, Duration, %gain are contiguous)
//     - regen:         [27,28,29,30,31] (same shape, different slice of the
//       physical eHP tab)
//     - eEcon:         [6,7,8,9,12]  (the v28.0 "Avg. CPK Time Path" layout
//       shifted the table one column right and inserted "Recommended
//       Coin/H" (10) and "Time to farm Cost" (11) between Duration and the
//       % gain column, so the selection is NON-contiguous)
//   Column lists exist precisely because eEcon's % gain is no longer
//   adjacent to the other four columns — a start/end window can't express
//   that.
//
//   ROW offsets, by contrast, are NOT hardcoded — see `isDataRow`, which
//   recognises a step by its shape so every non-step row is dropped wherever
//   it appears. Offsets used to be fixed (rowStart=3, rowEnd=100) and both
//   halves of that broke:
//     - Leading rows differ per tab. Under `headers=0` the real layouts are
//       eHP/shardPath = 4 lead rows, eDamage/eEcon = 5. A single constant
//       cannot serve both.
//     - The paths outgrew row 100. eDamage was ~145 steps in August 2026;
//       the old cap silently discarded the tail. Path length depends on the
//       reader's own game stats, so treat that count as a snapshot, not a
//       constant.
//
// headers=0 is load-bearing:
//   Without it, gviz *guesses* how many leading rows are a header and strips
//   them, so JSON row indices shift with the sheet's CONTENT, not just its
//   structure. It ate 0 rows from eHP but 2 from Shard Path. `headers=0`
//   turns that off, so row N of the response is always row N+1 of the sheet.
//   It changes nothing else — cells keep their `v`/`f` pair either way.
// =============================================================================

import type { SheetCell, SheetResponse, TableData } from "./types";
import {
  getCached,
  getExtractVersion,
  setCached,
  setExtractVersion,
  setLastSync,
} from "./storage";

/**
 * JSONP-fetches one sheet tab and resolves with the parsed `SheetResponse`.
 *
 * Implementation notes:
 *  - We mint a unique global callback name (`__sp_<ts>_<rand>`) so that
 *    parallel calls don't clobber each other.
 *  - A 30s timeout rejects with a user-friendly message that suggests the
 *    most likely cause (sharing not enabled, wrong URL).
 *  - `cleanup()` deletes the callback and the script tag. We also clear
 *    the timer in both success and failure paths to avoid leaks.
 *  - When gviz returns an error payload (`status !== "ok"`), the body
 *    sometimes contains a structured `errors[]` array — we surface the
 *    first error's `detailed_message` to the user when present.
 *
 * @param sheetId  the Google Sheets document ID (extracted via
 *                 `extractSheetId` upstream)
 * @param tab      the sheet/tab name within the document, e.g. "eHP"
 */
export function fetchSheet(
  sheetId: string,
  tab: string,
): Promise<SheetResponse> {
  return new Promise((resolve, reject) => {
    // Unique callback name so concurrent fetches don't collide.
    const callbackName = `__sp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");

    const cleanup = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      script.remove();
    };

    // 30s safety net. Most failures are network errors caught by `onerror`
    // below, but this catches the case where the script loads but the
    // callback never fires (e.g. a redirect that yields HTML, not JS).
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out loading "${tab}". Check that the sheet URL is correct and the sheet is shared with "Anyone with the link".`,
        ),
      );
    }, 30_000);

    // The gviz endpoint will invoke this global with the parsed response.
    (window as unknown as Record<string, unknown>)[callbackName] = (
      data: SheetResponse,
    ) => {
      clearTimeout(timer);
      cleanup();
      // gviz signals success with `status === "ok"` and a populated `table`.
      // Anything else is a structured error we want to surface clearly.
      if (data.status !== "ok" || !data.table) {
        const errors = (data as unknown as Record<string, unknown>).errors as
          | Array<{ message?: string; detailed_message?: string }>
          | undefined;
        if (errors?.length) {
          const detail = errors[0].detailed_message || errors[0].message || "";
          reject(
            new Error(`"${tab}": ${detail}`),
          );
        } else {
          reject(
            new Error(
              `"${tab}" returned an error. Verify the tab name exists in the spreadsheet.`,
            ),
          );
        }
        return;
      }
      resolve(data);
    };

    // Network-level failure (DNS, offline, blocked by extension, ...).
    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(
        new Error(
          `Could not reach "${tab}". Check that the sheet URL is correct and the sheet is shared as "Anyone with the link" (Viewer).`,
        ),
      );
    };

    // Build the JSONP URL and append the script tag to start the fetch.
    // `headers=0` disables gviz's header-row auto-detection — see the
    // "headers=0 is load-bearing" note at the top of this file.
    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callbackName}&headers=0&sheet=${encodeURIComponent(tab)}`;
    document.body.appendChild(script);
  });
}

/**
 * Which source column feeds each canonical header, in header order. Exactly
 * five entries — the tuple type is what lets `isDataRow` index COL_DURATION
 * without a possibly-undefined lookup.
 */
export type ColumnMap = readonly [number, number, number, number, number];

// Hardcoded canonical headers. We don't trust the spreadsheet's own header
// row because it isn't consistent across tabs (eEcon calls LAB "Upgrade";
// Shard Path leaves LEVEL blank).
const HEADERS = ["LAB", "LEVEL", "COST", "DURATION", "% GAIN"];

// Positions within HEADERS / a ColumnMap. Named so `isDataRow` reads as the
// rule it implements rather than as `cols[3]`.
const COL_LAB = 0;
const COL_LEVEL = 1;
const COL_COST = 2;
const COL_DURATION = 3;

// Default column map: the LAB/LEVEL/COST/DURATION/% GAIN columns in the eHP,
// eDamage and Shard Path tabs, where all five are contiguous. Tabs whose
// layout differs (regen, eEcon) pass their own map via `getSheetTabs`.
const DEFAULT_COLS: ColumnMap = [5, 6, 7, 8, 9];

/**
 * Cache schema version — bump this whenever a change to `extractTableData`,
 * `isDataRow`, or the per-tab column maps in `getSheetTabs` means previously
 * cached tables are no longer what today's extractor would produce.
 *
 * `fetchAndCacheAll` stamps it; `loadFromCache` refuses to trust a cache
 * carrying any other value. That pairing lives entirely in this file on
 * purpose: the rule "bump when you change the extractor" is only useful if
 * it's visible to whoever is changing the extractor.
 *
 * Version log:
 *   1 — eEcon v28.0 column fix (July 2026). Never stamped; detected instead
 *       by sniffing cached rows for a misaligned LAB column. Those caches
 *       have no stamp at all, so version 2 supersedes the heuristic.
 *   2 — row-discovery rewrite (August 2026). Rows are now located by content
 *       instead of a fixed 3..100 window, and `headers=0` changed the row
 *       indices the old window was calibrated against. Cached tables from
 *       version 1 are both misaligned (Shard Path lost its first, highest-ROI
 *       step) and truncated (any path longer than the old 100-row cap).
 */
export const EXTRACT_VERSION = 2;

// Google Sheets serialises formula errors as these literal strings, and gviz
// hands them to us as ordinary cell text. Normalising them to "" matters most
// for the LAB column: a broken VLOOKUP in the Modules sheet really did turn
// every Shard Path cell into "#N/A", and a non-blank LAB is the first thing
// `isDataRow` looks for — without this, that tab would have yielded 97 rows
// of a lab literally named "#N/A".
const ERROR_LITERALS =
  /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!|GETTING_DATA)$/;

// Upper bound on extracted data rows. Purely a runaway guard against a
// malformed response — the longest real path (eDamage, ~145 steps as of
// August 2026) lives in a tab only ~150 rows tall, so this should never bind.
// If it ever does we warn, because silent row loss is the exact bug the
// row-discovery rewrite existed to fix.
const MAX_DATA_ROWS = 500;

/**
 * Reads one cell as display text, normalising spreadsheet errors to "".
 *
 * Prefers the formatted value `cell.f` (display string) over the raw
 * `cell.v` (numeric). This preserves the spreadsheet's intended formatting
 * (e.g. "16.455 638%") which our parsers in planner.ts know how to handle.
 *
 * `cells` is one row's cell array, which is sparse — trailing empty cells are
 * absent rather than null — hence the optional indexing.
 */
function cellText(cells: SheetCell[] | undefined, colIndex: number): string {
  const cell = cells?.[colIndex];
  const text = cell?.f ?? String(cell?.v ?? "");
  return ERROR_LITERALS.test(text.trim()) ? "" : text;
}

/**
 * The single definition of "this row is one upgrade step".
 *
 * Used BOTH to locate the start of the table and to filter its body, so the
 * two can't disagree. That symmetry is the point: an earlier draft used a
 * strict test to find the start and a loose "not blank everywhere" test for
 * the body, which meant a row with an errored COST or DURATION was skipped at
 * the top of the table but kept in the middle — where it would parse to a
 * free, instant lab that the simulator schedules ahead of everything real.
 *
 * Every path tab opens with some combination of blank spacers, a title
 * ("The Effective Health Lab Path (v28)"), a column-header row, and a
 * "↓ TIME PATH ↓" direction marker — and each tab uses a DIFFERENT number of
 * them, so we identify the data rather than count the preamble:
 *
 *   - LAB non-blank        — rejects spacer and direction-marker rows, whose
 *                            text sits in columns outside `cols`
 *   - LEVEL has a digit    — rejects header rows ("Level", or blank)
 *   - COST has a digit     — rejects header rows ("Cost")
 *   - DURATION looks like  — rejects header rows ("Duration") and the title
 *     "<n>d/h/m"             row, which spills a long string into LAB but
 *                            leaves the rest blank. Matching the shape
 *                            `parseDuration` expects (rather than merely "has
 *                            a digit") is what stops a version-stamped label
 *                            like "Duration (v28.0)" from reading as data.
 *
 * Real rows look like ["Shatter Shards", "lvl 2", "73.95 T", "52d 8h 34m",
 * "0.295 360%"] and satisfy all four. Requiring four independent signals,
 * rather than just a non-blank LAB, is what keeps a header row from being
 * mistaken for the start of the table — Shard Path's header row populates
 * LAB *and* LEVEL ("Lab" / "Level"), so a LAB-only test would latch onto it.
 */
function isDataRow(cells: SheetCell[] | undefined, cols: ColumnMap): boolean {
  return (
    cellText(cells, cols[COL_LAB]).trim() !== "" &&
    /\d/.test(cellText(cells, cols[COL_LEVEL])) &&
    /\d/.test(cellText(cells, cols[COL_COST])) &&
    /\d+\s*[dhm]/.test(cellText(cells, cols[COL_DURATION]))
  );
}

/**
 * Slices a `SheetResponse` into a clean `TableData` with our canonical
 * 5-column header.
 *
 * `cols` maps each canonical header onto a source column index. It need not
 * be contiguous — eEcon uses [6,7,8,9,12] because its % gain column is
 * separated from the rest (see the top-of-file "Hardcoded COLUMNS" note).
 *
 * Scanning runs to the end of the response rather than stopping at a fixed
 * row: every path tab holds one contiguous block of steps with nothing
 * beneath it, so there is no end marker to look for, and the paths have
 * already outgrown one hardcoded cap. Non-step rows are dropped by
 * `isDataRow`, which is why the preamble above the table and the direction
 * markers inside it never reach the output.
 *
 * Returns zero rows for a tab with no recognisable data — a wholly broken
 * upstream tab yields an empty category rather than a phantom one.
 */
export function extractTableData(
  response: SheetResponse,
  cols: ColumnMap = DEFAULT_COLS,
): TableData {
  const { rows } = response.table;
  const tableRows: string[][] = [];

  for (const row of rows) {
    if (tableRows.length >= MAX_DATA_ROWS) {
      console.warn(
        `extractTableData: hit the ${MAX_DATA_ROWS}-row cap; later rows were dropped.`,
      );
      break;
    }
    if (!isDataRow(row.c, cols)) continue;
    tableRows.push(cols.map((c) => cellText(row.c, c)));
  }

  return { headers: HEADERS, rows: tableRows };
}

/**
 * Internal descriptor for one logical sheet tab as the app sees it.
 * `cols` is optional — when omitted, `extractTableData` uses its default
 * map (the standard [5,6,7,8,9] columns).
 */
interface SheetTab {
  key: string;
  label: string;
  sheetId: string;
  tab: string;
  cols?: ColumnMap;
}

/**
 * Builds the list of logical tabs we need given which spreadsheets are
 * configured. Either ID can be null (the user may have only configured one
 * of the two sheets).
 *
 * The "regen" entry deliberately reuses `tab: "eHP"` — regen data lives in
 * extra columns of the eHP tab in the Effective Paths sheet — which is why
 * `fetchAndCacheAll` deduplicates fetches by (sheetId, tab).
 *
 * Note: `label` is currently unused at runtime — labels are owned by the
 * UI (Planner.tsx#TYPE_DISPLAY, TableGrid.tsx#TYPE_LABELS). Kept here for
 * documentation / future reuse.
 */
export function getSheetTabs(
  effectivePathsId: string | null,
  modulesId: string | null,
): SheetTab[] {
  const tabs: SheetTab[] = [];
  if (effectivePathsId) {
    tabs.push(
      { key: "eHP", label: "eHP", sheetId: effectivePathsId, tab: "eHP" },
      // regen reuses the eHP tab but slices a different column range.
      { key: "regen", label: "Regen", sheetId: effectivePathsId, tab: "eHP", cols: [27, 28, 29, 30, 31] },
      { key: "eDamage", label: "eDamage", sheetId: effectivePathsId, tab: "eDamage" },
      // eEcon's v28.0 layout ("The Effective Avg. CPK Time Path") shifted
      // the table one column right vs. eHP/eDamage and inserted
      // "Recommended Coin/H" (col 10) and "Time to farm Cost" (col 11)
      // between Duration and the % gain column — hence the gap to 12.
      { key: "eEcon", label: "eEcon", sheetId: effectivePathsId, tab: "eEcon", cols: [6, 7, 8, 9, 12] },
    );
  }
  if (modulesId) {
    tabs.push(
      { key: "shardPath", label: "Shard Path", sheetId: modulesId, tab: "Shard Path" },
    );
  }
  return tabs;
}

/**
 * Fetches every needed tab in parallel, caches results, and returns a map
 * keyed by logical sheet key (eHP/regen/eDamage/eEcon/shardPath).
 *
 * Fetch-deduplication: tabs are grouped by `<sheetId>:<tab>` so two logical
 * keys that share the same physical tab (eHP and regen) only trigger one
 * network round-trip. Within a group, each tab's `cols` list is applied
 * independently to the shared response.
 *
 * Side effects:
 *   - Writes each derived TableData to localStorage via `setCached`.
 *   - Stamps the cache with `EXTRACT_VERSION`, which is what makes the
 *     entries trustworthy to `loadFromCache` on the next launch.
 *   - Writes the global last-sync timestamp via `setLastSync`.
 *
 * A tab that yields zero rows is cached as an empty table and warned about
 * rather than treated as an error: gviz answers `status: "ok"` both when a
 * tab's formulas are broken AND when the tab name doesn't resolve (it quietly
 * returns the document's first sheet), so there's nothing to distinguish
 * those from a legitimately empty path. The warning is the only signal.
 */
export async function fetchAndCacheAll(
  effectivePathsId: string | null,
  modulesId: string | null,
): Promise<Record<string, TableData>> {
  const tabs = getSheetTabs(effectivePathsId, modulesId);
  const results: Record<string, TableData> = {};

  // Group by physical tab so we only fetch each one once.
  const fetchGroups = new Map<string, { tabs: SheetTab[] }>();
  for (const tab of tabs) {
    const fetchKey = `${tab.sheetId}:${tab.tab}`;
    if (!fetchGroups.has(fetchKey)) {
      fetchGroups.set(fetchKey, { tabs: [] });
    }
    fetchGroups.get(fetchKey)!.tabs.push(tab);
  }

  await Promise.all(
    Array.from(fetchGroups.values()).map(async (group) => {
      // All tabs in this group share the same fetch — use the first one's
      // (sheetId, tab) to drive the request.
      const first = group.tabs[0];
      const response = await fetchSheet(first.sheetId, first.tab);
      // Slice the shared response into one TableData per logical key.
      for (const tab of group.tabs) {
        const data = extractTableData(response, tab.cols);
        if (data.rows.length === 0) {
          console.warn(
            `"${tab.tab}" produced no usable rows for "${tab.key}". The tab may have been renamed, or its formulas may be erroring.`,
          );
        }
        setCached(tab.key, data);
        results[tab.key] = data;
      }
    }),
  );

  setExtractVersion(EXTRACT_VERSION);
  setLastSync(Date.now());
  return results;
}

/**
 * Tries to assemble the full sheet map from cache alone (no network).
 *
 * Returns null in three cases:
 *   1. Neither sheet is configured (nothing to load).
 *   2. The cache was written by a different extractor version, so its row
 *      alignment and completeness no longer match what this build expects.
 *   3. ANY required cache entry is missing — we want all-or-nothing so the
 *      UI doesn't render half-stale data; callers (App.tsx) treat null as
 *      "no cache, please fetch".
 *
 * Case 2 is why there is no separate migration step: a stale cache is simply
 * not trusted, and the refetch it triggers overwrites it. Nothing has to be
 * deleted, and the check sits next to the extractor whose output it guards.
 *
 * Used on initial load: if the cache is complete, we render instantly and
 * skip the spinner. Otherwise the app falls through to `fetchAndCacheAll`.
 */
export function loadFromCache(
  effectivePathsId: string | null,
  modulesId: string | null,
): Record<string, TableData> | null {
  // Determine which keys we *expect* given which sheets are configured.
  const keys: string[] = [];
  if (effectivePathsId) keys.push("eHP", "regen", "eDamage", "eEcon");
  if (modulesId) keys.push("shardPath");
  if (keys.length === 0) return null;

  if (getExtractVersion() !== EXTRACT_VERSION) return null;

  const results: Record<string, TableData> = {};
  for (const key of keys) {
    const cached = getCached(key);
    // All-or-nothing: any missing entry means we should fetch fresh.
    if (!cached) return null;
    results[key] = cached.data;
  }

  return results;
}
