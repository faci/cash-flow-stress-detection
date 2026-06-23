import type { MonthlyTimelineEntry, StressIndicator } from "../domain/types.js";
import { SIGNAL_TYPES } from "./utils.js";

export function detectNegativeCashflow(
  timeline: MonthlyTimelineEntry[],
): StressIndicator | null {
  const negativeMonths = timeline.filter((entry) => entry.net_flow < 0);
  const occurrences = negativeMonths.length;

  if (occurrences === 0) {
    return null;
  }

  const severity =
    occurrences >= 3 ? "high" : occurrences === 2 ? "medium" : "low";

  return {
    type: SIGNAL_TYPES.NEGATIVE_CASHFLOW,
    severity,
    occurrences,
    message: `${occurrences} month(s) with negative net cashflow detected (${negativeMonths.map((entry) => entry.month).join(", ")}).`,
  };
}
