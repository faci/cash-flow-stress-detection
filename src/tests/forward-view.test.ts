import { describe, expect, it } from "vitest";
import { deriveForwardView } from "../scoring/forward-view.js";
import type { ScoreBreakdownEntry } from "../scoring/score.engine.js";

function breakdownEntry(
  overrides: Partial<ScoreBreakdownEntry> & Pick<ScoreBreakdownEntry, "type">,
): ScoreBreakdownEntry {
  return {
    occurrences: 1,
    effectiveOccurrences: 1,
    weight: 8,
    cap: 24,
    contribution: 8,
    ...overrides,
  };
}

describe("deriveForwardView", () => {
  it("classifies score 0 as low_risk with default justification", () => {
    const result = deriveForwardView(0, []);

    expect(result).toEqual({
      label: "low_risk",
      justification:
        "No significant stress signals detected across the review period.",
    });
  });

  it("classifies score 8 as low_risk", () => {
    const result = deriveForwardView(8, [
      breakdownEntry({
        type: "negative_cashflow",
        occurrences: 1,
        contribution: 8,
      }),
    ]);

    expect(result.label).toBe("low_risk");
    expect(result.justification).toContain("1 negative cashflow month (8 pts)");
    expect(result.justification).toContain("8 of 8 stress points");
  });

  it("classifies score 49 as moderate_risk with top 2 signals", () => {
    const result = deriveForwardView(49, [
      breakdownEntry({
        type: "negative_cashflow",
        occurrences: 3,
        contribution: 24,
        weight: 8,
        cap: 24,
      }),
      breakdownEntry({
        type: "bounced_payment",
        occurrences: 3,
        contribution: 25,
        weight: 10,
        cap: 25,
      }),
    ]);

    expect(result.label).toBe("moderate_risk");
    expect(result.justification).toBe(
      "Moderate risk: 3 bounced payments (25 pts) and 3 negative cashflow months (24 pts) account for 49 of 49 stress points.",
    );
  });

  it("classifies score 100 as decline", () => {
    const result = deriveForwardView(100, [
      breakdownEntry({ type: "negative_cashflow", occurrences: 3, contribution: 24, weight: 8, cap: 24 }),
      breakdownEntry({ type: "bounced_payment", occurrences: 3, contribution: 25, weight: 10, cap: 25 }),
      breakdownEntry({ type: "sustained_low_balance", occurrences: 3, contribution: 21, weight: 7, cap: 21 }),
      breakdownEntry({ type: "late_salary", occurrences: 2, contribution: 14, weight: 7, cap: 14 }),
      breakdownEntry({ type: "declining_trend", occurrences: 2, contribution: 10, weight: 5, cap: 10 }),
      breakdownEntry({ type: "high_concentration", occurrences: 2, contribution: 6, weight: 3, cap: 6 }),
    ]);

    expect(result.label).toBe("decline");
    expect(result.justification).toContain("Decline recommended:");
  });

  it("breaks ties using fixed signal priority", () => {
    const result = deriveForwardView(24, [
      breakdownEntry({
        type: "negative_cashflow",
        occurrences: 3,
        contribution: 24,
        weight: 8,
        cap: 24,
      }),
      breakdownEntry({
        type: "bounced_payment",
        occurrences: 2,
        contribution: 24,
        weight: 10,
        cap: 25,
        effectiveOccurrences: 2.4,
      }),
    ]);

    expect(result.justification).toContain("3 negative cashflow months (24 pts)");
    expect(result.justification).toContain("2 bounced payments (24 pts)");
    expect(result.justification.indexOf("bounced payment")).toBeLessThan(
      result.justification.indexOf("negative cashflow"),
    );
  });

  it("is deterministic for the same input", () => {
    const breakdown = [
      breakdownEntry({ type: "late_salary", occurrences: 2, contribution: 14, weight: 7, cap: 14 }),
      breakdownEntry({ type: "declining_trend", occurrences: 2, contribution: 10, weight: 5, cap: 10 }),
    ];

    expect(deriveForwardView(24, breakdown)).toEqual(
      deriveForwardView(24, breakdown),
    );
  });
});
