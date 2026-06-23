import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

describe("POST /analyse", () => {
  const app = createApp();

  it("returns 200 with structured JSON for valid CSV upload", async () => {
    const csv = `date,description,amount
2024-01-05,Salary payment,5000.00
2024-01-12,Supplier A,-100.00
2024-02-01,Salary payment,5000.00`;

    const response = await request(app)
      .post("/analyse")
      .attach("file", Buffer.from(csv), "statement.csv");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      monthly_timeline: expect.any(Array),
      stress_indicators: expect.any(Array),
      stress_score: expect.any(Number),
      forward_view: {
        label: expect.stringMatching(
          /^(low_risk|moderate_risk|high_risk|decline)$/,
        ),
        justification: expect.any(String),
      },
      parsing_warnings: expect.any(Array),
      meta: {
        total_rows: 3,
        parsed_rows: 3,
        skipped_rows: 0,
        currency: "AED",
        period: { from: "2024-01-05", to: "2024-02-01" },
      },
    });
  });

  it("returns 400 when file field is missing", async () => {
    const response = await request(app).post("/analyse");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Missing file field");
  });

  it("returns 400 for missing required columns", async () => {
    const csv = "date,description\n2024-01-01,Test";

    const response = await request(app)
      .post("/analyse")
      .attach("file", Buffer.from(csv), "statement.csv");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("amount");
  });

  it("returns 422 for invalid CSV", async () => {
    const csv = 'date,description,amount\n2024-01-01,"unclosed';

    const response = await request(app)
      .post("/analyse")
      .attach("file", Buffer.from(csv), "statement.csv");

    expect(response.status).toBe(422);
    expect(response.body.error).toContain("Unclosed quote");
  });

  it("returns 400 for empty file", async () => {
    const response = await request(app)
      .post("/analyse")
      .attach("file", Buffer.from(""), "empty.csv");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("empty");
  });

  it("returns error when file exceeds size limit", async () => {
    const fileSizeLimit = 50 * 1024 * 1024;
    const oversizedFile = Buffer.alloc(fileSizeLimit + 1);

    const response = await request(app)
      .post("/analyse")
      .attach("file", oversizedFile, "large.csv");

    expect(response.status).toBe(413);
    expect(response.body.error).toBe("File too large");
  });
});
