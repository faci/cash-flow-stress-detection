export const SIGNAL_TYPES = {
  BOUNCED_PAYMENT: "bounced_payment",
  NEGATIVE_CASHFLOW: "negative_cashflow",
  LATE_SALARY: "late_salary",
  SUSTAINED_LOW_BALANCE: "sustained_low_balance",
  DECLINING_TREND: "declining_trend",
  HIGH_CONCENTRATION: "high_concentration",
} as const;

export function formatMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getDayOfMonth(date: Date): number {
  return date.getUTCDate();
}

export function normalizeCounterparty(description: string): string {
  return description.trim().toLowerCase();
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

export function maxConsecutiveMatch<T>(
  items: T[],
  predicate: (item: T) => boolean,
): number {
  let longest = 0;
  let current = 0;

  for (const item of items) {
    if (predicate(item)) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return longest;
}

export function maxConsecutiveDecline(
  balances: number[],
): number {
  if (balances.length < 2) {
    return 1;
  }

  let longest = 1;
  let current = 1;

  for (let index = 1; index < balances.length; index++) {
    if (balances[index] < balances[index - 1]) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

export function matchesKeyword(
  text: string,
  keywords: readonly string[],
): boolean {
  const normalized = text.toLowerCase();

  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}
