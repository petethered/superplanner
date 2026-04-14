import { RefreshCw, Settings } from "lucide-react";

interface NavbarProps {
  onSync: () => void;
  onOpenSettings: () => void;
  loading: boolean;
  isStale: boolean;
}

export function Navbar({
  onSync,
  onOpenSettings,
  loading,
  isStale,
}: NavbarProps) {
  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">SuperPlanner</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onSync}
            disabled={loading}
            className={`p-2 rounded-md transition-colors ${
              isStale
                ? "text-red-600 hover:bg-red-50 animate-pulse"
                : "text-gray-600 hover:bg-gray-100"
            } disabled:opacity-50`}
            title="Resync data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
