// =============================================================================
// sheets.test.ts — covers `extractTableData` (the gviz response slicer) and
// `loadFromCache`'s extractor-version gate.
//
// We do NOT test `fetchSheet` here — that uses JSONP via real DOM script
// injection and would require a fairly involved network mock. It's
// effectively integration-tested by manual use against real spreadsheets.
//
// `makeSheet` builds a SheetResponse mirroring the real tabs' shape: a
// preamble (blank spacer, path title, column-header row, "↓ TIME PATH ↓"
// direction marker) followed by rows that look like real steps. Row offsets
// are no longer hardcoded in `extractTableData` — it recognises steps by
// shape — so what these tests vary is the preamble and the row content.
//
// Coverage map:
//   - headers        — always the canonical five, never the sheet's own
//   - row discovery  — preamble skipped at any length; header/title/marker
//                      rows rejected; reads past the old 100-row cap
//   - column maps    — default, contiguous custom (regen), non-contiguous
//                      (eEcon); unselected columns never leak
//   - cell reading   — `f` preferred over `v`, null cells, error literals
//   - degradation    — a wholly-errored tab yields zero rows, not phantoms
//   - version gate   — loadFromCache rejects a cache from another extractor
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  EXTRACT_VERSION,
  extractTableData,
  loadFromCache,
  type ColumnMap,
} from "../sheets";
import { setCached, setExtractVersion } from "../storage";
import type { SheetCell } from "../types";

// Wide enough to clear the regen slice's column 31 with a little headroom —
// the fixtures address columns as high as 31, so anything narrower would
// silently produce blank cells instead of the values under test.
const NUM_COLS = 35;

/** Wraps rows-of-cells in the gviz envelope, padding each row to NUM_COLS. */
function makeSheet(rows: SheetCell[][]) {
  return {
    version: "0.6",
    reqId: "0",
    status: "ok",
    table: {
      cols: Array.from({ length: NUM_COLS }, (_, i) => ({
        id: String(i),
        label: "",
        type: "string",
      })),
      rows: rows.map((r) => ({
        c: Array.from({ length: NUM_COLS }, (_, i) => r[i] ?? null),
      })),
    },
  };
}

/** Places `values` at `cols`, leaving every other column null. */
function at(cols: readonly number[], values: string[]): SheetCell[] {
  const row: SheetCell[] = [];
  cols.forEach((c, i) => {
    row[c] = { v: values[i] };
  });
  return row;
}

/** One realistic step row for the given column map. */
function dataRow(cols: ColumnMap, lab: string, level: number): SheetCell[] {
  return at(cols, [lab, `lvl ${level}`, "1.59 M", "1d 15h 52m", "0.319 478%"]);
}

// The column map used by eHP, eDamage and Shard Path — and the one
// `extractTableData` falls back to. Deliberately re-declared here rather than
// imported: if the extractor's default ever changed, the tests that omit the
// `cols` argument would build fixtures at 5-9 while the extractor read
// elsewhere, and they'd fail. That's the change-detection we want.
const EHP_COLS: ColumnMap = [5, 6, 7, 8, 9];

/**
 * The preamble every path tab opens with: a blank spacer, the path title
 * (which spills a long string into LAB but leaves the rest blank), the
 * column-header row, and the direction marker — which sits one column to the
 * LEFT of the table, i.e. outside `cols`, exactly as in the real sheets.
 */
function preamble(cols: ColumnMap): SheetCell[][] {
  return [
    [],
    at([cols[0]], ["The Effective Health Lab Path (v28) (Time focused)"]),
    at(cols, ["Lab", "", "Cost", "Duration", ""]),
    at([cols[0] - 1], ["↓ TIME PATH ↓"]),
  ];
}

/** Index of the first row after `preamble()` — keeps tests that patch a
 *  specific data cell from hardcoding the preamble's length. */
const FIRST_DATA_ROW = preamble(EHP_COLS).length;

