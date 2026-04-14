import { useState } from "react";
import { ClipboardList } from "lucide-react";
import type { SheetUrls } from "../lib/types";
import { extractSheetId } from "../lib/storage";

interface SetupPageProps {
  onSave: (urls: SheetUrls) => void;
}

export function SetupPage({ onSave }: SetupPageProps) {
  const [effectivePaths, setEffectivePaths] = useState("");
  const [modules, setModules] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!extractSheetId(effectivePaths)) {
      setError("Invalid Effective Paths URL. Must be a Google Sheets link.");
      return;
    }
    if (!extractSheetId(modules)) {
      setError("Invalid Modules URL. Must be a Google Sheets link.");
      return;
    }
    onSave({ effectivePaths, modules });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full">
        <div className="flex items-center gap-3 mb-2">
          <ClipboardList className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">SuperPlanner</h1>
        </div>
        <p className="text-gray-600 mb-6">
          Enter your Google Sheets URLs to get started. Both sheets must be
          shared with &ldquo;Anyone with the link&rdquo; viewer access.
        </p>
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
              placeholder="https://docs.google.com/spreadsheets/d/..."
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
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Get Started
          </button>
        </form>
      </div>
    </div>
  );
}
