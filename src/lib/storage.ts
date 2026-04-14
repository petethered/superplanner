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