describe("extractTableData", () => {
  it("uses hardcoded headers", () => {
    const data = extractTableData(
      makeSheet([...preamble(EHP_COLS), dataRow(EHP_COLS, "Armor", 1)]),
    );
    expect(data.headers).toEqual([
      "LAB",
      "LEVEL",
      "COST",
      "DURATION",
      "% GAIN",
    ]);
  });

  it("skips the preamble and starts at the first real data row", () => {
    const data = extractTableData(
      makeSheet([
        ...preamble(EHP_COLS),
        dataRow(EHP_COLS, "Wall Regen", 21),
        dataRow(EHP_COLS, "Health Regen", 64),
      ]),
    );
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0]).toEqual([
      "Wall Regen",
      "lvl 21",
      "1.59 M",
      "1d 15h 52m",
      "0.319 478%",
    ]);
    expect(data.rows[1][0]).toBe("Health Regen");
  });

  it("finds the data whatever the preamble's length", () => {
    // eHP/shardPath open with 4 preamble rows, eDamage/eEcon with 5. The old
    // hardcoded rowStart=3 could only ever serve one of those two shapes.
    for (const extra of [0, 1, 2, 7]) {
      const blanks: SheetCell[][] = Array.from({ length: extra }, () => []);
      const data = extractTableData(
        makeSheet([
          ...blanks,
          ...preamble(EHP_COLS),
          dataRow(EHP_COLS, "Wall Regen", 21),
        ]),
      );
      expect(data.rows).toHaveLength(1);
      expect(data.rows[0][0]).toBe("Wall Regen");
    }
  });

  it("does not mistake the column-header row for data", () => {
    // Shard Path's header row populates LAB *and* LEVEL ("Lab" / "Level"), so
    // a non-blank-LAB test alone would latch onto it.
    const data = extractTableData(
      makeSheet([
        at(EHP_COLS, ["Lab", "Level", "Cost", "Duration", "ROI / day"]),
        at([11], ["x1"]),
        dataRow(EHP_COLS, "Shatter Shards", 2),
      ]),
    );
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0][0]).toBe("Shatter Shards");
  });

  it("does not mistake a version-stamped header label for a duration", () => {
    // The upstream sheet stamps version numbers into adjacent text, so a mere
    // "contains a digit" test on DURATION would accept this row.
    const data = extractTableData(
      makeSheet([
        at(EHP_COLS, ["Lab", "Level 2", "Cost 3", "Duration (v28.0)", ""]),
        dataRow(EHP_COLS, "Shatter Shards", 2),
      ]),
    );
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0][0]).toBe("Shatter Shards");
  });

  it("reads past row 100 (paths have outgrown the old cap)", () => {
    const data = extractTableData(
      makeSheet([
        ...preamble(EHP_COLS),
        ...Array.from({ length: 145 }, (_, i) =>
          dataRow(EHP_COLS, "Critical Factor", i + 1),
        ),
      ]),
    );
    expect(data.rows).toHaveLength(145);
    expect(data.rows[144][1]).toBe("lvl 145");
  });

  it("uses formatted value (f) over raw value (v)", () => {
    const sheet = makeSheet([
      ...preamble(EHP_COLS),
      dataRow(EHP_COLS, "Armor", 1),
    ]);
    sheet.table.rows[FIRST_DATA_ROW].c[7] = { v: 1234.5, f: "1,234.50" };
    const data = extractTableData(sheet);
    expect(data.rows[0][2]).toBe("1,234.50");
  });

  it("handles null cells gracefully", () => {
    // % GAIN is the one column no predicate requires, so it can be null
    // without the row being rejected.
    const sheet = makeSheet([
      ...preamble(EHP_COLS),
      dataRow(EHP_COLS, "Armor", 1),
    ]);
    sheet.table.rows[FIRST_DATA_ROW].c[9] = null;
    const data = extractTableData(sheet);
    expect(data.rows[0][4]).toBe("");
  });

  it("extracts a custom contiguous column map (the regen slice)", () => {
    const cols: ColumnMap = [27, 28, 29, 30, 31];
    const data = extractTableData(
      makeSheet([...preamble(cols), dataRow(cols, "Wall Regen", 21)]),
      cols,
    );
    expect(data.rows[0][0]).toBe("Wall Regen");
    expect(data.rows[0][4]).toBe("0.319 478%");
  });

  it("extracts a non-contiguous column map (the eEcon v28.0 layout)", () => {
    // eEcon's % gain column (12) is separated from LAB/LEVEL/COST/DURATION
    // (6-9) by two unrelated columns — the map must be able to skip them.
    const cols: ColumnMap = [6, 7, 8, 9, 12];
    const sheet = makeSheet([
      ...preamble(cols),
      dataRow(cols, "Coins / Kill Bonus", 74),
    ]);
    // Columns 10 and 11 ("Recommended Coin/H", "Time to farm Cost") must not
    // leak into the output.
    sheet.table.rows[FIRST_DATA_ROW].c[10] = { v: "41.19 K/h" };
    sheet.table.rows[FIRST_DATA_ROW].c[11] = { v: "0d 16h 35m" };
    const data = extractTableData(sheet, cols);
    expect(data.rows[0]).toEqual([
      "Coins / Kill Bonus",
      "lvl 74",
      "1.59 M",
      "1d 15h 52m",
      "0.319 478%",
    ]);
  });

  it("drops direction-marker rows that appear inside the table", () => {
    // The marker carries "↓ STONE PATH ↓" in a column OUTSIDE the map, so
    // every selected cell is blank.
    const data = extractTableData(
      makeSheet([
        ...preamble(EHP_COLS),
        dataRow(EHP_COLS, "Armor", 1),
        at([EHP_COLS[0] - 1], ["↓ STONE PATH ↓"]),
        dataRow(EHP_COLS, "Armor", 2),
      ]),
    );
    expect(data.rows).toHaveLength(2);
    expect(data.rows.map((r) => r[1])).toEqual(["lvl 1", "lvl 2"]);
  });

  it("drops rows whose cost or duration is a formula error", () => {
    // These would otherwise parse to a FREE, INSTANT lab, which the simulator
    // ranks ahead of every real upgrade. The same predicate that locates the
    // table's start filters its body, so such a row can't slip in mid-table.
    const data = extractTableData(
      makeSheet([
        ...preamble(EHP_COLS),
        dataRow(EHP_COLS, "Shatter Shards", 2),
        at(EHP_COLS, ["Daily Mission Shards", "lvl 31", "#REF!", "1d 0h 0m", "1%"]),
        at(EHP_COLS, ["Daily Mission Shards", "lvl 32", "1 M", "#N/A", "1%"]),
        dataRow(EHP_COLS, "Shatter Shards", 3),
      ]),
    );
    expect(data.rows).toHaveLength(2);
    expect(data.rows.map((r) => r[1])).toEqual(["lvl 2", "lvl 3"]);
  });

  it("drops rows whose lab name is a formula error", () => {
    // The real break in the Modules sheet was a lab-name VLOOKUP failing, so
    // LAB alone was "#N/A" while the shape of the row was otherwise intact.
    const data = extractTableData(
      makeSheet([
        ...preamble(EHP_COLS),
        at(EHP_COLS, ["#N/A", "lvl 2", "73.95 T", "52d 8h 34m", "0.295 360%"]),
        dataRow(EHP_COLS, "Shatter Shards", 3),
      ]),
    );
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0][0]).toBe("Shatter Shards");
  });

  it("returns no rows when the whole tab is a formula error", () => {
    // The Shard Path tab was in exactly this state: preamble intact, every
    // data cell "#N/A". Better an empty category than 97 phantom labs.
    const data = extractTableData(
      makeSheet([
        ...preamble(EHP_COLS),
        ...Array.from({ length: 97 }, () =>
          at(EHP_COLS, ["#N/A", "#N/A", "#N/A", "#N/A", "#N/A"]),
        ),
      ]),
    );
    expect(data.rows).toEqual([]);
  });
});

