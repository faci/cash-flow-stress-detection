import { Transaction } from "./transaction.js";

export type { Money } from "./money.js";

export type ParsedRow = Record<string, string>;

export type ParseWarning = {
  rowIndex: number;
  reason: string;
  rawRow: Record<string, string>;
};

export type NormalizedRow = {
  date: Date;
  description: string;
  amount: number;
  currency: string;
  type: "credit" | "debit";
  balanceAfter?: number;
};

export type IngestionResult = {
  transactions: Transaction[];
  warnings: ParseWarning[];
};

export type MonthlyTimelineEntry = {
  month: string;
  inflows: number;
  outflows: number;
  net_flow: number;
  end_of_month_balance: number;
};

export type StressIndicator = {
  type: string;
  severity: "low" | "medium" | "high";
  occurrences: number;
  message: string;
};

export type ForwardViewLabel =
  | "low_risk"
  | "moderate_risk"
  | "high_risk"
  | "decline";

export type ForwardView = {
  label: ForwardViewLabel;
  justification: string;
};

export type AnalyseResponse = {
  monthly_timeline: MonthlyTimelineEntry[];
  stress_indicators: StressIndicator[];
  stress_score: number;
  forward_view: ForwardView;
  parsing_warnings: ParseWarning[];
  meta: {
    total_rows: number;
    parsed_rows: number;
    skipped_rows: number;
    currency: string;
    period: { from: string; to: string };
  };
};
