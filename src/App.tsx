// =============================================================================
// App.tsx — top-level component and orchestrator.
//
// Responsibilities (in order of importance):
//   1. Decide whether to show the SetupPage (no URLs configured) or the main
//      planner UI (URLs are present, even partially).
//   2. Drive the data lifecycle: bootstrap from cache on mount, otherwise
//      trigger `fetchAndCacheAll`; expose `handleSync` for the navbar's
//      manual resync button.
//   3. Surface errors and "missing one of two URLs" warnings in-line.
//   4. Manage the SettingsModal open/closed state and apply URL changes
//      (which also clears cache so the next sync pulls fresh data).
//
// State map:
//   - urls          — SheetUrls or null. Persisted via storage.ts; null
//                     means "first-run, show SetupPage".
//   - sheets        — keyed map of TableData. Hydrated from cache or fetch.
//                     Null while loading on first launch.
//   - loading       — true during a sync operation. Drives the navbar
//                     spinner and the page-level "Loading..." state.
//   - error         — most recent sync error, displayed with retry buttons.
//   - lastSync      — epoch ms of most recent successful sync. Drives the
//                     footer label and the navbar "stale" amber glow.
//   - settingsOpen  — modal visibility.
//
// Note: the storage keys (sp_urls, sp_cache_*, sp_last_sync) use the legacy
// "sp_" prefix from the SuperPlanner naming era and MUST stay stable so
// existing users don't lose their config on rename/release. Don't rename
// without writing a migration step here.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, Settings } from "lucide-react";
import { SetupPage } from "./components/SetupPage";
import { Navbar } from "./components/Navbar";
import { SettingsModal } from "./components/SettingsModal";
import { TableGrid } from "./components/TableGrid";
import { Planner } from "./components/Planner";
import { Footer } from "./components/Footer";
import {
  getUrls,
  setUrls,
  extractSheetId,
  getLastSync,
  getCached,
  removeCached,
  clearAllCache,
} from "./lib/storage";
import { fetchAndCacheAll, loadFromCache } from "./lib/sheets";
import type { SheetUrls, TableData } from "./lib/types";

// ---------------------------------------------------------------------------
// One-shot cache migration, run at module load (before first render) so the
// bootstrap effect below sees a clean cache.
//
// eEcon v28.0 layout fix (July 2026): the upstream eEcon tab shifted one
// column right, so caches written by the old fixed 5–9 extraction window are
// misaligned garbage — every data row has a blank LAB cell (the lab names
// landed in the LEVEL column) and the only row with a non-blank LAB is the
// "↓ TIME PATH ↓" marker, which has a blank LEVEL. Detection: a HEALTHY
// eEcon cache has at least one row with BOTH LAB and LEVEL non-blank; a
// stale one has none. On detection we drop just the eEcon entry —
// `loadFromCache` is all-or-nothing, so one missing entry forces a full
// fresh fetch with the corrected column list. Idempotent: healthy caches
// (including the post-fix refetch) are never touched, so this block is safe
// to leave in place indefinitely.
// ---------------------------------------------------------------------------
(() => {
  const eEcon = getCached("eEcon");
  if (
    eEcon &&
    eEcon.data.rows.length > 0 &&
    !eEcon.data.rows.some((r) => r[0]?.trim() && r[1]?.trim())
  ) {
    removeCached("eEcon");
  }
})();

// Threshold for the "stale data" indicator in the Navbar. Anything older
// than this paints the resync button amber via `stale-glow`.
const SIX_HOURS = 6 * 60 * 60 * 1000;

