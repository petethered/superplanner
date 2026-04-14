# SuperPlanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React webapp that fetches Google Sheets data via JSONP, caches it in localStorage, and displays it in responsive tables.

**Architecture:** Pure client-side SPA using JSONP (`<script>` tag injection with `tqx=responseHandler:callback`) to bypass CORS — no backend needed. First-run setup collects two Google Sheets URLs. Data from 4 sheet tabs is fetched, parsed (columns F-K, rows 3-44), cached indefinitely in localStorage, and displayed in a responsive table grid. A resync button refreshes data manually and pulses red when cache is older than 6 hours.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS v4, Lucide React, Vitest

---

## File Structure

```
planner/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── index.css
│   ├── App.tsx
│   ├── lib/
│   │   ├── types.ts
│   │   ├── storage.ts
│   │   ├── sheets.ts
│   │   └── __tests__/
│   │       ├── storage.test.ts
│   │       └── sheets.test.ts
│   └── components/
│       ├── SetupPage.tsx
│       ├── Navbar.tsx
│       ├── SettingsModal.tsx
│       ├── SheetTable.tsx
│       ├── TableGrid.tsx
│       └── Footer.tsx
└── .github/
    └── workflows/
        └── deploy.yml
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `src/main.tsx`, `src/index.css`, `src/App.tsx`

- [ ] **Step 1: Scaffold Vite + React + TypeScript project**

```bash
cd /Users/peterazuolas/development/planner
rm -f index.mjs
rm -rf .cache
npm create vite@latest . -- --template react-ts
```

Select defaults if prompted. This creates the boilerplate files.

- [ ] **Step 2: Install Tailwind CSS v4 and Lucide React**

```bash
npm install
npm install tailwindcss @tailwindcss/vite lucide-react
```

- [ ] **Step 3: Install Vitest and testing dependencies**

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 4: Configure Vite with Tailwind and Vitest**

Replace `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/planner/",
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
```

- [ ] **Step 5: Set up Tailwind CSS entry point**

Replace `src/index.css` with:

```css
@import "tailwindcss";
```

- [ ] **Step 6: Set up minimal App component**

Replace `src/App.tsx` with:

```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <h1 className="text-2xl font-bold text-gray-900">SuperPlanner</h1>
    </div>
  );
}
```

Replace `src/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Verify dev server runs**

```bash
npm run dev
```

Expected: Browser at `http://localhost:5173/planner/` shows "SuperPlanner" heading with gray background.

- [ ] **Step 8: Verify tests run**

```bash
npx vitest run
```

Expected: No test files found (passes with no errors).

- [ ] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "scaffold: vite + react + tailwind + lucide + vitest"
```

---

### Task 2: Types + Storage Utilities

**Files:**
- Create: `src/lib/types.ts`, `src/lib/storage.ts`, `src/lib/__tests__/storage.test.ts`

- [ ] **Step 1: Write storage tests**

Create `src/lib/__tests__/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  getUrls,
  setUrls,
  getCached,
  setCached,
  getLastSync,
  setLastSync,
  clearAllCache,
  extractSheetId,
} from "../storage";

beforeEach(() => {
  localStorage.clear();
});

describe("extractSheetId", () => {
  it("extracts ID from edit URL", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/1TXW11q8R0f83XO-nIDfnogVr-dsJ3VJQf-SB4vq_xow/edit?usp=sharing";
    expect(extractSheetId(url)).toBe(
      "1TXW11q8R0f83XO-nIDfnogVr-dsJ3VJQf-SB4vq_xow",
    );
  });

  it("extracts ID from gviz URL", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/abc123_-x/gviz/tq?tqx=out:json";
    expect(extractSheetId(url)).toBe("abc123_-x");
  });

  it("returns null for invalid URL", () => {
    expect(extractSheetId("https://example.com")).toBeNull();
    expect(extractSheetId("not a url")).toBeNull();
  });
});

describe("URL storage", () => {
  it("returns null when no URLs stored", () => {
    expect(getUrls()).toBeNull();
  });

  it("stores and retrieves URLs", () => {
    const urls = { effectivePaths: "https://a", modules: "https://b" };
    setUrls(urls);
    expect(getUrls()).toEqual(urls);
  });
});

