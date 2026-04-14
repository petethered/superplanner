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
