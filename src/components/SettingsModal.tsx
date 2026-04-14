import { useState } from "react";
import { X, ExternalLink } from "lucide-react";
import type { SheetUrls } from "../lib/types";
import { extractSheetId } from "../lib/storage";

interface SettingsModalProps {
  urls: SheetUrls;
  onSave: (urls: SheetUrls) => void;
  onClose: () => void;
}

export function SettingsModal({ urls, onSave, onClose }: SettingsModalProps) {
  const [effectivePaths, setEffectivePaths] = useState(urls.effectivePaths);
  const [modules, setModules] = useState(urls.modules);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!extractSheetId(effectivePaths)) {
      setError("Invalid Effective Paths URL");
      return;
    }
    if (!extractSheetId(modules)) {
      setError("Invalid Modules URL");
      return;
    }
    onSave({ effectivePaths, modules });
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="animate-fade-up bg-slate-900 border border-slate-700/50 rounded-lg shadow-2xl shadow-black/50 p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-sm font-bold tracking-widest uppercase text-cyan-50">
            Configuration
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-slate-500 mb-1.5">
              Effective Paths
            </label>
            <div className="flex gap-1.5">
              <input
                type="url"
                value={effectivePaths}
                onChange={(e) => {
                  setEffectivePaths(e.target.value);
                  setError("");
                }}
                className="flex-1 min-w-0 px-3 py-2.5 bg-slate-800/70 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors font-mono-data"
                required
              />
              {effectivePaths && (
                <button
                  type="button"
                  onClick={() => window.open(effectivePaths, "_blank")}
                  className="px-2.5 bg-slate-800/70 border border-slate-700 rounded text-slate-500 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-slate-500 mb-1.5">
              Modules
            </label>
            <div className="flex gap-1.5">
              <input
                type="url"
                value={modules}
                onChange={(e) => {
                  setModules(e.target.value);
                  setError("");
                }}
                className="flex-1 min-w-0 px-3 py-2.5 bg-slate-800/70 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors font-mono-data"
                required
              />
              {modules && (
                <button
                  type="button"
                  onClick={() => window.open(modules, "_blank")}
                  className="px-2.5 bg-slate-800/70 border border-slate-700 rounded text-slate-500 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {error && (
            <p className="text-red-400 text-xs font-mono-data">{error}</p>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 border border-slate-700 rounded hover:bg-slate-800 hover:text-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold tracking-wider uppercase bg-cyan-600 text-white rounded hover:bg-cyan-500 transition-all hover:shadow-lg hover:shadow-cyan-500/20"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
