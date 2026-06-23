import { describe, expect, it } from "vitest";
import { InvalidCsvError, parseCsv } from "../ingestion/csv.parser.js";
import { normalizeRow, parseAmount, parseDate } from "../ingestion/normalizer.js";
import {
  SchemaValidationError,
  validateCsvSchema,
} from "../ingestion/row.validator.js";
import { buildTransactions, ingestCsv } from "../ingestion/transaction.builder.js";

const VALID_CSV = `date,description,amount
2024-01-05,Salary payment,5000.00
2024-01-12,Grocery store,-150.50
2024-02-01,Salary payment,5000.00`;

describe("CSV ingestion", () => {
  describe("missing columns (fail fast)", () => {
    it("throws SchemaValidationError when amount column is missing", () => {
      expect(() => ingestCsv("date,description\n2024-01-01,Test")).toThrow(
        SchemaValidationError,
      );
      expect(() => ingestCsv("date,description\n2024-01-01,Test")).toThrow(
        /amount/,
      );
    });

    it("throws SchemaValidationError when description column is missing", () => {
      expect(() => ingestCsv("date,amount\n2024-01-01,100")).toThrow(
        SchemaValidationError,
      );
      expect(() => ingestCsv("date,amount\n2024-01-01,100")).toThrow(
        /description/,
      );
    });

    it("throws SchemaValidationError when date column is missing", () => {
      expect(() => ingestCsv("description,amount\nTest,100")).toThrow(
        SchemaValidationError,
      );
      expect(() => ingestCsv("description,amount\nTest,100")).toThrow(/date/);
    });

    it("throws SchemaValidationError listing all missing required columns", () => {
      const parsed = parseCsv("reference\n123");

      expect(() => validateCsvSchema(parsed.headers)).toThrow(
        SchemaValidationError,
      );

      try {
        validateCsvSchema(parsed.headers);
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaValidationError);
        expect((error as SchemaValidationError).missingColumns).toEqual([
          "date",
          "description",
          "amount",
        ]);
      }
    });

    it("matches required columns case-insensitively", () => {
      const result = ingestCsv(
        "Date,Description,Amount\n2024-01-01,Payment,100",
      );

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("invalid rows (skipped + warnings)", () => {
    it("skips empty rows and records a warning", () => {
      const csv = `date,description,amount
2024-01-01,Valid row,100
,,`;

      const result = ingestCsv(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        rowIndex: 3,
        reason: "Empty row",
      });
      expect(result.warnings[0].rawRow).toBeDefined();
    });

    it("skips rows with missing description", () => {
      const csv = `date,description,amount
2024-01-01,Valid row,100
2024-01-02,,200`;

      const result = ingestCsv(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reason).toBe("Missing description");
    });

    it("skips rows with missing date", () => {
      const csv = `date,description,amount
2024-01-01,Valid row,100
,Missing date,200`;

      const result = ingestCsv(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reason).toBe("Missing date");
      expect(result.warnings[0].rowIndex).toBe(3);
    });

    it("skips rows with missing amount", () => {
      const csv = `date,description,amount
2024-01-01,Valid row,100
2024-01-02,Missing amount,`;

      const result = ingestCsv(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reason).toBe("Missing amount");
    });

    it("continues processing after multiple invalid rows", () => {
      const csv = `date,description,amount
2024-01-01,First valid,100
,Bad row,200
2024-01-03,Second valid,300
not-a-date,Bad date,400
2024-01-05,Third valid,500`;

      const result = ingestCsv(csv);

      expect(result.transactions).toHaveLength(3);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.map((warning) => warning.reason)).toEqual([
        "Missing date",
        "Unparseable date",
      ]);
    });
  });

  describe("malformed amount and date", () => {
    it("skips rows with non-numeric amount", () => {
      const csv = `date,description,amount
2024-01-01,Valid row,100
2024-01-02,Bad row,not-a-number`;

      const result = ingestCsv(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reason).toBe("Non-numeric amount");
    });

    it("skips rows with zero amount", () => {
      const csv = `date,description,amount
2024-01-01,Valid row,100
2024-01-02,Zero amount,0`;

      const result = ingestCsv(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reason).toBe("Amount is zero");
    });

    it("skips rows with unparseable date", () => {
      const csv = `date,description,amount
2024-01-01,Valid row,100
31-13-2024,Bad date,200`;

      const result = ingestCsv(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reason).toBe("Unparseable date");
    });

    it("skips rows with unparseable balance_after", () => {
      const csv = `date,description,amount,balance_after
2024-01-01,Valid row,100,500
2024-01-02,Bad balance,200,not-a-balance`;

      const result = ingestCsv(csv);

      expect(result.transactions).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].reason).toBe("Unparseable balance_after");
    });

    it("parses supported date formats during normalization", () => {
      expect(parseDate("2024-01-05")?.toISOString()).toBe(
        "2024-01-05T00:00:00.000Z",
      );
      expect(parseDate("15/03/2024")?.toISOString()).toBe(
        "2024-03-15T00:00:00.000Z",
      );
      expect(parseDate("5 Jan 2024")?.toISOString()).toBe(
        "2024-01-05T00:00:00.000Z",
      );
      expect(parseDate("not-a-date")).toBeNull();
    });

    it("parses formatted amounts during normalization", () => {
      expect(parseAmount("1,500.00 AED")).toBe(1500);
      expect(parseAmount("-250.00")).toBe(-250);
      expect(parseAmount("invalid")).toBeNull();
    });

    it("returns a warning when normalizeRow cannot parse the date", () => {
      const result = normalizeRow(
        {
          date: "31-13-2024",
          description: "Bad date",
          amount: "100",
        },
        2,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.warning.reason).toBe("Unparseable date");
      }
    });
  });

  describe("empty file", () => {
    it("throws InvalidCsvError for completely empty input", () => {
      expect(() => ingestCsv("")).toThrow(InvalidCsvError);
      expect(() => ingestCsv("")).toThrow(/empty/i);
    });

    it("throws InvalidCsvError for whitespace-only input", () => {
      expect(() => ingestCsv("   \n  \t  ")).toThrow(InvalidCsvError);
      expect(() => ingestCsv("   \n  \t  ")).toThrow(/empty/i);
    });

    it("throws InvalidCsvError when parseCsv receives empty content", () => {
      expect(() => parseCsv("")).toThrow(InvalidCsvError);
    });

    it("returns no transactions for header-only CSV without failing", () => {
      const result = ingestCsv("date,description,amount");

      expect(result.transactions).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("valid ingestion", () => {
    it("parses all valid rows with no warnings", () => {
      const result = ingestCsv(VALID_CSV);

      expect(result.warnings).toHaveLength(0);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].type).toBe("credit");
      expect(result.transactions[0].amount.amount).toBe(5000);
      expect(result.transactions[1].type).toBe("debit");
      expect(result.transactions[1].amount.amount).toBe(150.5);
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

    it("buildTransactions can be called with a pre-parsed CSV", () => {
      const parsed = parseCsv(VALID_CSV);
      const result = buildTransactions(parsed);

      expect(result.transactions).toHaveLength(3);
    });
  });
});
