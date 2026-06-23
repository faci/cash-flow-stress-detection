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
  describe("deterministic outputs", () => {
    it("returns the same score and breakdown for repeated calls", () => {
      const indicators = [
        indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 2),
        indicator(SIGNAL_TYPES.LATE_SALARY, 1),
      ];

      expect(computeStressScore(indicators, 6)).toEqual(
        computeStressScore(indicators, 6),
      );
    });

    it("returns the same result regardless of indicator input order", () => {
      const orderedA = [
        indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 3),
        indicator(SIGNAL_TYPES.BOUNCED_PAYMENT, 3),
      ];
      const orderedB = [
        indicator(SIGNAL_TYPES.BOUNCED_PAYMENT, 3),
        indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 3),
      ];

      expect(computeStressScore(orderedA, 6)).toEqual(
        computeStressScore(orderedB, 6),
      );
    });

    it("returns breakdown entries in fixed signal order", () => {
      const result = computeStressScore(
        [
          indicator(SIGNAL_TYPES.HIGH_CONCENTRATION, 2),
          indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 1),
          indicator(SIGNAL_TYPES.BOUNCED_PAYMENT, 1),
        ],
        6,
      );

      expect(result.breakdown.map((entry) => entry.type)).toEqual([
        SIGNAL_TYPES.NEGATIVE_CASHFLOW,
        SIGNAL_TYPES.BOUNCED_PAYMENT,
        SIGNAL_TYPES.HIGH_CONCENTRATION,
      ]);
    });
  });

  describe("edge cases", () => {
    it("returns score 0 and empty breakdown for no indicators", () => {
      const result = computeStressScore([], 6);

      expect(result.score).toBe(0);
      expect(result.breakdown).toEqual([]);
    });

    it("ignores unknown signal types", () => {
      const result = computeStressScore(
        [indicator("unknown_signal", 10), indicator(SIGNAL_TYPES.LATE_SALARY, 1)],
        6,
      );

      expect(result.score).toBe(7);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].type).toBe(SIGNAL_TYPES.LATE_SALARY);
    });

    it("uses the last indicator when duplicate types are provided", () => {
      const result = computeStressScore(
        [
          indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 1),
          indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 3),
        ],
        6,
      );

      expect(result.score).toBe(24);
      expect(result.breakdown[0].occurrences).toBe(3);
    });

    it("caps the final score at 100 even when contributions exceed the maximum", () => {
      const result = computeStressScore(
        [
          indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 10),
          indicator(SIGNAL_TYPES.BOUNCED_PAYMENT, 10),
          indicator(SIGNAL_TYPES.SUSTAINED_LOW_BALANCE, 10),
          indicator(SIGNAL_TYPES.LATE_SALARY, 10),
          indicator(SIGNAL_TYPES.DECLINING_TREND, 10),
          indicator(SIGNAL_TYPES.HIGH_CONCENTRATION, 10),
        ],
        6,
      );

      expect(result.score).toBe(100);
      expect(
        result.breakdown.reduce((sum, entry) => sum + entry.contribution, 0),
      ).toBe(100);
    });

    it("does not normalize occurrences when totalMonths is 0", () => {
      const result = computeStressScore(
        [indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 2)],
        0,
      );

      expect(result.breakdown[0].effectiveOccurrences).toBe(2);
      expect(result.score).toBe(16);
    });

    it("does not normalize occurrences when totalMonths is exactly 6", () => {
      const result = computeStressScore(
        [indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 2)],
        6,
      );

      expect(result.breakdown[0].effectiveOccurrences).toBe(2);
      expect(result.score).toBe(16);
    });

    it("normalizes occurrences when totalMonths is below 6", () => {
      const result = computeStressScore(
        [indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 2)],
        2,
      );

      expect(result.breakdown[0].effectiveOccurrences).toBe(6);
      expect(result.score).toBe(24);
    });

    it("rounds the final score when normalization produces fractional contributions", () => {
      const result = computeStressScore(
        [indicator(SIGNAL_TYPES.LATE_SALARY, 1)],
        4,
      );

      expect(result.breakdown[0].effectiveOccurrences).toBe(1.5);
      expect(result.breakdown[0].contribution).toBe(10.5);
      expect(result.score).toBe(11);
    });

    it("caps each signal contribution independently", () => {
      const result = computeStressScore(
        [indicator(SIGNAL_TYPES.DECLINING_TREND, 5)],
        6,
      );

      expect(result.breakdown[0].contribution).toBe(10);
      expect(result.score).toBe(10);
    });
  });

  describe("individual signal scoring", () => {
    it.each([
      [SIGNAL_TYPES.NEGATIVE_CASHFLOW, 1, 8],
      [SIGNAL_TYPES.NEGATIVE_CASHFLOW, 3, 24],
      [SIGNAL_TYPES.BOUNCED_PAYMENT, 1, 10],
      [SIGNAL_TYPES.BOUNCED_PAYMENT, 3, 25],
      [SIGNAL_TYPES.SUSTAINED_LOW_BALANCE, 1, 7],
      [SIGNAL_TYPES.SUSTAINED_LOW_BALANCE, 3, 21],
      [SIGNAL_TYPES.LATE_SALARY, 1, 7],
      [SIGNAL_TYPES.LATE_SALARY, 2, 14],
      [SIGNAL_TYPES.DECLINING_TREND, 1, 5],
      [SIGNAL_TYPES.DECLINING_TREND, 2, 10],
      [SIGNAL_TYPES.HIGH_CONCENTRATION, 1, 3],
      [SIGNAL_TYPES.HIGH_CONCENTRATION, 2, 6],
    ])("scores %s with %i occurrences as %i", (type, occurrences, expectedScore) => {
      const result = computeStressScore([indicator(type, occurrences)], 6);

      expect(result.score).toBe(expectedScore);
    });
  });

  describe("signal combinations", () => {
    it("scores one negative month and one bounced payment as 18", () => {
      const result = computeStressScore(
        [
          indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 1),
          indicator(SIGNAL_TYPES.BOUNCED_PAYMENT, 1),
        ],
        6,
      );

      expect(result.score).toBe(18);
      expect(result.breakdown).toHaveLength(2);
    });

    it("scores three negative months and three bounced payments as 49", () => {
      const result = computeStressScore(
        [
          indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 3),
          indicator(SIGNAL_TYPES.BOUNCED_PAYMENT, 3),
        ],
        6,
      );

      expect(result.score).toBe(49);
    });

    it("scores a mixed moderate-risk combination", () => {
      const result = computeStressScore(
        [
          indicator(SIGNAL_TYPES.NEGATIVE_CASHFLOW, 2),
          indicator(SIGNAL_TYPES.LATE_SALARY, 1),
          indicator(SIGNAL_TYPES.HIGH_CONCENTRATION, 1),
        ],
        6,
      );

      expect(result.score).toBe(26);
      expect(result.breakdown).toEqual([
        expect.objectContaining({
          type: SIGNAL_TYPES.NEGATIVE_CASHFLOW,
          contribution: 16,
        }),
        expect.objectContaining({
          type: SIGNAL_TYPES.LATE_SALARY,
          contribution: 7,
        }),
        expect.objectContaining({
          type: SIGNAL_TYPES.HIGH_CONCENTRATION,
          contribution: 3,
        }),
      ]);
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
      expect(result.breakdown).toHaveLength(6);
    });

    it("combines partial signals without exceeding individual caps", () => {
      const result = computeStressScore(
        [
          indicator(SIGNAL_TYPES.SUSTAINED_LOW_BALANCE, 2),
          indicator(SIGNAL_TYPES.DECLINING_TREND, 3),
          indicator(SIGNAL_TYPES.HIGH_CONCENTRATION, 2),
        ],
        6,
      );

      expect(result.score).toBe(30);
      expect(result.breakdown).toEqual([
        expect.objectContaining({
          type: SIGNAL_TYPES.SUSTAINED_LOW_BALANCE,
          contribution: 14,
        }),
        expect.objectContaining({
          type: SIGNAL_TYPES.DECLINING_TREND,
          contribution: 10,
        }),
        expect.objectContaining({
          type: SIGNAL_TYPES.HIGH_CONCENTRATION,
          contribution: 6,
        }),
      ]);
    });
  });
});
