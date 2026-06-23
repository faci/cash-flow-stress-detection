import { describe, expect, it } from "vitest";
import type { Transaction } from "../domain/transaction.js";
import type { MonthlyTimelineEntry } from "../domain/types.js";
import { detectBouncedPayments } from "../indicators/bounced.detector.js";
import { detectNegativeCashflow } from "../indicators/cashflow.detector.js";
import { detectHighOutflowConcentration } from "../indicators/concentration.detector.js";
import { detectStressIndicators } from "../indicators/index.js";
import { detectSustainedLowBalance } from "../indicators/low-balance.detector.js";
import { detectLateSalaryPayments } from "../indicators/salary.detector.js";
import { detectDecliningBalanceTrend } from "../indicators/trend.detector.js";
import { SIGNAL_TYPES } from "../indicators/utils.js";

function transaction(
  overrides: Partial<Transaction> & Pick<Transaction, "date" | "type" | "amount">,
): Transaction {
  return {
    id: overrides.id ?? "tx-1",
    description: overrides.description ?? "Test",
    ...overrides,
  };
}

function timelineEntry(
  overrides: Partial<MonthlyTimelineEntry> & Pick<MonthlyTimelineEntry, "month">,
): MonthlyTimelineEntry {
  return {
    inflows: 0,
    outflows: 0,
    net_flow: 0,
    end_of_month_balance: 0,
    ...overrides,
  };
}

describe("bounced payments", () => {
  it('detects "RETURN CHEQUÉ"', () => {
    const indicator = detectBouncedPayments([
      transaction({
        date: new Date("2024-01-01T00:00:00.000Z"),
        type: "debit",
        amount: { amount: 100, currency: "AED" },
        description: "RETURN CHEQUÉ",
      }),
    ]);

    expect(indicator?.type).toBe(SIGNAL_TYPES.BOUNCED_PAYMENT);
    expect(indicator?.occurrences).toBe(1);
  });

  it('detects Arabic keyword "مرتجع"', () => {
    const indicator = detectBouncedPayments([
      transaction({
        date: new Date("2024-01-01T00:00:00.000Z"),
        type: "debit",
        amount: { amount: 100, currency: "AED" },
        description: "مرتجع",
      }),
    ]);

    expect(indicator?.type).toBe(SIGNAL_TYPES.BOUNCED_PAYMENT);
  });
});

describe("negative cashflow", () => {
  it("detects months with negative net flow", () => {
    const indicator = detectNegativeCashflow([
      timelineEntry({ month: "2024-01", net_flow: -200 }),
      timelineEntry({ month: "2024-02", net_flow: 100 }),
    ]);

    expect(indicator?.type).toBe(SIGNAL_TYPES.NEGATIVE_CASHFLOW);
    expect(indicator?.occurrences).toBe(1);
    expect(indicator?.severity).toBe("low");
  });
});

describe("late salary", () => {
  it("flags late salary on day 12 when expected day is 3", () => {
    const indicator = detectLateSalaryPayments([
      transaction({
        id: "1",
        date: new Date("2024-01-01T00:00:00.000Z"),
        type: "credit",
        amount: { amount: 5000, currency: "AED" },
        description: "Salary payment",
      }),
      transaction({
        id: "2",
        date: new Date("2024-02-12T00:00:00.000Z"),
        type: "credit",
        amount: { amount: 5000, currency: "AED" },
        description: "Salary payment",
      }),
      transaction({
        id: "3",
        date: new Date("2024-03-03T00:00:00.000Z"),
        type: "credit",
        amount: { amount: 5000, currency: "AED" },
        description: "Salary payment",
      }),
    ]);

    expect(indicator?.type).toBe(SIGNAL_TYPES.LATE_SALARY);
    expect(indicator?.occurrences).toBe(1);
  });

  it("omits signal when no salary transactions exist", () => {
    expect(
      detectLateSalaryPayments([
        transaction({
          date: new Date("2024-01-01T00:00:00.000Z"),
          type: "credit",
          amount: { amount: 100, currency: "AED" },
          description: "Client payment",
        }),
      ]),
    ).toBeNull();
  });
});

describe("sustained low balance", () => {
  it("flags balance below 10% of average", () => {
    const indicator = detectSustainedLowBalance([
      timelineEntry({ month: "2024-01", end_of_month_balance: 10_000 }),
      timelineEntry({ month: "2024-02", end_of_month_balance: 10_000 }),
      timelineEntry({ month: "2024-03", end_of_month_balance: 500 }),
    ]);

    expect(indicator?.type).toBe(SIGNAL_TYPES.SUSTAINED_LOW_BALANCE);
    expect(indicator?.occurrences).toBe(1);
    expect(indicator?.severity).toBe("low");
  });
});

describe("declining balance trend", () => {
  it("flags high severity for 4 consecutive declining months", () => {
    const indicator = detectDecliningBalanceTrend([
      timelineEntry({ month: "2024-01", end_of_month_balance: 4000 }),
      timelineEntry({ month: "2024-02", end_of_month_balance: 3000 }),
      timelineEntry({ month: "2024-03", end_of_month_balance: 2000 }),
      timelineEntry({ month: "2024-04", end_of_month_balance: 1000 }),
    ]);

    expect(indicator?.type).toBe(SIGNAL_TYPES.DECLINING_TREND);
    expect(indicator?.severity).toBe("high");
    expect(indicator?.occurrences).toBe(4);
  });
});

describe("high outflow concentration", () => {
  it("flags when one counterparty exceeds 60% of monthly outflows", () => {
    const indicator = detectHighOutflowConcentration([
      transaction({
        id: "1",
        date: new Date("2024-01-05T00:00:00.000Z"),
        type: "debit",
        amount: { amount: 700, currency: "AED" },
        description: "Supplier A",
      }),
      transaction({
        id: "2",
        date: new Date("2024-01-10T00:00:00.000Z"),
        type: "debit",
        amount: { amount: 300, currency: "AED" },
        description: "Supplier B",
      }),
    ]);

    expect(indicator?.type).toBe(SIGNAL_TYPES.HIGH_CONCENTRATION);
    expect(indicator?.severity).toBe("medium");
    expect(indicator?.occurrences).toBe(1);
  });
});

describe("detectStressIndicators", () => {
  it("returns structured indicators without computing score", () => {
    const transactions = [
      transaction({
        date: new Date("2024-01-01T00:00:00.000Z"),
        type: "debit",
        amount: { amount: 100, currency: "AED" },
        description: "RETURN CHEQUÉ",
      }),
    ];
    const timeline = [
      timelineEntry({ month: "2024-01", net_flow: -100, end_of_month_balance: 900 }),
    ];

    const indicators = detectStressIndicators(transactions, timeline);

    expect(indicators.length).toBeGreaterThan(0);
    expect(indicators.every((indicator) => "score" in indicator === false)).toBe(
      true,
    );
  });
});
