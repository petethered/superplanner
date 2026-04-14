import { describe, it, expect } from "vitest";
import {
  parseCost,
  parseDuration,
  parseGain,
  parseLevel,
  parseLabSteps,
} from "../planner";
import type { TableData } from "../types";

describe("parseCost", () => {
  it("parses billions", () => {
    expect(parseCost("69.58 B")).toBeCloseTo(69.58e9);
  });

  it("parses trillions", () => {
    expect(parseCost("944.9 T")).toBeCloseTo(944.9e12);
  });

  it("parses quadrillions", () => {
    expect(parseCost("1.12 q")).toBeCloseTo(1.12e15, -2);
  });

  it("parses quintillions", () => {
    expect(parseCost("2.5 Q")).toBeCloseTo(2.5e18);
  });

  it("returns 0 for empty string", () => {
    expect(parseCost("")).toBe(0);
  });
});

describe("parseDuration", () => {
  it("parses days, hours, and minutes", () => {
    expect(parseDuration("2d 15h 14m")).toBeCloseTo(63.233, 1);
  });

  it("parses zero days", () => {
    expect(parseDuration("0d 18h  9m")).toBeCloseTo(18.15);
  });

  it("parses days only", () => {
    expect(parseDuration("3d  0h  0m")).toBe(72);
  });

  it("returns 0 for empty string", () => {
    expect(parseDuration("")).toBe(0);
  });
});

describe("parseGain", () => {
  it("parses gain with space-separated decimals", () => {
    expect(parseGain("16.455 638%")).toBeCloseTo(16.455638);
  });

  it("parses small gain", () => {
    expect(parseGain("0.174 697%")).toBeCloseTo(0.174697);
  });

  it("returns 0 for empty string", () => {
    expect(parseGain("")).toBe(0);
  });
});

describe("parseLevel", () => {
  it("extracts level number", () => {
    expect(parseLevel("lvl 5")).toBe(5);
  });

  it("extracts double-digit level", () => {
    expect(parseLevel("lvl 42")).toBe(42);
  });

  it("returns 0 for empty string", () => {
    expect(parseLevel("")).toBe(0);
  });
});

describe("parseLabSteps", () => {
  it("converts table rows to LabStep array", () => {
    const data: TableData = {
      headers: ["LAB", "LEVEL", "COST", "DURATION", "% GAIN"],
      rows: [
        ["Recovery Package", "lvl 1", "944.9 T", "1d 18h 9m", "16.455 638%"],
        ["Recovery Package", "lvl 2", "1.12 q", "2d 15h 14m", "8.510 146%"],
      ],
    };
    const steps = parseLabSteps("eHP", data);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      type: "eHP",
      lab: "Recovery Package",
      level: 1,
    });
    expect(steps[0].cost).toBeCloseTo(944.9e12);
    expect(steps[0].durationHours).toBeCloseTo(42.15);
    expect(steps[0].gainPerDay).toBeCloseTo(16.455638);
    expect(steps[1].level).toBe(2);
  });

  it("skips rows with empty lab name", () => {
    const data: TableData = {
      headers: ["LAB", "LEVEL", "COST", "DURATION", "% GAIN"],
      rows: [
        ["Lab A", "lvl 1", "100 T", "1d 0h 0m", "5%"],
        ["", "", "", "", ""],
      ],
    };
    const steps = parseLabSteps("eHP", data);
    expect(steps).toHaveLength(1);
  });
});