export default function App() {
  // Initial state pulls from localStorage synchronously via the lazy
  // initializer form (`useState(getUrls)`), so we render the right view
  // (SetupPage vs. main app) on the very first paint with no flash.
  const [urls, setUrlsState] = useState<SheetUrls | null>(getUrls);
  const [sheets, setSheets] = useState<Record<string, TableData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSyncState] = useState<number | null>(getLastSync);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Derived: parsed sheet IDs and "is anything configured" flags.
  // `extractSheetId` returns null when the URL is empty or doesn't look
  // like a Google Sheets link — so `missingEffectivePaths` etc. distinguish
  // "user typed something garbage" from "user left it blank".
  const effectivePathsId = urls?.effectivePaths ? extractSheetId(urls.effectivePaths) : null;
  const modulesId = urls?.modules ? extractSheetId(urls.modules) : null;
  const hasAnySheet = !!(effectivePathsId || modulesId);
  const missingEffectivePaths = urls && !effectivePathsId;
  const missingModules = urls && !modulesId;
  const isStale = lastSync ? Date.now() - lastSync > SIX_HOURS : false;

  /**
   * Fetches all configured sheets from the network and updates state.
   * Called both on mount (when no cache is available) and from the
   * navbar's resync button. Errors are caught and stored in `error`
   * rather than thrown, so the UI can show a retry path.
   */
  const handleSync = useCallback(async () => {
    if (!hasAnySheet) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAndCacheAll(effectivePathsId, modulesId);
      setSheets(data);
      setLastSyncState(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }, [effectivePathsId, modulesId, hasAnySheet]);

  // Bootstrap: try cache first; if any required entry is missing, fall
  // through to a network fetch. Re-runs when sheet IDs change (i.e. user
  // edited URLs in the SettingsModal).
  useEffect(() => {
    if (!hasAnySheet) return;
    const cached = loadFromCache(effectivePathsId, modulesId);
    if (cached) {
      setSheets(cached);
    } else {
      handleSync();
    }
  }, [effectivePathsId, modulesId, hasAnySheet, handleSync]);

  /**
   * Persists new URLs and resets all derived data. We deliberately clear
   * cache and lastSync so the bootstrap effect above kicks in with a
   * fresh fetch — the previous sheets' data is meaningless against new
   * spreadsheets.
   */
  function handleSaveUrls(newUrls: SheetUrls) {
    setUrls(newUrls);
    setUrlsState(newUrls);
    clearAllCache();
    setSheets(null);
    setLastSyncState(null);
    setSettingsOpen(false);
  }

  // First-run: show the setup form until at least one URL is provided.
  if (!urls) {
    return <SetupPage onSave={handleSaveUrls} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        onSync={handleSync}
        onOpenSettings={() => setSettingsOpen(true)}
        loading={loading}
        isStale={isStale}
      />
      <main className="flex-1">
        {/* In-line warning when one (but not both) URL is missing. The
            SetupPage guarantees at least one URL exists, but a user could
            blank one out via the settings modal. */}
        {(missingEffectivePaths || missingModules) && (
          <div className="mx-6 mt-4 flex items-center gap-3 rounded border border-red-500/40 bg-red-950/40 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm text-red-300 flex-1">
              {missingEffectivePaths
                ? "Effective Paths URL not configured — eHP, Regen, eDamage, and eEcon data unavailable."
                : "Modules URL not configured — Shard Path data unavailable."}
            </span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 text-xs font-bold tracking-wider uppercase bg-red-500/20 text-red-300 border border-red-500/30 rounded hover:bg-red-500/30 hover:text-red-200 transition-all"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
          </div>
        )}
        {/* Initial-load spinner. Only shown when we have no cached data
            yet — manual resyncs use the navbar spinner instead. */}
        {loading && !sheets && (
          <div className="flex items-center justify-center gap-3 text-slate-500 p-16">
            <RefreshCw className="w-5 h-5 animate-spin text-cyan-500" />
            <span className="font-mono-data text-sm tracking-wide uppercase">
              Loading data...
            </span>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <p className="text-red-400 text-sm font-mono-data mb-4">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={handleSync}
                className="px-5 py-2 text-sm font-bold tracking-wider uppercase bg-cyan-600 text-white rounded hover:bg-cyan-500 transition-all"
              >
                Retry
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="px-5 py-2 text-sm font-bold tracking-wider uppercase text-slate-400 border border-slate-700 rounded hover:bg-slate-800 hover:text-slate-200 transition-all"
              >
                Edit URLs
              </button>
            </div>
          </div>
        )}
        {/* Main UI. Planner runs the simulator; TableGrid shows the raw
            tables with filtering. Both consume the same sheet map. */}
        {sheets && (
          <>
            <div className="px-6 pt-6">
              <Planner sheets={sheets} />
            </div>
            <TableGrid sheets={sheets} />
          </>
        )}
      </main>
      <Footer lastSync={lastSync} />
      {settingsOpen && (
        <SettingsModal
          urls={urls}
          onSave={handleSaveUrls}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
