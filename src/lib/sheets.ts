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
      reject(
        new Error(
          `Timed out loading "${tab}". Check that the sheet URL is correct and the sheet is shared with "Anyone with the link".`,
        ),
      );
    }, 30_000);

    (window as unknown as Record<string, unknown>)[callbackName] = (
      data: SheetResponse,
    ) => {
      clearTimeout(timer);
      cleanup();
      if (data.status !== "ok" || !data.table) {
        const errors = (data as Record<string, unknown>).errors as
          | Array<{ message?: string; detailed_message?: string }>
          | undefined;
        if (errors?.length) {
          const detail = errors[0].detailed_message || errors[0].message || "";
          reject(
            new Error(`"${tab}": ${detail}`),
          );
        } else {
          reject(
            new Error(
              `"${tab}" returned an error. Verify the tab name exists in the spreadsheet.`,
            ),
          );
        }
        return;
      }
      resolve(data);
    };

    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      reject(
        new Error(
          `Could not reach "${tab}". Check that the sheet URL is correct and the sheet is shared as "Anyone with the link" (Viewer).`,
        ),
      );
    };

    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callbackName}&sheet=${encodeURIComponent(tab)}`;
    document.body.appendChild(script);
  });
}

export function extractTableData(
  response: SheetResponse,
  colStart = 5,
  colEnd = 9,
): TableData {
  const { rows } = response.table;
  const rowStart = 3;
  const rowEnd = 100;
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
  colStart?: number;
  colEnd?: number;
}

export function getSheetTabs(
  effectivePathsId: string,
  modulesId: string,
): SheetTab[] {
  return [
    { key: "eHP", label: "eHP", sheetId: effectivePathsId, tab: "eHP" },
    { key: "regen", label: "regen", sheetId: effectivePathsId, tab: "eHP", colStart: 27, colEnd: 31 },
    { key: "eDamage", label: "eDamage", sheetId: effectivePathsId, tab: "eDamage" },
    { key: "eEcon", label: "eEcon", sheetId: effectivePathsId, tab: "eEcon" },
    { key: "shardPath", label: "Shard Path", sheetId: modulesId, tab: "Shard Path" },
  ];
}

export async function fetchAndCacheAll(
  effectivePathsId: string,
  modulesId: string,
): Promise<Record<string, TableData>> {
  const tabs = getSheetTabs(effectivePathsId, modulesId);
  const results: Record<string, TableData> = {};

  const fetchGroups = new Map<string, { tabs: SheetTab[] }>();
  for (const tab of tabs) {
    const fetchKey = `${tab.sheetId}:${tab.tab}`;
    if (!fetchGroups.has(fetchKey)) {
      fetchGroups.set(fetchKey, { tabs: [] });
    }
    fetchGroups.get(fetchKey)!.tabs.push(tab);
  }

  await Promise.all(
    Array.from(fetchGroups.values()).map(async (group) => {
      const first = group.tabs[0];
      const response = await fetchSheet(first.sheetId, first.tab);
      for (const tab of group.tabs) {
        const data = extractTableData(response, tab.colStart, tab.colEnd);
        setCached(tab.key, data);
        results[tab.key] = data;
      }
    }),
  );

  setLastSync(Date.now());
  return results;
}

export function loadFromCache(): Record<string, TableData> | null {
  const keys = ["eHP", "regen", "eDamage", "eEcon", "shardPath"];
  const results: Record<string, TableData> = {};

  for (const key of keys) {
    const cached = getCached(key);
    if (!cached) return null;
    results[key] = cached.data;
  }

  return results;
}
