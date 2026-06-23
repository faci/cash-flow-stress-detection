import type { StressIndicator, Transaction } from "../domain/types.js";

export function detectBouncedPayments(
  _transactions: Transaction[],
): StressIndicator | null {
  throw new Error("Not implemented");
}
