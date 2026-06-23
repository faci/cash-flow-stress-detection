import { describe, expect, it } from "vitest";
import type { Transaction } from "../domain/transaction.js";
import { computeMonthlyTimeline } from "../timeline/monthly-timeline.js";

function transaction(
  overrides: Partial<Transaction> & Pick<Transaction, "date" | "type" | "amount">,
): Transaction {
  return {
    id: overrides.id ?? "tx-1",
    description: overrides.description ?? "Test",
    balanceAfter: overrides.balanceAfter,
    ...overrides,
  };
}

describe("computeMonthlyTimeline", () => {
  it("returns an empty timeline for no transactions", () => {
    expect(computeMonthlyTimeline([])).toEqual([]);
  });

  it("aggregates a single month", () => {
    const result = computeMonthlyTimeline([
      transaction({
        id: "1",
        date: new Date("2024-01-05T00:00:00.000Z"),
        type: "credit",
        amount: { amount: 5000, currency: "AED" },
        balanceAfter: { amount: 5000, currency: "AED" },
      }),
      transaction({
        id: "2",
        date: new Date("2024-01-12T00:00:00.000Z"),
        type: "debit",
        amount: { amount: 150, currency: "AED" },
        balanceAfter: { amount: 4850, currency: "AED" },
      }),
    ]);

    expect(result).toEqual([
      {
        month: "2024-01",
        inflows: 5000,
        outflows: 150,
        net_flow: 4850,
        end_of_month_balance: 4850,
      },
    ]);
  });

  it("sorts months ascending and aggregates across months", () => {
    const result = computeMonthlyTimeline([
      transaction({
        id: "2",
        date: new Date("2024-02-01T00:00:00.000Z"),
        type: "credit",
        amount: { amount: 1000, currency: "AED" },
        balanceAfter: { amount: 5850, currency: "AED" },
      }),
      transaction({
        id: "1",
        date: new Date("2024-01-20T00:00:00.000Z"),
        type: "credit",
        amount: { amount: 4850, currency: "AED" },
        balanceAfter: { amount: 4850, currency: "AED" },
      }),
    ]);

    expect(result).toEqual([
      {
        month: "2024-01",
        inflows: 4850,
        outflows: 0,
        net_flow: 4850,
        end_of_month_balance: 4850,
      },
      {
        month: "2024-02",
        inflows: 1000,
        outflows: 0,
        net_flow: 1000,
        end_of_month_balance: 5850,
      },
    ]);
  });

  it("uses running sum fallback when balanceAfter is absent", () => {
    const result = computeMonthlyTimeline([
      transaction({
        id: "1",
        date: new Date("2024-03-10T00:00:00.000Z"),
        type: "credit",
        amount: { amount: 200, currency: "AED" },
      }),
      transaction({
        id: "2",
        date: new Date("2024-03-15T00:00:00.000Z"),
        type: "debit",
        amount: { amount: 50, currency: "AED" },
      }),
    ]);

    expect(result[0].end_of_month_balance).toBe(150);
    expect(result[0].net_flow).toBe(150);
  });

  it("uses the last balanceAfter within a month when present", () => {
    const result = computeMonthlyTimeline([
      transaction({
        id: "1",
        date: new Date("2024-04-01T00:00:00.000Z"),
        type: "credit",
        amount: { amount: 100, currency: "AED" },
        balanceAfter: { amount: 100, currency: "AED" },
      }),
      transaction({
        id: "2",
        date: new Date("2024-04-20T00:00:00.000Z"),
        type: "debit",
        amount: { amount: 30, currency: "AED" },
        balanceAfter: { amount: 70, currency: "AED" },
      }),
    ]);

    expect(result[0].end_of_month_balance).toBe(70);
  });
});
