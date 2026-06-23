import type { IngestionResult } from "../domain/types.js";
import type { ParsedCsv } from "./csv.parser.js";

export function buildTransactions(_parsed: ParsedCsv): IngestionResult {
  throw new Error("Not implemented");
}
