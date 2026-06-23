import type { MonthlyTimelineEntry, StressIndicator } from "../domain/types.js";
import { maxConsecutiveMatch, SIGNAL_TYPES } from "./utils.js";

const LOW_BALANCE_RATIO = 0.1;

export function detectSustainedLowBalance(
  timeline: MonthlyTimelineEntry[],
): StressIndicator | null {
  if (timeline.length === 0) {
    return null;
  }

  const averageBalance =
    timeline.reduce((sum, entry) => sum + entry.end_of_month_balance, 0) /
    timeline.length;
  const threshold = averageBalance * LOW_BALANCE_RATIO;
  const breachingMonths = timeline.filter(
    (entry) => entry.end_of_month_balance < threshold,
  );

  if (breachingMonths.length === 0) {
    return null;
  }

  const consecutiveBreaches = maxConsecutiveMatch(
    timeline,
    (entry) => entry.end_of_month_balance < threshold,
  );
  const severity =
    consecutiveBreaches >= 3
      ? "high"
      : consecutiveBreaches === 2
        ? "medium"
        : "low";

  return {
    type: SIGNAL_TYPES.SUSTAINED_LOW_BALANCE,
    severity,
    occurrences: breachingMonths.length,
    message: `${breachingMonths.length} month(s) with end-of-month balance below 10% of average (${threshold.toFixed(2)}).`,
  };
}
