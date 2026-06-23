import type { AnalyseResponse } from "../domain/types.js";
import type { Transaction } from "../domain/transaction.js";
import { detectStressIndicators } from "../indicators/index.js";
import { ingestCsv } from "../ingestion/transaction.builder.js";
import { deriveForwardView } from "../scoring/forward-view.js";
import { computeStressScore } from "../scoring/score.engine.js";
import { computeMonthlyTimeline } from "../timeline/monthly-timeline.js";

const DEFAULT_CURRENCY = "AED";

export class AnalyseService {
  analyse(csvContent: string): AnalyseResponse {
    const { transactions, warnings } = ingestCsv(csvContent);
    const monthlyTimeline = computeMonthlyTimeline(transactions);
    const stressIndicators = detectStressIndicators(
      transactions,
      monthlyTimeline,
    );
    const { score, breakdown } = computeStressScore(
      stressIndicators,
      monthlyTimeline.length,
    );
    const forwardView = deriveForwardView(score, breakdown);

    return {
      monthly_timeline: monthlyTimeline,
      stress_indicators: stressIndicators,
      stress_score: score,
      forward_view: forwardView,
      parsing_warnings: warnings,
      meta: buildMeta(transactions, warnings),
    };
  }
}

function buildMeta(
  transactions: Transaction[],
  warnings: AnalyseResponse["parsing_warnings"],
): AnalyseResponse["meta"] {
  return {
    total_rows: transactions.length + warnings.length,
    parsed_rows: transactions.length,
    skipped_rows: warnings.length,
    currency: resolveCurrency(transactions),
    period: resolvePeriod(transactions),
  };
}

function resolveCurrency(transactions: Transaction[]): string {
  return transactions[0]?.amount.currency ?? DEFAULT_CURRENCY;
}

function resolvePeriod(
  transactions: Transaction[],
): AnalyseResponse["meta"]["period"] {
  if (transactions.length === 0) {
    return { from: "", to: "" };
  }

  const sorted = [...transactions].sort(
    (left, right) => left.date.getTime() - right.date.getTime(),
  );

  return {
    from: formatDate(sorted[0].date),
    to: formatDate(sorted[sorted.length - 1].date),
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
