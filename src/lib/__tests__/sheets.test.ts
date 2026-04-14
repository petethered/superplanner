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
  it("uses hardcoded headers", () => {
    const response = makeResponse(12, 50);
    const data = extractTableData(response);
    expect(data.headers).toEqual([
      "LAB",
      "LEVEL",
      "COST",
      "DURATION",
      "% GAIN",
    ]);
  });

  it("extracts rows 4-44 (indices 3-43)", () => {
    const response = makeResponse(12, 50);
    const data = extractTableData(response);
    expect(data.rows).toHaveLength(41);
    expect(data.rows[0][0]).toBe("R3C5");
    expect(data.rows[40][0]).toBe("R43C5");
  });

  it("handles fewer rows than expected", () => {
    const response = makeResponse(12, 10);
    const data = extractTableData(response);
    expect(data.rows).toHaveLength(7); // rows at indices 3-9
  });

  it("uses formatted value (f) over raw value (v)", () => {
    const response = makeResponse(12, 5);
    response.table.rows[3].c[5] = { v: 1234.5, f: "1,234.50" };
    const data = extractTableData(response);
    expect(data.rows[0][0]).toBe("1,234.50");
  });

  it("handles null cells gracefully", () => {
    const response = makeResponse(12, 5);
    response.table.rows[3].c[5] = null;
    const data = extractTableData(response);
    expect(data.rows[0][0]).toBe("");
  });
});
