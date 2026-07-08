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
// Hardcoded ranges:
//   `extractTableData` uses fixed row offsets (rowStart=3, rowEnd=100) and a
//   per-tab COLUMN LIST that matches the layout of the Effective Paths
//   spreadsheet. If the upstream sheet structure changes, the column lists
//   in `getSheetTabs` must change too. Current per-tab lists:
//     - eHP / eDamage: [5,6,7,8,9]   (the default — Lab, lvl, Cost,
//       Duration, %gain are contiguous)
//     - regen:         [27,28,29,30,31] (same shape, different slice of the
//       physical eHP tab)
//     - eEcon:         [6,7,8,9,12]  (the v28.0 "Avg. CPK Time Path" layout
//       shifted the table one column right and inserted "Recommended
//       Coin/H" (10) and "Time to farm Cost" (11) between Duration and the
//       % gain column, so the selection is NON-contiguous)
//   Column lists exist precisely because eEcon's % gain is no longer
//   adjacent to the other four columns — a start/end window can't express
//   that.
// =============================================================================

import type { SheetResponse, TableData } from "./types";
import { getCached, setCached, setLastSync } from "./storage";

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
    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callbackName}&sheet=${encodeURIComponent(tab)}`;
    document.body.appendChild(script);
  });
}

// Default column list: the LAB/LEVEL/COST/DURATION/% GAIN columns in the
// eHP and eDamage tabs, where all five are contiguous. Tabs whose layout
// differs (regen, eEcon) pass their own list via `getSheetTabs`.
const DEFAULT_COLS = [5, 6, 7, 8, 9];

/**
 * Slices a `SheetResponse` into a clean `TableData` with our canonical
 * 5-column header.
 *
 * Layout assumptions (DO NOT CHANGE without updating the spreadsheet too):
 *   - Header rows at indices 0..2 are skipped (titles, blank, sub-titles).
 *   - Data rows are at indices 3..min(rows.length-1, 100). (The eEcon tab's
 *     data actually starts at index 4 — its row 3 is blank in the selected
 *     columns and gets dropped by the empty-row filter below, so the shared
 *     rowStart=3 still works.)
 *   - `cols` is the ORDERED list of source column indices mapped onto the
 *     canonical headers, one per header. It need not be contiguous — eEcon
 *     uses [6,7,8,9,12] because its % gain column is separated from the
 *     rest (see top-of-file "Hardcoded ranges" note).
 *
 * Each cell prefers the formatted value `cell.f` (display string) over the
 * raw `cell.v` (numeric). This preserves the spreadsheet's intended
 * formatting (e.g. "16.455 638%") which our parsers in planner.ts know how
 * to handle.
 *
 * Empty rows (all cells blank) are dropped so the resulting table is dense.
 */
export function extractTableData(
  response: SheetResponse,
  cols: number[] = DEFAULT_COLS,
): TableData {
  const { rows } = response.table;
  const rowStart = 3;
  const rowEnd = 100;
  // Hardcoded headers — see top-of-file note. The spreadsheet's own header
  // row is unreliable across tabs.
  const headers = ["LAB", "LEVEL", "COST", "DURATION", "% GAIN"];
  const tableRows: string[][] = [];
  for (let r = rowStart; r <= rowEnd && r < rows.length; r++) {
    const row = rows[r].c;
    const values: string[] = [];
    for (const c of cols) {
      const cell = row?.[c];
      // Prefer formatted (`f`) over raw (`v`); fall back to "" for null cells.
      values.push(cell?.f ?? String(cell?.v ?? ""));
    }
    if (!values.every((v) => v === "")) {
      tableRows.push(values);
    }
  }
  return { headers, rows: tableRows };
}

/**
 * Internal descriptor for one logical sheet tab as the app sees it.
 * `cols` is optional — when omitted, `extractTableData` uses its default
 * list (the standard [5,6,7,8,9] columns). It is an ordered, possibly
 * non-contiguous list of source column indices, one per canonical header.
 */
interface SheetTab {
  key: string;
  label: string;
  sheetId: string;
  tab: string;
  cols?: number[];
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
 *   - Writes the global last-sync timestamp via `setLastSync`.
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
        setCached(tab.key, data);
        results[tab.key] = data;
      }
    }),
  );

  setLastSync(Date.now());
  return results;
}

/**
 * Tries to assemble the full sheet map from cache alone (no network).
 *
 * Returns null in three cases:
 *   1. Neither sheet is configured (nothing to load).
 *   2. ANY required cache entry is missing — we want all-or-nothing so the
 *      UI doesn't render half-stale data; callers (App.tsx) treat null as
 *      "no cache, please fetch".
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

  const results: Record<string, TableData> = {};
  for (const key of keys) {
    const cached = getCached(key);
    // All-or-nothing: any missing entry means we should fetch fresh.
    if (!cached) return null;
    results[key] = cached.data;
  }

  return results;
}
