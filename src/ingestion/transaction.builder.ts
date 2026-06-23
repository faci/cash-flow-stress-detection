import { createHash } from "node:crypto";
import type { IngestionResult } from "../domain/types.js";
import type { Transaction } from "../domain/transaction.js";
import type { Money } from "../domain/money.js";
import { parseCsv } from "./csv.parser.js";
import { normalizeRow } from "./normalizer.js";
import { validateCsvSchema, validateRow } from "./row.validator.js";
import type { ParsedCsv } from "./csv.parser.js";
import type { NormalizedRow } from "../domain/types.js";

export function ingestCsv(raw: string): IngestionResult {
  const parsed = parseCsv(raw);
  validateCsvSchema(parsed.headers);
  return buildTransactions(parsed);
}

export function buildTransactions(parsed: ParsedCsv): IngestionResult {
  validateCsvSchema(parsed.headers);

  const transactions: Transaction[] = [];
  const warnings: IngestionResult["warnings"] = [];

  let runningBalance = 0;
  let lastBalanceAfter: number | undefined;
  let hasSeenBalance = false;

  for (let index = 0; index < parsed.rows.length; index++) {
    const row = parsed.rows[index];
    const rowIndex = index + 2;

    const validation = validateRow(row, rowIndex);
    if (!validation.valid) {
      warnings.push(validation.warning);
      continue;
    }

    const normalized = normalizeRow(row, rowIndex);
    if (!normalized.success) {
      warnings.push(normalized.warning);
      continue;
    }

    const balanceState = resolveBalanceAfter(
      normalized.row,
      runningBalance,
      lastBalanceAfter,
      hasSeenBalance,
    );
    runningBalance = balanceState.runningBalance;
    lastBalanceAfter = balanceState.lastBalanceAfter;
    hasSeenBalance = balanceState.hasSeenBalance;

    transactions.push(toTransaction(normalized.row, rowIndex, balanceState.balanceAfter));
  }

  return { transactions, warnings };
}

function toTransaction(
  row: NormalizedRow,
  rowIndex: number,
  balanceAfter?: Money,
): Transaction {
  const amount: Money = {
    amount: row.amount,
    currency: row.currency,
  };

  return {
    id: buildTransactionId(rowIndex, row.date, row.amount),
    date: row.date,
    description: row.description,
    amount,
    type: row.type,
    ...(balanceAfter ? { balanceAfter } : {}),
  };
}

function buildTransactionId(
  rowIndex: number,
  date: Date,
  amount: number,
): string {
  const payload = `${rowIndex}|${date.toISOString()}|${amount}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function resolveBalanceAfter(
  row: NormalizedRow,
  runningBalance: number,
  lastBalanceAfter: number | undefined,
  hasSeenBalance: boolean,
): {
  balanceAfter?: Money;
  runningBalance: number;
  lastBalanceAfter?: number;
  hasSeenBalance: boolean;
} {
  const currency = row.currency;

  if (row.balanceAfter !== undefined) {
    const balance = row.balanceAfter;
    return {
      balanceAfter: toMoney(balance, currency),
      runningBalance: balance,
      lastBalanceAfter: balance,
      hasSeenBalance: true,
    };
  }

  const delta = row.type === "credit" ? row.amount : -row.amount;
  const anchor = hasSeenBalance ? (lastBalanceAfter ?? runningBalance) : runningBalance;
  const nextBalance = anchor + delta;

  return {
    balanceAfter: toMoney(nextBalance, currency),
    runningBalance: nextBalance,
    lastBalanceAfter: nextBalance,
    hasSeenBalance,
  };
}

function toMoney(value: number, currency: string): Money {
  return { amount: Math.abs(value), currency };
}
