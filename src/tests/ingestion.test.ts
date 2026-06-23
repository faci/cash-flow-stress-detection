import { describe, expect, it } from "vitest";
import { parseCsv } from "../ingestion/csv.parser.js";
import {
  SchemaValidationError,
  validateCsvSchema,
} from "../ingestion/row.validator.js";
import { parseAmount, parseDate } from "../ingestion/normalizer.js";
import { buildTransactions, ingestCsv } from "../ingestion/transaction.builder.js";

const VALID_CSV = `date,description,amount
2024-01-05,Salary payment,5000.00
2024-01-12,Grocery store,-150.50
2024-02-01,Salary payment,5000.00`;

describe("csv.parser", () => {
  it("parses headers and rows", () => {
    const parsed = parseCsv(VALID_CSV);

    expect(parsed.headers).toEqual(["date", "description", "amount"]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toEqual({
      date: "2024-01-05",
      description: "Salary payment",
      amount: "5000.00",
    });
  });
});

describe("schema validation", () => {
  it("fails fast when amount column is missing", () => {
    const parsed = parseCsv("date,description\n2024-01-01,Test");

    expect(() => validateCsvSchema(parsed.headers)).toThrow(SchemaValidationError);
    expect(() => validateCsvSchema(parsed.headers)).toThrow(/amount/);
  });

  it("fails fast when description column is missing", () => {
    const parsed = parseCsv("date,amount\n2024-01-01,100");

    expect(() => validateCsvSchema(parsed.headers)).toThrow(SchemaValidationError);
    expect(() => validateCsvSchema(parsed.headers)).toThrow(/description/);
  });
});

describe("ingestion pipeline", () => {
  it("parses all valid rows with no warnings", () => {
    const result = ingestCsv(VALID_CSV);

    expect(result.warnings).toHaveLength(0);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0].type).toBe("credit");
    expect(result.transactions[0].amount.amount).toBe(5000);
    expect(result.transactions[1].type).toBe("debit");
    expect(result.transactions[1].amount.amount).toBe(150.5);
  });

  it("returns empty transactions for header-only CSV", () => {
    const result = ingestCsv("date,description,amount");

    expect(result.transactions).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("skips rows with non-numeric amount", () => {
    const csv = `date,description,amount
2024-01-01,Valid row,100
2024-01-02,Bad row,not-a-number`;

    const result = ingestCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toBe("Non-numeric amount");
    expect(result.warnings[0].rowIndex).toBe(3);
  });

  it("skips rows with missing date", () => {
    const csv = `date,description,amount
2024-01-01,Valid row,100
,Missing date,200`;

    const result = ingestCsv(csv);

    expect(result.transactions).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toBe("Missing date");
  });

  it("derives type from amount sign, not raw type column", () => {
    const csv = `date,description,amount,type
2024-01-01,Incoming,250.00,DEBIT
2024-01-02,Outgoing,-75.00,CREDIT`;

    const result = ingestCsv(csv);

    expect(result.transactions[0].type).toBe("credit");
    expect(result.transactions[1].type).toBe("debit");
  });

  it("defaults currency to AED when absent", () => {
    const result = ingestCsv(
      "date,description,amount\n2024-01-01,Payment,100",
    );

    expect(result.transactions[0].amount.currency).toBe("AED");
  });

  it("normalizes comma-separated amounts and alternate date formats", () => {
    expect(parseAmount("1,500.00 AED")).toBe(1500);
    expect(parseDate("15/03/2024")?.toISOString()).toBe(
      "2024-03-15T00:00:00.000Z",
    );
    expect(parseDate("5 Jan 2024")?.toISOString()).toBe(
      "2024-01-05T00:00:00.000Z",
    );
  });

  it("buildTransactions can be called with a pre-parsed CSV", () => {
    const parsed = parseCsv(VALID_CSV);
    const result = buildTransactions(parsed);

    expect(result.transactions).toHaveLength(3);
  });
});
