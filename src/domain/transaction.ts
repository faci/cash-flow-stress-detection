import type { Money } from "./money.js";

export type Transaction = {
  id: string;
  date: Date;
  description: string;
  amount: Money;
  balanceAfter?: Money;
  type: "credit" | "debit";
};
