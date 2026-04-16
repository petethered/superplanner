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
  clearAllCache,
} from "./lib/storage";
import { fetchAndCacheAll, loadFromCache } from "./lib/sheets";
import type { SheetUrls, TableData } from "./lib/types";

const SIX_HOURS = 6 * 60 * 60 * 1000;

export default function App() {
  const [urls, setUrlsState] = useState<SheetUrls | null>(getUrls);
  const [sheets, setSheets] = useState<Record<string, TableData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSyncState] = useState<number | null>(getLastSync);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const effectivePathsId = urls?.effectivePaths ? extractSheetId(urls.effectivePaths) : null;
  const modulesId = urls?.modules ? extractSheetId(urls.modules) : null;
  const hasAnySheet = !!(effectivePathsId || modulesId);
  const missingEffectivePaths = urls && !effectivePathsId;
  const missingModules = urls && !modulesId;
  const isStale = lastSync ? Date.now() - lastSync > SIX_HOURS : false;

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

  useEffect(() => {
    if (!hasAnySheet) return;
    const cached = loadFromCache(effectivePathsId, modulesId);
    if (cached) {
      setSheets(cached);
    } else {
      handleSync();
    }
  }, [effectivePathsId, modulesId, hasAnySheet, handleSync]);

  function handleSaveUrls(newUrls: SheetUrls) {
    setUrls(newUrls);
    setUrlsState(newUrls);
    clearAllCache();
    setSheets(null);
    setLastSyncState(null);
    setSettingsOpen(false);
  }

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
        {(missingEffectivePaths || missingModules) && (
          <div className="mx-6 mt-4 flex items-center gap-3 rounded border border-red-500/40 bg-red-950/40 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm text-red-300 flex-1">
              {missingEffectivePaths
                ? "Effective Paths URL not configured — eHP, regen, eDamage, and eEcon data unavailable."
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
