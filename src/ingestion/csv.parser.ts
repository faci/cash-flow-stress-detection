import type { ParsedRow } from "../domain/types.js";

export type ParsedCsv = {
  headers: string[];
  rows: ParsedRow[];
};

export function parseCsv(_raw: string): ParsedCsv {
  throw new Error("Not implemented");
}
