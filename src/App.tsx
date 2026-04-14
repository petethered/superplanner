import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { SetupPage } from "./components/SetupPage";
import { Navbar } from "./components/Navbar";
import { SettingsModal } from "./components/SettingsModal";
import { TableGrid } from "./components/TableGrid";
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

  const effectivePathsId = urls ? extractSheetId(urls.effectivePaths) : null;
  const modulesId = urls ? extractSheetId(urls.modules) : null;
  const isStale = lastSync ? Date.now() - lastSync > SIX_HOURS : false;

  const handleSync = useCallback(async () => {
    if (!effectivePathsId || !modulesId) return;
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
  }, [effectivePathsId, modulesId]);

  useEffect(() => {
    if (!effectivePathsId || !modulesId) return;
    const cached = loadFromCache();
    if (cached) {
      setSheets(cached);
    } else {
      handleSync();
    }
  }, [effectivePathsId, modulesId, handleSync]);

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
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar
        onSync={handleSync}
        onOpenSettings={() => setSettingsOpen(true)}
        loading={loading}
        isStale={isStale}
      />
      <main className="flex-1">
        {loading && !sheets && (
          <div className="flex items-center justify-center gap-2 text-gray-500 p-12">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading sheets...</span>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={handleSync}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        )}
        {sheets && <TableGrid sheets={sheets} />}
      </main>
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
