// =============================================================================
// SetupPage.tsx — first-run screen.
//
// Rendered by App.tsx when `getUrls()` returns null. Collects one or two
// Google Sheets URLs from the user, validates that each non-empty input
// looks like a real Google Sheets link (via `extractSheetId`), and hands
// the trimmed result to `onSave`. App.tsx then persists and the main UI
// takes over.
//
// Validation rules:
//   - At least one URL must be provided (either Effective Paths OR Modules).
//   - Any non-empty URL must contain a parseable sheet ID.
//   - Whitespace-only inputs are treated as empty.
//
// The user must share their sheets as "Anyone with the link" (Viewer)
// because we hit the gviz endpoint anonymously — see the helper text.
// =============================================================================

import { useState } from "react";
import { Crosshair } from "lucide-react";
import type { SheetUrls } from "../lib/types";
import { extractSheetId } from "../lib/storage";

interface SetupPageProps {
  /** Called with both URLs (already trimmed) once validation passes. */
  onSave: (urls: SheetUrls) => void;
}

export function SetupPage({ onSave }: SetupPageProps) {
  const [effectivePaths, setEffectivePaths] = useState("");
  const [modules, setModules] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasEP = effectivePaths.trim() !== "";
    const hasMod = modules.trim() !== "";
    // At least one URL is required — both blank is not a valid setup.
    if (!hasEP && !hasMod) {
      setError("At least one Google Sheets URL is required.");
      return;
    }
    // Each provided URL must parse to a real sheet ID.
    if (hasEP && !extractSheetId(effectivePaths)) {
      setError("Invalid Effective Paths URL. Must be a Google Sheets link.");
      return;
    }
    if (hasMod && !extractSheetId(modules)) {
      setError("Invalid Modules URL. Must be a Google Sheets link.");
      return;
    }
    onSave({ effectivePaths: effectivePaths.trim(), modules: modules.trim() });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="animate-fade-up border border-cyan-800/40 rounded-lg bg-slate-900/80 p-8 max-w-md w-full shadow-2xl shadow-cyan-950/30 card-shimmer">
        {/* Brand header — keep mixed-case "EffectivePathPlanner". The
            uppercase class was removed deliberately when we renamed away
            from "SuperPlanner". */}
        <div className="flex items-center gap-3 mb-1">
          <Crosshair className="w-7 h-7 text-cyan-400" />
          <h1 className="font-display text-xl font-bold tracking-tight text-cyan-50">
            EffectivePathPlanner
          </h1>
        </div>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          Connect your Google Sheets data sources. At least one URL is required.
          Sheets must be shared with &ldquo;Anyone with the link&rdquo; viewer
          access.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-slate-500 mb-1.5">
              Effective Paths
            </label>
            <input
              type="url"
              value={effectivePaths}
              onChange={(e) => {
                setEffectivePaths(e.target.value);
                // Clear any prior validation error as the user edits —
                // keeps the UI responsive without requiring resubmit.
                setError("");
              }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full px-3 py-2.5 bg-slate-800/70 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors font-mono-data"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-slate-500 mb-1.5">
              Modules
            </label>
            <input
              type="url"
              value={modules}
              onChange={(e) => {
                setModules(e.target.value);
                setError("");
              }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full px-3 py-2.5 bg-slate-800/70 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors font-mono-data"
            />
          </div>
          {error && (
            <p className="text-red-400 text-xs font-mono-data">{error}</p>
          )}
          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold tracking-widest uppercase rounded transition-all hover:shadow-lg hover:shadow-cyan-500/20"
          >
            Initialize
          </button>
        </form>
      </div>
    </div>
  );
}
