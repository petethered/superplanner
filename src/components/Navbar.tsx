// =============================================================================
// Navbar.tsx — top bar with brand title, resync button, and settings button.
//
// The brand `<h1>` is mixed-case ("EffectivePathPlanner") deliberately —
// see the project CLAUDE.md / SEO commit. Do NOT add `uppercase` or wide
// `tracking-` here without re-thinking the layout; the long CamelCase name
// is wider than the legacy "SUPERPLANNER" all-caps form was.
//
// Mobile sizing: `text-xs lg:text-base` keeps the title legible on phones
// where the longer name would otherwise overflow next to the icons.
//
// The resync button picks up an amber "stale-glow" style when `isStale`
// is true — App.tsx defines this as "data older than 6h".
// =============================================================================

import { RefreshCw, Settings, Crosshair } from "lucide-react";

interface NavbarProps {
  /** Triggers a fresh fetch — wired to `App.handleSync`. */
  onSync: () => void;
  /** Opens the settings modal. */
  onOpenSettings: () => void;
  /** True while a fetch is in flight; disables the resync button and
   *  spins its icon. */
  loading: boolean;
  /** True when last sync is older than the staleness threshold. Adds an
   *  amber glow to draw attention to the resync button. */
  isStale: boolean;
}

export function Navbar({
  onSync,
  onOpenSettings,
  loading,
  isStale,
}: NavbarProps) {
  return (
    <nav className="bg-slate-900/90 border-b border-slate-700/50 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand cluster — Crosshair icon + wordmark */}
        <div className="flex items-center gap-2.5">
          <Crosshair className="w-5 h-5 text-cyan-400" />
          <h1 className="font-display text-xs lg:text-base font-bold tracking-[1px] text-cyan-50">
            EffectivePathPlanner
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
