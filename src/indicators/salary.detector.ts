import type { StressIndicator, Transaction } from "../domain/types.js";
import { getDayOfMonth, matchesKeyword, median, SIGNAL_TYPES } from "./utils.js";

const SALARY_KEYWORDS = [
  "salary",
  "salaire",
  "payroll",
  "wages",
  "راتب",
  "مرتب",
] as const;

const LATE_SALARY_THRESHOLD_DAYS = 7;

export function detectLateSalaryPayments(
  transactions: Transaction[],
): StressIndicator | null {
  const salaryTransactions = transactions.filter((transaction) =>
    matchesKeyword(transaction.description, SALARY_KEYWORDS),
  );

  if (salaryTransactions.length === 0) {
    return null;
  }

  const expectedDay = median(
    salaryTransactions.map((transaction) => getDayOfMonth(transaction.date)),
  );

  const latePayments = salaryTransactions.filter((transaction) => {
    const deviation = Math.abs(getDayOfMonth(transaction.date) - expectedDay);
    return deviation > LATE_SALARY_THRESHOLD_DAYS;
  });

  const occurrences = latePayments.length;

  if (occurrences === 0) {
    return null;
  }

  const severity =
    occurrences >= 3 ? "high" : occurrences === 2 ? "medium" : "low";

  return {
    type: SIGNAL_TYPES.LATE_SALARY,
    severity,
    occurrences,
    message: `${occurrences} late salary payment(s) detected (expected day ${expectedDay}, threshold > ${LATE_SALARY_THRESHOLD_DAYS} days).`,
  };
}
