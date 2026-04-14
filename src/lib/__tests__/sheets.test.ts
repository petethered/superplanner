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
