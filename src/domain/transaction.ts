import type { Money } from "./money.js";

/** Direction of funds relative to the account. */
export type TransactionType = "credit" | "debit";

/**
 * Normalized bank statement row — the core domain entity.
 *
 * Invariants (enforced by the ingestion layer, not here):
 * - `type` is derived from the raw amount sign, never from CSV input.
 * - `amount.amount` is always positive; `type` carries sign semantics.
 * - `balanceAfter` is optional; downstream logic uses a running sum when absent.
 * - `id` is a deterministic row hash (rowIndex + date + amount).
 */
export type Transaction = {
  id: string;
  date: Date;
  description: string;
  amount: Money;
  balanceAfter?: Money;
  type: TransactionType;
};
