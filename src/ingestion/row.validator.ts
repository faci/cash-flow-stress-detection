import type { ParseWarning, ParsedRow } from "../domain/types.js";

const REQUIRED_COLUMNS = ["date", "description", "amount"] as const;

export class SchemaValidationError extends Error {
  readonly missingColumns: string[];

  constructor(missingColumns: string[]) {
    super(`Missing required column(s): ${missingColumns.join(", ")}`);
    this.name = "SchemaValidationError";
    this.missingColumns = missingColumns;
  }
}

export type RowValidationResult =
  | { valid: true }
  | { valid: false; warning: ParseWarning };

export function validateCsvSchema(headers: string[]): void {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !normalized.includes(column),
  );

  if (missingColumns.length > 0) {
    throw new SchemaValidationError([...missingColumns]);
  }
}

export function getFieldValue(row: ParsedRow, column: string): string {
  const key = Object.keys(row).find(
    (name) => name.toLowerCase() === column.toLowerCase(),
  );
  return key ? row[key].trim() : "";
}

export function isEmptyRow(row: ParsedRow): boolean {
  return Object.values(row).every((value) => !value.trim());
}

export function validateRow(
  row: ParsedRow,
  rowIndex: number,
): RowValidationResult {
  if (isEmptyRow(row)) {
    return invalidRow(row, rowIndex, "Empty row");
  }

  if (!getFieldValue(row, "description")) {
    return invalidRow(row, rowIndex, "Missing description");
  }

  if (!getFieldValue(row, "date")) {
    return invalidRow(row, rowIndex, "Missing date");
  }

  if (!getFieldValue(row, "amount")) {
    return invalidRow(row, rowIndex, "Missing amount");
  }

  return { valid: true };
}

function invalidRow(
  row: ParsedRow,
  rowIndex: number,
  reason: string,
): RowValidationResult {
  return {
    valid: false,
    warning: { rowIndex, reason, rawRow: { ...row } },
  };
}
