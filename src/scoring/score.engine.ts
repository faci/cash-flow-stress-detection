import type { StressIndicator } from "../domain/types.js";
import { SIGNAL_TYPES } from "../indicators/utils.js";

export type ScoreBreakdownEntry = {
  type: string;
  occurrences: number;
  effectiveOccurrences: number;
  weight: number;
  cap: number;
  contribution: number;
};

export type StressScoreResult = {
  score: number;
  breakdown: ScoreBreakdownEntry[];
};

type SignalScoreConfig = {
  weight: number;
  cap: number;
};

const SIGNAL_SCORE_CONFIG: Record<string, SignalScoreConfig> = {
  [SIGNAL_TYPES.NEGATIVE_CASHFLOW]: { weight: 8, cap: 24 },
  [SIGNAL_TYPES.BOUNCED_PAYMENT]: { weight: 10, cap: 25 },
  [SIGNAL_TYPES.SUSTAINED_LOW_BALANCE]: { weight: 7, cap: 21 },
  [SIGNAL_TYPES.LATE_SALARY]: { weight: 7, cap: 14 },
  [SIGNAL_TYPES.DECLINING_TREND]: { weight: 5, cap: 10 },
  [SIGNAL_TYPES.HIGH_CONCENTRATION]: { weight: 3, cap: 6 },
};

const BREAKDOWN_ORDER = [
  SIGNAL_TYPES.NEGATIVE_CASHFLOW,
  SIGNAL_TYPES.BOUNCED_PAYMENT,
  SIGNAL_TYPES.SUSTAINED_LOW_BALANCE,
  SIGNAL_TYPES.LATE_SALARY,
  SIGNAL_TYPES.DECLINING_TREND,
  SIGNAL_TYPES.HIGH_CONCENTRATION,
] as const;

const NORMALIZATION_MONTH_THRESHOLD = 6;

export function computeStressScore(
  indicators: StressIndicator[],
  totalMonths: number,
): StressScoreResult {
  const breakdown = buildBreakdown(indicators, totalMonths);
  const rawScore = breakdown.reduce(
    (sum, entry) => sum + entry.contribution,
    0,
  );

  return {
    score: Math.min(Math.round(rawScore), 100),
    breakdown,
  };
}

function buildBreakdown(
  indicators: StressIndicator[],
  totalMonths: number,
): ScoreBreakdownEntry[] {
  const indicatorsByType = new Map(
    indicators.map((indicator) => [indicator.type, indicator]),
  );

  return BREAKDOWN_ORDER.flatMap((type) => {
    const indicator = indicatorsByType.get(type);
    const config = SIGNAL_SCORE_CONFIG[type];

    if (!indicator || !config) {
      return [];
    }

    const effectiveOccurrences = normalizeOccurrences(
      indicator.occurrences,
      totalMonths,
    );
    const contribution = Math.min(
      config.weight * effectiveOccurrences,
      config.cap,
    );

    return [
      {
        type,
        occurrences: indicator.occurrences,
        effectiveOccurrences,
        weight: config.weight,
        cap: config.cap,
        contribution,
      },
    ];
  });
}

function normalizeOccurrences(
  occurrences: number,
  totalMonths: number,
): number {
  if (totalMonths <= 0 || totalMonths >= NORMALIZATION_MONTH_THRESHOLD) {
    return occurrences;
  }

  return occurrences * (NORMALIZATION_MONTH_THRESHOLD / totalMonths);
}
