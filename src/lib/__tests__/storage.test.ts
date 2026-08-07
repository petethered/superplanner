// =============================================================================
// storage.test.ts — covers the localStorage adapter.
//
// Each test starts with a clean localStorage via `beforeEach`. The vitest
// jsdom environment provides a real implementation, so this is a faithful
// round-trip test, not a mock.
//
// Coverage map:
//   - extractSheetId — edit URL, gviz URL, and rejection for non-sheets URLs
//   - URL storage    — null-when-empty, persistence round-trip
//   - cache          — null-when-empty, write+read with timestamp, and
//                      `clearAllCache` removes entries AND the lastSync
//   - extract version — null-when-empty, round-trip, and the invariant that
//                      `clearAllCache` must NOT sweep it
//   - last sync      — null-when-empty, persistence round-trip
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  getUrls,
  setUrls,
  getCached,
  setCached,
  getExtractVersion,
  setExtractVersion,
  getLastSync,
  setLastSync,
  clearAllCache,
  extractSheetId,
} from "../storage";

// Reset between tests — localStorage state would otherwise leak across
// tests via the shared jsdom global.
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

describe("extract version", () => {
  it("returns null when never stamped", () => {
    expect(getExtractVersion()).toBeNull();
  });

  it("stores and retrieves the version", () => {
    setExtractVersion(2);
    expect(getExtractVersion()).toBe(2);
  });

  it("survives clearAllCache", () => {
    // Load-bearing: `sp_extract_version` deliberately sits outside the
    // `sp_cache_` prefix that clearAllCache sweeps. If it were swept, every
    // URL change would leave loadFromCache rejecting the cache it had just
    // been handed, refetching on every single page load thereafter.
    setExtractVersion(2);
    setCached("a", { headers: [], rows: [] });
    clearAllCache();
    expect(getCached("a")).toBeNull();
    expect(getExtractVersion()).toBe(2);
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
