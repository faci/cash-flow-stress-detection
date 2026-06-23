/**
 * Monetary value in a single currency.
 *
 * Invariants (enforced by the ingestion layer, not here):
 * - `amount` is always positive; sign semantics live on {@link TransactionType}.
 * - `currency` is ISO 4217 (e.g. "AED", "USD", "EUR").
 */
export type Money = {
  /** Always positive; transaction direction is encoded by {@link TransactionType}. */
  amount: number;
  /** ISO 4217 currency code. */
  currency: string;
};
