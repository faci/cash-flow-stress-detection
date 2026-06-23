import type { MonthlyTimelineEntry, StressIndicator } from "../domain/types.js";

export function detectSustainedLowBalance(
  _timeline: MonthlyTimelineEntry[],
): StressIndicator | null {
  throw new Error("Not implemented");
}
