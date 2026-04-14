import { RefreshCw, Settings, Crosshair } from "lucide-react";

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
    <nav className="bg-slate-900/90 backdrop-blur-sm border-b border-slate-700/50 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Crosshair className="w-5 h-5 text-cyan-400" />
          <h1 className="font-display text-base font-bold tracking-[0.2em] text-cyan-50 uppercase">
            SuperPlanner
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onSync}
            disabled={loading}
            className={`p-2 rounded transition-all ${
              isStale
                ? "text-amber-400 stale-glow"
                : "text-slate-400 hover:text-cyan-400 hover:bg-slate-800"
            } disabled:opacity-40`}
            title="Resync data"
          >
            <RefreshCw className={`w-4.5 h-4.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-all"
            title="Settings"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
