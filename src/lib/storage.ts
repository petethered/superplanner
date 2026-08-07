// =============================================================================
// storage.ts — thin localStorage adapter for all persisted state.
//
// All persisted keys are prefixed with `sp_` (legacy "SuperPlanner" prefix —
// kept stable so users who configured the app pre-1.0 don't lose their
// settings on rename). DO NOT change these prefixes without writing a
// migration step in App.tsx.
//
// Persisted keys:
//   - `sp_urls`                — JSON-serialized SheetUrls
//   - `sp_last_sync`           — number (Date.now()) of most recent sync
//   - `sp_cache_<sheet-key>`   — JSON-serialized CachedSheet, one per sheet
//                                tab (eHP / regen / eDamage / eEcon /
//                                shardPath)
//   - `sp_extract_version`     — number; which extractor wrote the cache above
//   - `sp_planner_config`      — written by Planner.tsx, NOT this module
//
// `sp_extract_version` deliberately does NOT use the `sp_cache_` prefix, so
// that `clearAllCache` (which sweeps that prefix) can't wipe it as a side
// effect of the very migration that sets it.
//
// All getters return `null` when the key is absent so callers can branch on
// presence without a try/catch around JSON.parse. We do NOT defensively
// handle malformed JSON — we trust our own writes. If a user ever pastes
// garbage into localStorage, they'll get a runtime crash; that's an
// acceptable cost for keeping this layer small.
// =============================================================================

import type { CachedSheet, SheetUrls, TableData } from "./types";

// Centralized key registry. The CACHE entry is a *prefix*; concrete cache
// entries are formed by appending the sheet key, e.g. `sp_cache_eHP`.
const KEYS = {
  URLS: "sp_urls",
  LAST_SYNC: "sp_last_sync",
  CACHE: "sp_cache_",
  EXTRACT_VERSION: "sp_extract_version",
} as const;

/** Returns the user's stored sheet URLs, or null if they've never configured. */
export function getUrls(): SheetUrls | null {
  const raw = localStorage.getItem(KEYS.URLS);
  return raw ? JSON.parse(raw) : null;
}

/** Persists sheet URLs. Caller is responsible for clearing the cache when
 *  URLs change (otherwise stale data from the previous sheets would be
 *  shown — see App.tsx#handleSaveUrls which does this). */
export function setUrls(urls: SheetUrls): void {
  localStorage.setItem(KEYS.URLS, JSON.stringify(urls));
}

/** Reads one cached sheet by its key (e.g. "eHP", "regen"). Returns null if
 *  the entry is missing — used by `loadFromCache` in sheets.ts to decide
 *  whether to bootstrap from cache or trigger a fresh fetch. */
export function getCached(key: string): CachedSheet | null {
  const raw = localStorage.getItem(KEYS.CACHE + key);
  return raw ? JSON.parse(raw) : null;
}

/** Writes one cached sheet. Adds a current timestamp; the timestamp is
 *  per-sheet but in practice the global `sp_last_sync` is what's displayed. */
export function setCached(key: string, data: TableData): void {
  const entry: CachedSheet = { timestamp: Date.now(), data };
  localStorage.setItem(KEYS.CACHE + key, JSON.stringify(entry));
}

/**
 * Returns the extractor version that last wrote the cache, or null for caches
 * written before this key existed (which is every cache predating the August
 * 2026 row-discovery rewrite).
 *
 * Read by `loadFromCache` in sheets.ts: a mismatch means the cached tables
 * were sliced by an older `extractTableData` and may be misaligned or
 * truncated, so they aren't trusted. See `EXTRACT_VERSION` in sheets.ts.
 */
export function getExtractVersion(): number | null {
  const raw = localStorage.getItem(KEYS.EXTRACT_VERSION);
  return raw ? Number(raw) : null;
}

/** Stamps the cache with the extractor version that wrote it. Called by
 *  `fetchAndCacheAll` after a successful sync. */
export function setExtractVersion(version: number): void {
  localStorage.setItem(KEYS.EXTRACT_VERSION, String(version));
}

/** Returns the most-recent sync timestamp (epoch ms), or null if never
 *  synced. Drives the "LAST SYNC: Xm ago" label in the footer and the
 *  amber stale indicator in the navbar (when older than SIX_HOURS). */
export function getLastSync(): number | null {
  const raw = localStorage.getItem(KEYS.LAST_SYNC);
  return raw ? Number(raw) : null;
}

/** Updates the global last-sync timestamp. Called by `fetchAndCacheAll`
 *  after a successful fetch round. */
export function setLastSync(timestamp: number): void {
  localStorage.setItem(KEYS.LAST_SYNC, String(timestamp));
}

/**
 * Wipes all `sp_cache_*` entries plus the last-sync marker.
 *
 * Used when:
 *   1. The user changes sheet URLs (App.tsx#handleSaveUrls) — the previous
 *      sheets' data is now meaningless.
 *   2. (Future) we ever need a full reset.
 *
 * Note: this iterates `localStorage.length` and collects keys before
 * removing them, because `removeItem` shifts indices and would skip entries
 * if removed during iteration.
 *
 * Deliberately does NOT touch `sp_extract_version` — that key records which
 * extractor shape the cache uses, not the cache's contents, and it is stamped
 * again by the next `fetchAndCacheAll` anyway. This is exactly why the key
 * avoids the `sp_cache_` prefix that the sweep below matches on; if you ever
 * broaden that prefix to `sp_`, `loadFromCache` starts rejecting every cache.
 */
export function clearAllCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEYS.CACHE)) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem(KEYS.LAST_SYNC);
}

/**
 * Pulls the spreadsheet ID out of a Google Sheets URL.
 *
 * Accepts both edit URLs ("/spreadsheets/d/<id>/edit?...") and gviz URLs
 * ("/spreadsheets/d/<id>/gviz/tq?..."). Returns null when the input doesn't
 * look like a Google Sheets URL — used by SetupPage and SettingsModal to
 * validate input, and by App.tsx to derive the IDs needed by `fetchSheet`.
 *
 * The character class allows ASCII letters, digits, underscore, and dash —
 * the full set Google uses for sheet IDs.
 */
export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
