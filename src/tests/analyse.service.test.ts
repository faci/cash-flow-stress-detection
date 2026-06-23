import { describe, expect, it } from "vitest";
import { AnalyseService } from "../service/analyse.service.js";

describe("AnalyseService", () => {
  const service = new AnalyseService();

  it("returns a structured response for valid CSV", () => {
    const csv = `date,description,amount
2024-01-05,Salary payment,5000.00
2024-01-12,Supplier A,-100.00
2024-01-15,Supplier B,-50.50
2024-02-01,Salary payment,5000.00`;

    const response = service.analyse(csv);

    expect(response.monthly_timeline).toHaveLength(2);
    expect(response.stress_score).toBeGreaterThanOrEqual(0);
    expect(response.stress_score).toBeLessThanOrEqual(100);
    expect(response.forward_view.label).toBeDefined();
    expect(response.parsing_warnings).toEqual([]);
    expect(response.meta).toEqual({
      total_rows: 4,
      parsed_rows: 4,
      skipped_rows: 0,
      currency: "AED",
      period: { from: "2024-01-05", to: "2024-02-01" },
    });
  });

  it("includes parsing warnings for invalid rows", () => {
    const csv = `date,description,amount
2024-01-01,Valid row,100
2024-01-02,Bad row,not-a-number`;

    const response = service.analyse(csv);

    expect(response.meta.parsed_rows).toBe(1);
    expect(response.meta.skipped_rows).toBe(1);
    expect(response.parsing_warnings).toHaveLength(1);
  });

  it("returns zeroed analysis for header-only CSV", () => {
    const response = service.analyse("date,description,amount");

    expect(response.monthly_timeline).toEqual([]);
    expect(response.stress_score).toBe(0);
    expect(response.meta.total_rows).toBe(0);
    expect(response.meta.period).toEqual({ from: "", to: "" });
  });
});
