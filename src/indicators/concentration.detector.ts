import type { StressIndicator, Transaction } from "../domain/types.js";
import { formatMonth, normalizeCounterparty, SIGNAL_TYPES } from "./utils.js";

const CONCENTRATION_THRESHOLD = 0.6;

export function detectHighOutflowConcentration(
  transactions: Transaction[],
): StressIndicator | null {
  const debitsByMonth = groupDebitsByMonth(transactions);
  let concentratedMonths = 0;

  for (const [, debits] of debitsByMonth) {
    const totalOutflows = debits.reduce(
      (sum, transaction) => sum + transaction.amount.amount,
      0,
    );

    if (totalOutflows === 0) {
      continue;
    }

    const outflowsByCounterparty = new Map<string, number>();

    for (const transaction of debits) {
      const counterparty = normalizeCounterparty(transaction.description);
      const current = outflowsByCounterparty.get(counterparty) ?? 0;
      outflowsByCounterparty.set(
        counterparty,
        current + transaction.amount.amount,
      );
    }

    const hasConcentration = [...outflowsByCounterparty.values()].some(
      (amount) => amount / totalOutflows > CONCENTRATION_THRESHOLD,
    );

    if (hasConcentration) {
      concentratedMonths++;
    }
  }

  if (concentratedMonths === 0) {
    return null;
  }

  return {
    type: SIGNAL_TYPES.HIGH_CONCENTRATION,
    severity: "medium",
    occurrences: concentratedMonths,
    message: `${concentratedMonths} month(s) where a single counterparty accounts for more than 60% of outflows.`,
  };
}

function groupDebitsByMonth(
  transactions: Transaction[],
): Map<string, Transaction[]> {
  const grouped = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (transaction.type !== "debit") {
      continue;
    }

    const month = formatMonth(transaction.date);
    const current = grouped.get(month) ?? [];
    current.push(transaction);
    grouped.set(month, current);
  }

  return grouped;
}
