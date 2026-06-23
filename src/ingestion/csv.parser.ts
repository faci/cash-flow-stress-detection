import type { ParsedRow } from "../domain/types.js";

export type ParsedCsv = {
  headers: string[];
  rows: ParsedRow[];
};

export class InvalidCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCsvError";
  }
}

export function parseCsv(raw: string): ParsedCsv {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new InvalidCsvError("CSV file is empty");
  }

  const lines = splitCsvLines(trimmed);
  if (lines.length === 0) {
    throw new InvalidCsvError("CSV file is empty");
  }

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase(),
  );

  const rows = lines.slice(1).map((line) => rowFromLine(line, headers));

  return { headers, rows };
}

function splitCsvLines(content: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && content[i + 1] === "\n") {
        i++;
      }
      lines.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new InvalidCsvError("Unclosed quote in CSV");
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (inQuotes) {
    throw new InvalidCsvError("Unclosed quote in CSV");
  }

  fields.push(current);
  return fields;
}

function rowFromLine(line: string, headers: string[]): ParsedRow {
  const values = parseCsvLine(line);
  const row: ParsedRow = {};

  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = (values[i] ?? "").trim();
  }

  return row;
}
