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
      delete (window as unknown as Record<string, unknown>)[callbackName];
      script.remove();
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout loading sheet tab "${tab}"`));
    }, 15_000);

    (window as unknown as Record<string, unknown>)[callbackName] = (
      data: SheetResponse,
    ) => {
      clearTimeout(timer);
      cleanup();
      if (data.status !== "ok" || !data.table) {
        const msg =
          (data as Record<string, unknown>).errors
            ? JSON.stringify((data as Record<string, unknown>).errors)
            : `Sheet returned status "${data.status}"`;
        reject(new Error(`Error loading "${tab}": ${msg}`));
        return;
      }
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
  const colEnd = 9; // J
  const rowStart = 3; // row 4 (0-indexed)
  const rowEnd = 43; // row 44

  const headers = ["LAB", "LEVEL", "COST", "DURATION", "% GAIN"];

  const tableRows: string[][] = [];
  for (let r = rowStart; r <= rowEnd && r < rows.length; r++) {
    const row = rows[r].c;
    const values: string[] = [];
    for (let c = colStart; c <= colEnd; c++) {
      const cell = row?.[c];
      values.push(cell?.f ?? String(cell?.v ?? ""));
    }
    if (!values.every((v) => v === "")) {
      tableRows.push(values);
    }
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