describe("cache", () => {
  it("returns null for missing cache entry", () => {
    expect(getCached("test")).toBeNull();
  });

  it("stores and retrieves cached data with timestamp", () => {
    const data = { headers: ["A", "B"], rows: [["1", "2"]] };
    setCached("test", data);
    const cached = getCached("test");
    expect(cached?.data).toEqual(data);
    expect(cached?.timestamp).toBeGreaterThan(0);
  });

  it("clears all cache entries and last sync", () => {
    setCached("a", { headers: [], rows: [] });
    setCached("b", { headers: [], rows: [] });
    setLastSync(Date.now());
    clearAllCache();
    expect(getCached("a")).toBeNull();
    expect(getCached("b")).toBeNull();
    expect(getLastSync()).toBeNull();
  });
});

describe("last sync", () => {
  it("returns null when never synced", () => {
    expect(getLastSync()).toBeNull();
  });

  it("stores and retrieves sync timestamp", () => {
    const now = Date.now();
    setLastSync(now);
    expect(getLastSync()).toBe(now);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run
```

Expected: FAIL — cannot find module `../storage`.

- [ ] **Step 3: Create types**

Create `src/lib/types.ts`:

```ts
export interface SheetResponse {
  version: string;
  reqId: string;
  status: string;
  table: {
    cols: Array<{ id: string; label: string; type: string }>;
    rows: Array<{ c: Array<{ v: unknown; f?: string } | null> }>;
  };
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface CachedSheet {
  timestamp: number;
  data: TableData;
}

export interface SheetUrls {
  effectivePaths: string;
  modules: string;
}
```

- [ ] **Step 4: Implement storage utilities**

Create `src/lib/storage.ts`:

```ts
import type { CachedSheet, SheetUrls, TableData } from "./types";

const KEYS = {
  URLS: "sp_urls",
  LAST_SYNC: "sp_last_sync",
  CACHE: "sp_cache_",
} as const;

export function getUrls(): SheetUrls | null {
  const raw = localStorage.getItem(KEYS.URLS);
  return raw ? JSON.parse(raw) : null;
}

export function setUrls(urls: SheetUrls): void {
  localStorage.setItem(KEYS.URLS, JSON.stringify(urls));
}

export function getCached(key: string): CachedSheet | null {
  const raw = localStorage.getItem(KEYS.CACHE + key);
  return raw ? JSON.parse(raw) : null;
}

export function setCached(key: string, data: TableData): void {
  const entry: CachedSheet = { timestamp: Date.now(), data };
  localStorage.setItem(KEYS.CACHE + key, JSON.stringify(entry));
}

export function getLastSync(): number | null {
  const raw = localStorage.getItem(KEYS.LAST_SYNC);
  return raw ? Number(raw) : null;
}

export function setLastSync(timestamp: number): void {
  localStorage.setItem(KEYS.LAST_SYNC, String(timestamp));
}

export function clearAllCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEYS.CACHE)) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem(KEYS.LAST_SYNC);
}

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: All 9 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/storage.ts src/lib/__tests__/storage.test.ts
git commit -m "feat: add types and localStorage utilities with tests"
```

---

### Task 3: Sheet Fetching + Parsing

**Files:**
- Create: `src/lib/sheets.ts`, `src/lib/__tests__/sheets.test.ts`

- [ ] **Step 1: Write parsing tests**

Create `src/lib/__tests__/sheets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractTableData } from "../sheets";
import type { SheetResponse } from "../types";

function makeResponse(numCols: number, numRows: number): SheetResponse {
  const cols = Array.from({ length: numCols }, (_, i) => ({
    id: String.fromCharCode(65 + i),
    label: `Header ${String.fromCharCode(65 + i)}`,
    type: "string",
  }));

  const rows = Array.from({ length: numRows }, (_, r) => ({
    c: Array.from({ length: numCols }, (_, c) => ({ v: `R${r}C${c}` })),
  }));

  return {
    version: "0.6",
    reqId: "0",
    status: "ok",
    table: { cols, rows },
  };
}

describe("extractTableData", () => {
  it("extracts headers from columns F-K (indices 5-10)", () => {
    const response = makeResponse(12, 50);
    const data = extractTableData(response);
    expect(data.headers).toEqual([
      "Header F",
      "Header G",
      "Header H",
      "Header I",
      "Header J",
      "Header K",
    ]);
  });

  it("extracts rows 3-44 (indices 2-43)", () => {
    const response = makeResponse(12, 50);
    const data = extractTableData(response);
    expect(data.rows).toHaveLength(42);
    expect(data.rows[0][0]).toBe("R2C5");
    expect(data.rows[41][0]).toBe("R43C5");
  });

  it("handles fewer rows than expected", () => {
    const response = makeResponse(12, 10);
    const data = extractTableData(response);
    expect(data.rows).toHaveLength(8); // rows at indices 2-9
  });

  it("uses formatted value (f) over raw value (v)", () => {
    const response = makeResponse(12, 5);
    response.table.rows[2].c[5] = { v: 1234.5, f: "1,234.50" };
    const data = extractTableData(response);
    expect(data.rows[0][0]).toBe("1,234.50");
  });

  it("handles null cells gracefully", () => {
    const response = makeResponse(12, 5);
    response.table.rows[2].c[5] = null;
    const data = extractTableData(response);
    expect(data.rows[0][0]).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run
```

Expected: FAIL — cannot resolve `../sheets`.

- [ ] **Step 3: Implement sheet fetching and parsing**

Create `src/lib/sheets.ts`:

```ts
import type { SheetResponse, TableData } from "./types";
import { getCached, setCached, setLastSync } from "./storage";

export function fetchSheet(
  sheetId: string,
  tab: string,
): Promise<SheetResponse> {
  return new Promise((resolve, reject) => {
    const callbackName = `__sp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");

    const cleanup = () => {
      delete (window as Record<string, unknown>)[callbackName];
      script.remove();
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout loading sheet tab "${tab}"`));
    }, 15_000);

    (window as Record<string, unknown>)[callbackName] = (
      data: SheetResponse,
    ) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(`Failed to load sheet tab "${tab}"`));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callbackName}&sheet=${encodeURIComponent(tab)}`;
    document.body.appendChild(script);
  });
}

export function extractTableData(response: SheetResponse): TableData {
  const { cols, rows } = response.table;
  const colStart = 5; // F
  const colEnd = 10; // K
  const rowStart = 2; // row 3 (0-indexed)
  const rowEnd = 43; // row 44

  const headers: string[] = [];
  for (let c = colStart; c <= colEnd; c++) {
    headers.push(cols[c]?.label || `Col ${String.fromCharCode(65 + c)}`);
  }

  const tableRows: string[][] = [];
  for (let r = rowStart; r <= rowEnd && r < rows.length; r++) {
    const row = rows[r].c;
    const values: string[] = [];
    for (let c = colStart; c <= colEnd; c++) {
      const cell = row?.[c];
      values.push(cell?.f ?? String(cell?.v ?? ""));
    }
    tableRows.push(values);
  }

  return { headers, rows: tableRows };
}

interface SheetTab {
  key: string;
  label: string;
  sheetId: string;
  tab: string;
}

export function getSheetTabs(
  effectivePathsId: string,
  modulesId: string,
): SheetTab[] {
  return [
    {
      key: "shardPath",
      label: "Shard Path",
      sheetId: modulesId,
      tab: "Shard Path",
    },
    { key: "eHP", label: "eHP", sheetId: effectivePathsId, tab: "eHP" },
    {
      key: "eDamage",
      label: "eDamage",
      sheetId: effectivePathsId,
      tab: "eDamage",
    },
    { key: "eEcon", label: "eEcon", sheetId: effectivePathsId, tab: "eEcon" },
  ];
}

export async function fetchAndCacheAll(
  effectivePathsId: string,
  modulesId: string,
): Promise<Record<string, TableData>> {
  const tabs = getSheetTabs(effectivePathsId, modulesId);
  const results: Record<string, TableData> = {};

  await Promise.all(
    tabs.map(async ({ key, sheetId, tab }) => {
      const response = await fetchSheet(sheetId, tab);
      const data = extractTableData(response);
      setCached(key, data);
      results[key] = data;
    }),
  );

  setLastSync(Date.now());
  return results;
}

export function loadFromCache(): Record<string, TableData> | null {
  const keys = ["shardPath", "eHP", "eDamage", "eEcon"];
  const results: Record<string, TableData> = {};

  for (const key of keys) {
    const cached = getCached(key);
    if (!cached) return null;
    results[key] = cached.data;
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: All 14 tests PASS (9 storage + 5 sheets).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sheets.ts src/lib/__tests__/sheets.test.ts
git commit -m "feat: add JSONP sheet fetching and data extraction with tests"
```

---

### Task 4: App Shell + Setup Page

**Files:**
- Modify: `src/App.tsx`
- Create: `src/components/SetupPage.tsx`

- [ ] **Step 1: Create SetupPage component**

Create `src/components/SetupPage.tsx`:

```tsx
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
```

- [ ] **Step 2: Wire up App shell with conditional rendering**

Replace `src/App.tsx`:

```tsx
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
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Expected: App shows SetupPage with two URL inputs. Entering valid Google Sheets URLs and clicking "Get Started" transitions to the main view. Invalid URLs show an error.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/SetupPage.tsx
git commit -m "feat: add setup page and app shell with conditional routing"
```

---

### Task 5: Navbar + Settings Modal

**Files:**
- Create: `src/components/Navbar.tsx`, `src/components/SettingsModal.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Navbar component**

Create `src/components/Navbar.tsx`:

```tsx
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
```

- [ ] **Step 2: Create SettingsModal component**

Create `src/components/SettingsModal.tsx`:

```tsx
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
```

- [ ] **Step 3: Integrate Navbar and SettingsModal into App**

Replace `src/App.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { SetupPage } from "./components/SetupPage";
import { Navbar } from "./components/Navbar";
import { SettingsModal } from "./components/SettingsModal";
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
      <main className="flex-1 flex items-center justify-center p-6">
        {loading && (
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading sheets...</span>
          </div>
        )}
        {error && (
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={handleSync}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && sheets && (
          <p className="text-green-600">
            Data loaded! ({Object.keys(sheets).length} tables)
          </p>
        )}
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
```

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Expected: After setup, the main view shows the navbar with "SuperPlanner" title, a sync button, and a gear icon. Clicking the gear opens the settings modal. Clicking the sync button triggers a data fetch (spin animation). The sync button pulses red after 6 hours (testable by temporarily changing `SIX_HOURS` to `0`).

- [ ] **Step 5: Commit**

```bash
git add src/components/Navbar.tsx src/components/SettingsModal.tsx src/App.tsx
git commit -m "feat: add navbar with resync/settings and URL settings modal"
```

---

### Task 6: SheetTable + TableGrid

**Files:**
- Create: `src/components/SheetTable.tsx`, `src/components/TableGrid.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create SheetTable component**

Create `src/components/SheetTable.tsx`:

```tsx
import type { TableData } from "../lib/types";

interface SheetTableProps {
  title: string;
  data: TableData;
}

export function SheetTable({ title, data }: SheetTableProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <h2 className="px-4 py-3 bg-gray-50 font-semibold text-gray-800 border-b border-gray-200">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              {data.headers.map((header, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr
                key={ri}
                className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5 text-gray-700 whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create TableGrid component**

Create `src/components/TableGrid.tsx`:

```tsx
import { SheetTable } from "./SheetTable";
import type { TableData } from "../lib/types";

interface TableGridProps {
  sheets: Record<string, TableData>;
}

const TABLE_CONFIG = [
  { key: "shardPath", label: "Shard Path" },
  { key: "eHP", label: "eHP" },
  { key: "eDamage", label: "eDamage" },
  { key: "eEcon", label: "eEcon" },
];

export function TableGrid({ sheets }: TableGridProps) {
  return (
    <div className="flex flex-wrap gap-6 justify-center p-6 w-full">
      {TABLE_CONFIG.map(
        ({ key, label }) =>
          sheets[key] && (
            <div key={key} className="w-full max-w-[600px]">
              <SheetTable title={label} data={sheets[key]} />
            </div>
          ),
      )}
    </div>
  );
}
```

- [ ] **Step 3: Integrate TableGrid into App**

In `src/App.tsx`, add the import at the top:

```tsx
import { TableGrid } from "./components/TableGrid";
```

Replace the `<main>` section:

```tsx
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
```

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

Expected: After setup with valid URLs, 4 tables display in a responsive grid. Each table shows headers from columns F-K and 42 rows of data. Tables wrap to stack vertically on narrow viewports and sit side-by-side on wide ones. Each table is capped at 600px wide. Tables are horizontally scrollable if content overflows.

- [ ] **Step 5: Commit**

```bash
git add src/components/SheetTable.tsx src/components/TableGrid.tsx src/App.tsx
git commit -m "feat: add responsive table grid displaying all 4 sheet tabs"
```

---

### Task 7: Footer + Sync Pulse

**Files:**
- Create: `src/components/Footer.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Footer component**

Create `src/components/Footer.tsx`:

```tsx
import { useState, useEffect } from "react";

interface FooterProps {
  lastSync: number | null;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Footer({ lastSync }: FooterProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!lastSync) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [lastSync]);

  return (
    <footer className="border-t border-gray-200 bg-white px-4 py-3 text-center text-sm text-gray-500">
      {lastSync
        ? `Last synced: ${formatTimeAgo(lastSync)}`
        : "Not yet synced"}
    </footer>
  );
}
```

- [ ] **Step 2: Add Footer to App**

In `src/App.tsx`, add the import:

```tsx
import { Footer } from "./components/Footer";
```

Add `<Footer lastSync={lastSync} />` right before the closing `</div>` of the root element (after `</main>` and before the `{settingsOpen && ...}` block):

```tsx
      </main>
      <Footer lastSync={lastSync} />
      {settingsOpen && (
```

- [ ] **Step 3: Verify stale pulse behavior**

In the browser, open DevTools console and run:

```js
localStorage.setItem('sp_last_sync', String(Date.now() - 7 * 60 * 60 * 1000));
location.reload();
```

Expected: The sync button in the navbar pulses red. The footer shows "7h 0m ago".

- [ ] **Step 4: Commit**

```bash
git add src/components/Footer.tsx src/App.tsx
git commit -m "feat: add footer with last-synced time and 6h stale pulse"
```

---

### Task 8: GitHub Pages Deployment + Cleanup

**Files:**
- Create: `.github/workflows/deploy.yml`
- Delete: `index.mjs`, `.cache/` (if they still exist)

- [ ] **Step 1: Remove proof-of-concept files**

```bash
rm -f index.mjs
rm -rf .cache
```

- [ ] **Step 2: Clean up unused Vite boilerplate**

Remove any leftover files from the Vite template that are not needed (e.g. `src/App.css`, `src/assets/react.svg`, `public/vite.svg`). Check what exists first:

```bash
ls src/App.css src/assets/ public/ 2>/dev/null
```

Remove any that exist:

```bash
rm -f src/App.css public/vite.svg
rm -rf src/assets
```

- [ ] **Step 3: Create GitHub Actions deployment workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Add SPA fallback for GitHub Pages**

GitHub Pages doesn't support SPA routing natively. Create `public/404.html` to redirect all routes to `index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <script>
      // Redirect all 404s to index.html for SPA routing
      sessionStorage.setItem("redirect", location.href);
      location.replace(
        location.origin + "/planner/"
      );
    </script>
  </head>
</html>
```

- [ ] **Step 5: Verify production build works locally**

```bash
npm run build && npx vite preview
```

Expected: Preview server at `http://localhost:4173/planner/` shows the app working correctly.

- [ ] **Step 6: Run all tests one final time**

```bash
npx vitest run
```

Expected: All 14 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add github pages deployment, clean up boilerplate"
```

- [ ] **Step 8: Push to GitHub**

Create a repo on GitHub named `planner`, then:

```bash
git remote add origin git@github.com:<your-username>/planner.git
git branch -M main
git push -u origin main
```

Then enable GitHub Pages in the repo settings: **Settings > Pages > Source: GitHub Actions**.
