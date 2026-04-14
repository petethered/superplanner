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

export interface LabStep {
  type: string;
  lab: string;
  level: number;
  cost: number;
  durationHours: number;
  gainPerDay: number;
}

export interface PlannerConfig {
  enabledTypes: string[];
  dailyIncome: number;
  dailyIncomeSuffix: string;
  dailyIncomeValue: number;
  minDays: number;
}

export interface PlannedStep {
  labStep: LabStep;
  startHour: number;
  poolAtStart: number;
  idleHoursBefore: number;
}

export interface SlotPlan {
  steps: PlannedStep[];
}

export interface SimulationResult {
  slots: SlotPlan[];
  finalDailyIncome: number;
}
