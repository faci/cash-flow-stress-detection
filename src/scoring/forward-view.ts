import type { ForwardView, ForwardViewLabel } from "../domain/types.js";
import type { ScoreBreakdownEntry } from "./score.engine.js";

const SIGNAL_PRIORITY = [
  "bounced_payment",
  "negative_cashflow",
  "sustained_low_balance",
  "late_salary",
  "declining_trend",
  "high_concentration",
] as const;

const LABEL_PREFIX: Record<ForwardViewLabel, string> = {
  low_risk: "Low risk assessment",
  moderate_risk: "Moderate risk",
  high_risk: "High risk",
  decline: "Decline recommended",
};

export function deriveForwardView(
  stressScore: number,
  breakdown: ScoreBreakdownEntry[],
): ForwardView {
  const label = classifyScore(stressScore);

  if (stressScore === 0 || breakdown.length === 0) {
    return {
      label,
      justification:
        "No significant stress signals detected across the review period.",
    };
  }

  const topSignals = rankBreakdown(breakdown).slice(0, 2);
  const topContribution = topSignals.reduce(
    (sum, entry) => sum + entry.contribution,
    0,
  );
  const signalDescriptions = topSignals.map(describeSignal);

  const justification =
    signalDescriptions.length === 1
      ? `${LABEL_PREFIX[label]}: ${signalDescriptions[0]} account for ${Math.round(topContribution)} of ${stressScore} stress points.`
      : `${LABEL_PREFIX[label]}: ${signalDescriptions[0]} and ${signalDescriptions[1]} account for ${Math.round(topContribution)} of ${stressScore} stress points.`;

  return { label, justification };
}

function classifyScore(score: number): ForwardViewLabel {
  if (score <= 20) {
    return "low_risk";
  }
  if (score <= 50) {
    return "moderate_risk";
  }
  if (score <= 80) {
    return "high_risk";
  }
  return "decline";
}

function rankBreakdown(breakdown: ScoreBreakdownEntry[]): ScoreBreakdownEntry[] {
  return [...breakdown]
    .filter((entry) => entry.contribution > 0)
    .sort((left, right) => {
      if (right.contribution !== left.contribution) {
        return right.contribution - left.contribution;
      }

      return (
        signalPriority(left.type) - signalPriority(right.type)
      );
    });
}

function signalPriority(type: string): number {
  const index = SIGNAL_PRIORITY.indexOf(type as (typeof SIGNAL_PRIORITY)[number]);
  return index === -1 ? SIGNAL_PRIORITY.length : index;
}

function describeSignal(entry: ScoreBreakdownEntry): string {
  const points = Math.round(entry.contribution);
  const count = entry.occurrences;

  switch (entry.type) {
    case "negative_cashflow":
      return `${count} negative cashflow month${plural(count)} (${points} pts)`;
    case "bounced_payment":
      return `${count} bounced payment${plural(count)} (${points} pts)`;
    case "sustained_low_balance":
      return `${count} sustained low balance month${plural(count)} (${points} pts)`;
    case "late_salary":
      return `${count} late salary payment${plural(count)} (${points} pts)`;
    case "declining_trend":
      return `${count} declining balance month${plural(count)} (${points} pts)`;
    case "high_concentration":
      return `${count} high outflow concentration month${plural(count)} (${points} pts)`;
    default:
      return `${entry.type} (${points} pts)`;
  }
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
