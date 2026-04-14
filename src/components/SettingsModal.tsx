import { useState } from "react";
import { X } from "lucide-react";
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Effective Paths Sheet
            </label>
            <input
              type="url"
              value={effectivePaths}
              onChange={(e) => {
                setEffectivePaths(e.target.value);
                setError("");
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Modules Sheet
            </label>
            <input
              type="url"
              value={modules}
              onChange={(e) => {
                setModules(e.target.value);
                setError("");
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
