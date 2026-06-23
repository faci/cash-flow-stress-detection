import type { MonthlyTimelineEntry, StressIndicator } from "../domain/types.js";
import { maxConsecutiveDecline, SIGNAL_TYPES } from "./utils.js";

const MIN_DECLINING_MONTHS = 3;

export function detectDecliningBalanceTrend(
  timeline: MonthlyTimelineEntry[],
): StressIndicator | null {
  if (timeline.length < MIN_DECLINING_MONTHS) {
    return null;
  }

  const balances = timeline.map((entry) => entry.end_of_month_balance);
  const consecutiveDecliningMonths = maxConsecutiveDecline(balances);

  if (consecutiveDecliningMonths < MIN_DECLINING_MONTHS) {
    return null;
  }

  return {
    type: SIGNAL_TYPES.DECLINING_TREND,
    severity: consecutiveDecliningMonths >= 4 ? "high" : "medium",
    occurrences: consecutiveDecliningMonths,
    message: `${consecutiveDecliningMonths} consecutive month(s) of declining end-of-month balance detected.`,
  };
}
