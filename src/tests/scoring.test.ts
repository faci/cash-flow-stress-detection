import { describe, expect, it } from "vitest";
import type { StressIndicator } from "../domain/types.js";
import { SIGNAL_TYPES } from "../indicators/utils.js";
import { computeStressScore } from "../scoring/score.engine.js";

function indicator(type: string, occurrences: number): StressIndicator {
  return {
    type,
    severity: "low",
    occurrences,
    message: "test indicator",
  };
}

describe("computeStressScore", () => {
  it("returns score 0 for empty indicators", () => {
    const result = computeStressScore([], 6);

    expect(result.score).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it("scores 1 negative cashflow month as 8", () => {
    const result = computeStressScore(
      [indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 1)],
      6,
    );

    expect(result.score).toBe(8);
    expect(result.breakdown).toEqual([
      expect.objectContaining({
        type: SIGNAL_TYPES.NEGATIVE_CASHFLOW,
        occurrences: 1,
        effectiveOccurrences: 1,
        contribution: 8,
      }),
    ]);
  });

  it("scores 3 negative cashflow months as 24 (capped)", () => {
    const result = computeStressScore(
      [indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 3)],
      6,
    );

    expect(result.score).toBe(24);
    expect(result.breakdown[0].contribution).toBe(24);
  });

  it("scores 3 bounced payments as 25 (capped)", () => {
    const result = computeStressScore(
      [indicator(SIGNAL_TYPES.BOUNCED_PAYMENT, 3)],
      6,
    );

    expect(result.score).toBe(25);
    expect(result.breakdown[0].contribution).toBe(25);
  });

  it("scores 3 negative months and 3 bounces as 49", () => {
    const result = computeStressScore(
      [
        indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 3),
        indicator(SIGNAL_TYPES.BOUNCED_PAYMENT, 3),
      ],
      6,
    );

    expect(result.score).toBe(49);
    expect(result.breakdown).toHaveLength(2);
  });

  it("scores 100 when all signals reach their caps", () => {
    const result = computeStressScore(
      [
        indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 3),
        indicator(SIGNAL_TYPES.BOUNCED_PAYMENT, 3),
        indicator(SIGNAL_TYPES.SUSTAINED_LOW_BALANCE, 3),
        indicator(SIGNAL_TYPES.LATE_SALARY, 2),
        indicator(SIGNAL_TYPES.DECLINING_TREND, 2),
        indicator(SIGNAL_TYPES.HIGH_CONCENTRATION, 2),
      ],
      6,
    );

    expect(result.score).toBe(100);
    expect(result.breakdown.reduce((sum, entry) => sum + entry.contribution, 0)).toBe(100);
  });

  it("is deterministic for the same input", () => {
    const indicators = [
      indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 2),
      indicator(SIGNAL_TYPES.LATE_SALARY, 1),
    ];

    const first = computeStressScore(indicators, 6);
    const second = computeStressScore(indicators, 6);

    expect(first).toEqual(second);
  });

  it("normalizes occurrences when total months is below 6", () => {
    const result = computeStressScore(
      [indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 2)],
      2,
    );

    expect(result.breakdown[0].effectiveOccurrences).toBe(6);
    expect(result.score).toBe(24);
  });
});
