import type { MonthlyTimelineEntry, StressIndicator } from "../domain/types.js";
import type { Transaction } from "../domain/transaction.js";
import { detectBouncedPayments } from "./bounced.detector.js";
import { detectNegativeCashflow } from "./cashflow.detector.js";
import { detectHighOutflowConcentration } from "./concentration.detector.js";
import { detectSustainedLowBalance } from "./low-balance.detector.js";
import { detectLateSalaryPayments } from "./salary.detector.js";
import { detectDecliningBalanceTrend } from "./trend.detector.js";

export function detectStressIndicators(
  transactions: Transaction[],
  timeline: MonthlyTimelineEntry[],
): StressIndicator[] {
  const detectors = [
    detectBouncedPayments(transactions),
    detectNegativeCashflow(timeline),
    detectLateSalaryPayments(transactions),
    detectSustainedLowBalance(timeline),
    detectDecliningBalanceTrend(timeline),
    detectHighOutflowConcentration(transactions),
  ];

  return detectors.filter(
    (indicator): indicator is StressIndicator => indicator !== null,
  );
}

export { detectBouncedPayments } from "./bounced.detector.js";
export { detectNegativeCashflow } from "./cashflow.detector.js";
export { detectLateSalaryPayments } from "./salary.detector.js";
export { detectSustainedLowBalance } from "./low-balance.detector.js";
export { detectDecliningBalanceTrend } from "./trend.detector.js";
export { detectHighOutflowConcentration } from "./concentration.detector.js";
