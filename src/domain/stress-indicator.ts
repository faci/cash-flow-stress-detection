export type StressIndicatorSeverity = "low" | "medium" | "high";

export type StressIndicator = {
  type: string;
  severity: StressIndicatorSeverity;
  occurrences: number;
  message: string;
};
