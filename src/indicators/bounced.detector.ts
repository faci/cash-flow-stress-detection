import type { StressIndicator, Transaction } from "../domain/types.js";
import { matchesKeyword, SIGNAL_TYPES } from "./utils.js";

const BOUNCED_KEYWORDS = [
  "return",
  "bounce",
  "dishonour",
  "dishonor",
  "unpaid",
  "rejected",
  "ret",
  "r/d",
  "مرتجع",
] as const;

export function detectBouncedPayments(
  transactions: Transaction[],
): StressIndicator | null {
  const occurrences = transactions.filter((transaction) =>
    matchesKeyword(transaction.description, BOUNCED_KEYWORDS),
  ).length;

  if (occurrences === 0) {
    return null;
  }

  return {
    type: SIGNAL_TYPES.BOUNCED_PAYMENT,
    severity: occurrences >= 3 ? "high" : "medium",
    occurrences,
    message: `${occurrences} bounced or returned payment(s) detected in transaction descriptions.`,
  };
}
