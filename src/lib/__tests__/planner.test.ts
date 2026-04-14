import { describe, it, expect } from "vitest";
import {
  parseCost,
  parseDuration,
  parseGain,
  parseLevel,
  parseLabSteps,
  runSimulation,
} from "../planner";
import type { LabStep, TableData } from "../types";

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

function step(
  type: string,
  lab: string,
  level: number,
  cost: number,
  durationHours: number,
  gainPerDay: number,
): LabStep {
  return { type, lab, level, cost, durationHours, gainPerDay };
}

describe("runSimulation", () => {
  it("assigns highest gain labs to 3 slots", () => {
    const steps = [
      step("eHP", "A", 1, 100, 24, 5),
      step("eHP", "B", 1, 100, 24, 4),
      step("eHP", "C", 1, 100, 24, 3),
      step("eHP", "D", 1, 100, 24, 2),
    ];
    const { slots } = runSimulation(steps, 1000, 1);
    const firstLabs = slots.map((s) => s.steps[0]?.labStep.lab).sort();
    expect(firstLabs).toEqual(["A", "B", "C"]);
  });

  it("respects budget — picks cheap lab when expensive is unaffordable", () => {
    const steps = [
      step("eHP", "Expensive", 1, 2000, 24, 10),
      step("eHP", "Cheap", 1, 100, 24, 5),
    ];
    const { slots } = runSimulation(steps, 500, 1);
    const assigned = slots.flatMap((s) => s.steps.map((p) => p.labStep.lab));
    expect(assigned[0]).toBe("Cheap");
  });

  it("enforces level ordering within a lab", () => {
    const steps = [
      step("eHP", "A", 1, 100, 2, 10),
      step("eHP", "A", 2, 100, 2, 9),
    ];
    const { slots } = runSimulation(steps, 1000, 1);
    const aSteps = slots
      .flatMap((s) => s.steps)
      .filter((p) => p.labStep.lab === "A")
      .sort((a, b) => a.startHour - b.startHour);
    expect(aSteps[0].labStep.level).toBe(1);
    expect(aSteps[1].labStep.level).toBe(2);
    expect(aSteps[1].startHour).toBeGreaterThanOrEqual(
      aSteps[0].startHour + aSteps[0].labStep.durationHours,
    );
  });

  it("prevents same lab running in multiple slots simultaneously", () => {
    const steps = [
      step("eHP", "A", 1, 100, 48, 10),
      step("eHP", "A", 2, 100, 24, 9),
      step("eHP", "B", 1, 100, 24, 5),
    ];
    const { slots } = runSimulation(steps, 1000, 1);
    expect(slots[0].steps[0].labStep.lab).toBe("A");
    expect(slots[1].steps[0].labStep.lab).toBe("B");
  });

  it("accumulates income to afford expensive labs", () => {
    const steps = [
      step("eHP", "A", 1, 500, 24, 10),
    ];
    const { slots } = runSimulation(steps, 200, 1);
    const allPlanned = slots.flatMap((s) => s.steps);
    expect(allPlanned).toHaveLength(1);
    expect(allPlanned[0].startHour).toBeGreaterThan(0);
  });

  it("prefers shorter duration when gain is equal", () => {
    const steps = [
      step("eHP", "Slow", 1, 100, 48, 5),
      step("eHP", "Fast", 1, 100, 12, 5),
    ];
    const { slots } = runSimulation(steps, 1000, 1);
    expect(slots[0].steps[0].labStep.lab).toBe("Fast");
  });

  it("fills slots for at least minDays", () => {
    const steps = [
      step("eHP", "A", 1, 100, 72, 5),
      step("eHP", "B", 1, 100, 72, 4),
      step("eHP", "C", 1, 100, 72, 3),
      step("eHP", "A", 2, 100, 72, 2),
      step("eHP", "B", 2, 100, 72, 1),
      step("eHP", "C", 2, 100, 72, 0.5),
    ];
    const { slots } = runSimulation(steps, 1000, 5);
    for (const slot of slots) {
      const endHour = slot.steps.length > 0
        ? slot.steps[slot.steps.length - 1].startHour + slot.steps[slot.steps.length - 1].labStep.durationHours
        : 0;
      expect(endHour).toBeGreaterThanOrEqual(5 * 24);
    }
  });

  it("increases income when eECON labs complete", () => {
    const steps = [
      step("eECON", "Econ A", 1, 100, 24, 10),
    ];
    const result = runSimulation(steps, 1000, 1);
    // 10% per day * 1 day = 10% gain, so income should increase
    expect(result.finalDailyIncome).toBeGreaterThan(1000);
  });
});
