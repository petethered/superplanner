import { useState, useEffect, useCallback } from "react";
import { SetupPage } from "./components/SetupPage";
import {
  getUrls,
  setUrls,
  extractSheetId,
  getLastSync,
  clearAllCache,
} from "./lib/storage";
import { fetchAndCacheAll, loadFromCache } from "./lib/sheets";
import type { SheetUrls, TableData } from "./lib/types";

export default function App() {
  const [urls, setUrlsState] = useState<SheetUrls | null>(getUrls);
  const [sheets, setSheets] = useState<Record<string, TableData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSyncState] = useState<number | null>(getLastSync);

  const effectivePathsId = urls ? extractSheetId(urls.effectivePaths) : null;
  const modulesId = urls ? extractSheetId(urls.modules) : null;

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
  }

  if (!urls) {
    return <SetupPage onSave={handleSaveUrls} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-900">SuperPlanner</h1>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        {loading && <p className="text-gray-500">Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}
        {sheets && <p className="text-green-600">Data loaded! ({Object.keys(sheets).length} tables)</p>}
      </main>
    </div>
  );
}
