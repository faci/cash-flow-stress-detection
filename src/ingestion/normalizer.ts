import type { NormalizedRow, ParseWarning, ParsedRow } from "../domain/types.js";
import type { TransactionType } from "../domain/transaction.js";
import { getFieldValue } from "./row.validator.js";

export type NormalizeResult =
  | { success: true; row: NormalizedRow }
  | { success: false; warning: ParseWarning };

const DEFAULT_CURRENCY = "AED";

const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function normalizeRow(
  row: ParsedRow,
  rowIndex: number,
): NormalizeResult {
  const dateValue = getFieldValue(row, "date");
  const date = parseDate(dateValue);
  if (!date) {
    return normalizeFailure(row, rowIndex, "Unparseable date");
  }

  const amountRaw = getFieldValue(row, "amount");
  const parsedAmount = parseAmount(amountRaw);
  if (parsedAmount === null) {
    return normalizeFailure(row, rowIndex, "Non-numeric amount");
  }

  if (parsedAmount === 0) {
    return normalizeFailure(row, rowIndex, "Amount is zero");
  }

  const type: TransactionType = parsedAmount > 0 ? "credit" : "debit";
  const amount = Math.abs(parsedAmount);
  const currency = normalizeCurrency(getFieldValue(row, "currency"));
  const balanceRaw = getFieldValue(row, "balance_after");
  const balanceAfter =
    balanceRaw.length > 0 ? parseBalance(balanceRaw) : undefined;

  if (balanceRaw.length > 0 && balanceAfter === null) {
    return normalizeFailure(row, rowIndex, "Unparseable balance_after");
  }

  return {
    success: true,
    row: {
      date,
      description: getFieldValue(row, "description"),
      amount,
      currency,
      type,
      balanceAfter: balanceAfter ?? undefined,
    },
  };
}

function normalizeFailure(
  row: ParsedRow,
  rowIndex: number,
  reason: string,
): NormalizeResult {
  return {
    success: false,
    warning: { rowIndex, reason, rawRow: { ...row } },
  };
}

function normalizeCurrency(value: string): string {
  return value ? value.trim().toUpperCase() : DEFAULT_CURRENCY;
}

export function parseDate(value: string): Date | null {
  const trimmed = value.trim();

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return buildDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
  }

  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    return buildDate(
      Number(dmyMatch[3]),
      Number(dmyMatch[2]) - 1,
      Number(dmyMatch[1]),
    );
  }

  const textMatch = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(trimmed);
  if (textMatch) {
    const month = MONTH_NAMES[textMatch[2].toLowerCase()];
    if (month === undefined) {
      return null;
    }
    return buildDate(Number(textMatch[3]), month, Number(textMatch[1]));
  }

  return null;
}

function buildDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseAmount(value: string): number | null {
  let cleaned = value.trim().replace(/,/g, "");
  cleaned = cleaned.replace(
    /\b(AED|USD|EUR|GBP|SAR|QAR|KWD|OMR|BHD)\b/gi,
    "",
  );
  cleaned = cleaned.replace(/[^0-9.+\-]/g, "");

  if (!cleaned || cleaned === "+" || cleaned === "-" || cleaned === ".") {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBalance(value: string): number | null {
  const parsed = parseAmount(value);
  return parsed === null ? null : Math.abs(parsed);
}