describe("loadFromCache", () => {
  const SHEET_ID = "abc123";
  const KEYS = ["eHP", "regen", "eDamage", "eEcon"];

  beforeEach(() => {
    localStorage.clear();
  });

  function seedCache() {
    for (const key of KEYS) {
      setCached(key, { headers: [], rows: [["Armor", "lvl 1"]] });
    }
  }

  it("returns the cached tables when the version matches", () => {
    seedCache();
    setExtractVersion(EXTRACT_VERSION);
    const loaded = loadFromCache(SHEET_ID, null);
    expect(loaded && Object.keys(loaded).sort()).toEqual([...KEYS].sort());
  });

  it("rejects a cache written by a different extractor version", () => {
    seedCache();
    setExtractVersion(EXTRACT_VERSION - 1);
    expect(loadFromCache(SHEET_ID, null)).toBeNull();
  });

  it("rejects an unstamped cache (everything before the version existed)", () => {
    seedCache();
    expect(loadFromCache(SHEET_ID, null)).toBeNull();
  });

  it("returns null when a required entry is missing", () => {
    seedCache();
    setExtractVersion(EXTRACT_VERSION);
    // shardPath is required once a modules sheet is configured.
    expect(loadFromCache(SHEET_ID, "modules123")).toBeNull();
  });

  it("returns null when no sheet is configured", () => {
    expect(loadFromCache(null, null)).toBeNull();
  });
});
