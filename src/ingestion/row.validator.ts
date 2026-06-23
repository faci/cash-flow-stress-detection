import type { ParseWarning, ParsedRow } from "../domain/types.js";

export type RowValidationResult =
  | { valid: true }
  | { valid: false; warning: ParseWarning };

export function validateCsvSchema(_headers: string[]): void {
  throw new Error("Not implemented");
}

export function validateRow(
  _row: ParsedRow,
  _rowIndex: number,
): RowValidationResult {
  throw new Error("Not implemented");
}
