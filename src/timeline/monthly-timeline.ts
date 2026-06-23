import type { MonthlyTimelineEntry } from "../domain/types.js";
import type { Transaction } from "../domain/transaction.js";

export function computeMonthlyTimeline(
  transactions: Transaction[],
): MonthlyTimelineEntry[] {
  if (transactions.length === 0) {
    return [];
  }

  const sorted = sortTransactions(transactions);
  const months = uniqueMonths(sorted);
  const aggregates = aggregateByMonth(sorted);
  const runningSumAtIndex = buildRunningSums(sorted);

  return months.map((month) => {
    const { inflows, outflows } = aggregates.get(month)!;
    const monthTransactions = sorted.filter(
      (transaction) => formatMonth(transaction.date) === month,
    );
    const lastIndex = sorted.indexOf(
      monthTransactions[monthTransactions.length - 1],
    );
    const lastWithBalance = [...monthTransactions]
      .reverse()
      .find((transaction) => transaction.balanceAfter !== undefined);

    const end_of_month_balance = lastWithBalance
      ? lastWithBalance.balanceAfter!.amount
      : runningSumAtIndex[lastIndex];

    return {
      month,
      inflows,
      outflows,
      net_flow: inflows - outflows,
      end_of_month_balance,
    };
  });
}

function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((left, right) => {
    const dateDiff = left.date.getTime() - right.date.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return left.id.localeCompare(right.id);
  });
}

function uniqueMonths(transactions: Transaction[]): string[] {
  const months = new Set(transactions.map((tx) => formatMonth(tx.date)));
  return [...months].sort();
}

function aggregateByMonth(
  transactions: Transaction[],
): Map<string, { inflows: number; outflows: number }> {
  const aggregates = new Map<string, { inflows: number; outflows: number }>();

  for (const transaction of transactions) {
    const month = formatMonth(transaction.date);
    const current = aggregates.get(month) ?? { inflows: 0, outflows: 0 };

    if (transaction.type === "credit") {
      current.inflows += transaction.amount.amount;
    } else {
      current.outflows += transaction.amount.amount;
    }

    aggregates.set(month, current);
  }

  return aggregates;
}

function buildRunningSums(transactions: Transaction[]): number[] {
  let runningSum = 0;

  return transactions.map((transaction) => {
    const delta =
      transaction.type === "credit"
        ? transaction.amount.amount
        : -transaction.amount.amount;
    runningSum += delta;
    return runningSum;
  });
}

function formatMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
