# Cash Flow Stress Detection

Rule-based SME credit risk analysis from bank statement CSV files. Upload a statement, get a deterministic stress score (0–100), structured indicators, monthly timeline, and a forward-view classification — fully auditable, no ML.

Built with **Node.js**, **TypeScript**, **Express**, and **Vitest**.

---

## Quick start

Two commands to run the API locally:

```bash
npm install
npm run dev
```

Server starts at `http://localhost:3000`.

Production build:

```bash
npm run build && npm start
```

**Requirements:** Node.js ≥ 20

---

## API reference

### `POST /analyse`

Upload a bank statement CSV for analysis.

| | |
|---|---|
| **Content-Type** | `multipart/form-data` |
| **Field** | `file` — CSV file (max **50 MB**) |
| **Success** | `200` — analysis complete (even if some rows were skipped) |

#### CSV format

**Required columns:** `date`, `description`, `amount`

**Optional columns:** `balance_after`, `currency`, `type` (hint only — direction is derived from amount sign)

**Supported date formats:** `YYYY-MM-DD`, `DD/MM/YYYY`, `D MMM YYYY` (e.g. `5 Jan 2024`)

**Example CSV:**

```csv
date,description,amount
2024-01-05,Salary payment,5000.00
2024-01-12,Supplier A,-150.50
2024-02-01,Salary payment,5000.00
```

#### Request

```bash
curl -X POST http://localhost:3000/analyse \
  -F "file=@statement.csv"
```

#### Response `200`

```json
{
  "monthly_timeline": [
    {
      "month": "2024-01",
      "inflows": 5000,
      "outflows": 150.5,
      "net_flow": 4849.5,
      "end_of_month_balance": 4849.5
    },
    {
      "month": "2024-02",
      "inflows": 5000,
      "outflows": 0,
      "net_flow": 5000,
      "end_of_month_balance": 9849.5
    }
  ],
  "stress_indicators": [
    {
      "type": "late_salary",
      "severity": "low",
      "occurrences": 1,
      "message": "1 late salary payment(s) detected (expected day 3, threshold > 7 days)."
    }
  ],
  "stress_score": 7,
  "forward_view": {
    "label": "low_risk",
    "justification": "Low risk assessment: 1 late salary payment (7 pts) account for 7 of 7 stress points."
  },
  "parsing_warnings": [
    {
      "rowIndex": 4,
      "reason": "Non-numeric amount",
      "rawRow": {
        "date": "2024-01-15",
        "description": "Bad row",
        "amount": "not-a-number"
      }
    }
  ],
  "meta": {
    "total_rows": 5,
    "parsed_rows": 4,
    "skipped_rows": 1,
    "currency": "AED",
    "period": { "from": "2024-01-05", "to": "2024-02-01" }
  }
}
```

#### Error responses

| Status | Condition | Example body |
|--------|-----------|--------------|
| **400** | Missing `file` field | `{ "error": "Missing file field" }` |
| **400** | Empty file | `{ "error": "CSV file is empty" }` |
| **400** | Missing required column(s) | `{ "error": "Missing required column(s): amount" }` |
| **413** | File exceeds 50 MB | `{ "error": "File too large" }` |
| **422** | Malformed CSV (e.g. unclosed quote) | `{ "error": "Unclosed quote in CSV" }` |
| **500** | Unexpected server error | `{ "error": "Unexpected internal error" }` |

---

## Architecture

### Request flow

```
POST /analyse  (multipart CSV)
       │
       ▼
┌──────────────────┐
│  analyse.route   │  thin controller — upload + error mapping only
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ AnalyseService   │  orchestration — no business logic
└────────┬─────────┘
         │
    ┌────┴────┬────────────┬────────────┬────────────┐
    ▼         ▼            ▼            ▼            ▼
 Ingestion  Timeline   Indicators   Scoring    Forward view
    │         │            │            │            │
    └─────────┴────────────┴────────────┴────────────┘
                         │
                         ▼
                  AnalyseResponse (JSON)
```

### Design principles

- **No business logic in the API layer** — controller delegates to the service
- **No raw CSV outside ingestion** — everything downstream operates on `Transaction[]`
- **Fully deterministic** — same input always produces the same output
- **Rule-based only** — no ML, no probabilistic scoring
- **Layer isolation** — each module is unit-testable without I/O

### Project structure

```
src/
├── index.ts                     # server bootstrap
├── app.ts                       # Express app factory
├── api/
│   └── analyse.route.ts         # POST /analyse controller
├── service/
│   └── analyse.service.ts       # pipeline orchestration
├── ingestion/
│   ├── csv.parser.ts            # raw CSV → rows
│   ├── row.validator.ts         # schema + row validation
│   ├── normalizer.ts            # date, amount, currency
│   └── transaction.builder.ts   # Transaction construction
├── domain/
│   ├── money.ts
│   ├── transaction.ts
│   ├── stress-indicator.ts
│   ├── parse-warning.ts
│   └── types.ts
├── timeline/
│   └── monthly-timeline.ts      # monthly aggregation
├── indicators/
│   ├── bounced.detector.ts
│   ├── cashflow.detector.ts
│   ├── salary.detector.ts
│   ├── low-balance.detector.ts
│   ├── trend.detector.ts
│   ├── concentration.detector.ts
│   └── index.ts                 # detectStressIndicators()
├── scoring/
│   ├── score.engine.ts          # deterministic scoring
│   └── forward-view.ts          # label + justification
└── tests/                       # Vitest suites (see Tests section)
```

---

## Ingestion

CSV ingestion is a **lossy transformation** — real-world bank exports are messy. The pipeline is designed to fail loudly on structural problems and fail softly on individual bad rows.

```
Raw CSV
   ↓
Schema validation     ← FAIL FAST (reject entire file)
   ↓
Row-level validation  ← SOFT FAIL (skip row + warning)
   ↓
Normalization         ← SOFT FAIL on unparseable values
   ↓
Transaction builder
   ↓
{ transactions, warnings }
```

### Fail fast — schema validation

Before any row is processed, the header is checked for required columns: `date`, `description`, `amount`. Missing columns throw `SchemaValidationError` → HTTP **400**. No partial processing.

Headers are matched **case-insensitively** (`Date`, `AMOUNT` both work).

### Soft fail — row-level validation

Each row is validated independently. Invalid rows are **skipped**, never crash the pipeline. A structured `ParseWarning` is appended:

| Condition | Action |
|-----------|--------|
| Empty row | Skip + warn |
| Missing description / date / amount | Skip + warn |
| Non-numeric amount | Skip + warn |
| Zero amount (ambiguous) | Skip + warn |
| Unparseable date | Skip + warn |
| Unparseable `balance_after` | Skip + warn |

Warnings are returned in `parsing_warnings` so the caller knows exactly what was dropped.

### Normalization

| Field | Rule |
|-------|------|
| **Date** | Parsed to UTC `Date`; supports `YYYY-MM-DD`, `DD/MM/YYYY`, `D MMM YYYY` |
| **Amount** | Commas and currency symbols stripped; sign determines `credit`/`debit`; stored as positive number |
| **Type** | Always **derived from amount sign** — raw `type` column is ignored |
| **Currency** | From column (uppercased) or default **`AED`** |

### Balance fallback

`balance_after` is optional in CSV. When absent on a row:

1. Use the last known `balanceAfter` as anchor, or
2. Fall back to a **running sum** from the first transaction

Every built `Transaction` carries a computed `balanceAfter` for downstream timeline use.

---

## The 6 stress signals

Each signal produces a `StressIndicator` with `type`, `severity`, `occurrences`, and an auditable `message`. Omitted when not detected.

### 1. Bounced / returned payments — `bounced_payment`

**Heuristic:** keyword match (case-insensitive) on transaction `description`.

Keywords: `return`, `bounce`, `dishonour`, `dishonor`, `unpaid`, `rejected`, `RET`, `R/D`, `مرتجع`

**Why defensible:** returned cheques and dishonoured payments are direct evidence of payment failure — a standard red flag in SME credit review.

| Occurrences | Severity |
|-------------|----------|
| 1–2 | medium |
| 3+ | high |

### 2. Negative net cashflow — `negative_cashflow`

**Heuristic:** any calendar month where `net_flow < 0` on the monthly timeline.

**Why defensible:** spending more than earning in a month is the most basic liquidity stress signal. Frequency matters more than a single occurrence.

| Months | Severity |
|--------|----------|
| 1 | low |
| 2 | medium |
| 3+ | high |

### 3. Late salary payments — `late_salary`

**Heuristic:**

1. Filter transactions matching salary keywords: `salary`, `salaire`, `payroll`, `wages`, `راتب`, `مرتب`
2. Compute **expected payment day** = median day-of-month across all salary transactions
3. Flag any salary payment where `|actual_day − expected_day| > 7`

**Why defensible:** payroll regularity is a proxy for business stability. Late salary suggests cash pressure. **Omitted entirely** when no salary transactions are found — no penalty for missing data.

| Occurrences | Severity |
|-------------|----------|
| 1 | low |
| 2 | medium |
| 3+ | high |

### 4. Sustained low balance — `sustained_low_balance`

**Heuristic:**

1. Compute average end-of-month balance across all months
2. Flag months where `end_of_month_balance < 10%` of that average
3. Severity scales with **longest consecutive run** of breaching months

**Why defensible:** a single low month may be seasonal; consecutive months below 10% of average indicate structural cash shortage, not a one-off.

| Consecutive months | Severity |
|--------------------|----------|
| 1 (isolated) | low |
| 2 | medium |
| 3+ | high |

### 5. Declining balance trend — `declining_trend`

**Heuristic:** 3 or more consecutive months of strictly falling `end_of_month_balance`.

**Why defensible:** distinct from a single negative cashflow month — a sustained downward balance trend indicates structural deterioration even if individual months remain positive.

| Consecutive months | Severity |
|--------------------|----------|
| 3 | medium |
| 4+ | high |

### 6. High outflow concentration — `high_concentration`

**Heuristic:**

1. Group debit transactions by normalized counterparty name (lowercased, trimmed description)
2. Flag any month where a single counterparty accounts for **> 60%** of total outflows

**Why defensible:** dependency on a single payee creates liquidity risk if that relationship ends. Concentration is a standard counterparty risk metric.

| Severity |
|----------|
| medium (always) |

---

## Scoring

Fully deterministic, rule-based. Same indicators + same period length → same score.

### Formula

```
for each signal:
  effective_occurrences = occurrences                          if total_months >= 6
                        = occurrences × (6 / total_months)      if total_months < 6

  contribution = min(weight × effective_occurrences, cap)
  score += contribution

final_score = min(round(score), 100)
```

Short histories (< 6 months) scale occurrences **up** so a 2-month dataset with 2 bad months scores higher than a 9-month dataset with the same 2 bad months — the latter is structurally less concerning.

### Weights and caps

| Signal | Weight / occurrence | Cap |
|--------|---------------------|-----|
| Negative cashflow month | 8 pts | 24 |
| Bounced / returned payment | 10 pts | 25 |
| Sustained low balance | 7 pts | 21 |
| Late salary payment | 7 pts | 14 |
| Declining balance trend | 5 pts | 10 |
| High outflow concentration | 3 pts | 6 |
| **Maximum total** | | **100** |

### Worked examples

| Scenario | Calculation | Score |
|----------|-------------|-------|
| 1 negative cashflow month | `min(8 × 1, 24) = 8` | **8** |
| 1 negative + 1 bounced | `8 + 10 = 18` | **18** |
| 3 negative months | `min(8 × 3, 24) = 24` | **24** |
| 3 bounced payments | `min(10 × 3, 25) = 25` | **25** |
| 3 negative + 3 bounced | `24 + 25 = 49` | **49** |
| All signals at cap | `24 + 25 + 21 + 14 + 10 + 6` | **100** |
| 2 negative months, 2-month history | `effective = 2 × (6/2) = 6` → `min(8 × 6, 24) = 24` | **24** |

---

## Forward view

Classification derived from `stress_score`. Justification is built from the **top 2 contributing signals** — not a generic template.

### Thresholds

| Score | Label |
|-------|-------|
| 0–20 | `low_risk` |
| 21–50 | `moderate_risk` |
| 51–80 | `high_risk` |
| 81–100 | `decline` |

### Justification

When `score = 0`, a fixed message is returned:

> No significant stress signals detected across the review period.

Otherwise, the top 2 signals by contribution are selected. **Tie-break priority** (fixed, not configurable):

```
bounced_payment → negative_cashflow → sustained_low_balance → late_salary → declining_trend → high_concentration
```

Example (`score = 49`):

> Moderate risk: 3 bounced payments (25 pts) and 3 negative cashflow months (24 pts) account for 49 of 49 stress points.

---

## Tests

**83 tests** across 7 suites. Run all:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Run a single suite:

```bash
npm test -- src/tests/scoring.test.ts
```

| Suite | File | Covers |
|-------|------|--------|
| Ingestion | `ingestion.test.ts` | Schema fail-fast, row soft-fail, malformed date/amount, empty file |
| Timeline | `monthly-timeline.test.ts` | Monthly aggregation, balance fallback |
| Indicators | `indicators.test.ts` | All 6 signal detectors |
| Scoring | `scoring.test.ts` | Weights, caps, normalization, combinations, determinism |
| Forward view | `forward-view.test.ts` | Thresholds, tie-break, justification |
| Service | `analyse.service.test.ts` | End-to-end orchestration |
| API | `analyse.route.test.ts` | HTTP upload, status codes, file size limit |

All scoring and indicator tests use **pre-built `StressIndicator[]` / `Transaction[]`** — no CSV parsing in unit tests.

---

## Limitations

Honest constraints of v1:

| Limitation | Detail |
|------------|--------|
| **Single currency per file** | Default `AED`; no FX conversion (see Multi-currency below) |
| **Keyword-based detection** | Salary and bounced-payment signals rely on description keywords — non-standard labels are missed |
| **Naive counterparty grouping** | Lowercase + trim only; no entity resolution or fuzzy matching |
| **No persistent storage** | In-memory per request |
| **50 MB file limit** | No streaming ingestion; large files rejected with HTTP 413 |
| **Short history (< 2 months)** | Trend-based signals (salary median, declining balance, sustained low balance) may produce unreliable results on very short datasets — interpret with caution |
| **No `meta.warnings` for short history** | Planned in spec but not yet implemented in the service layer |
| **Balance precision** | `Money.amount` is always stored as a positive number; overdrawn balances lose sign semantics |
| **No ML / anomaly detection** | Rule-based only; cannot detect novel patterns outside defined heuristics |

---

## Multi-currency (future-ready)

All financial values use the `Money` type — amount + ISO 4217 currency code on every value. No raw floats leak outside ingestion.

FX conversion is **not implemented** in v1, but the extension point is defined:

```ts
interface CurrencyConverter {
  convert(amount: Money, targetCurrency: string): Promise<Money>;
}
```

When multi-currency becomes the next ticket:

1. Inject `CurrencyConverter` into the service layer
2. Normalize all `Money` values to a base currency before aggregation
3. Scoring engine, indicators, and timeline require **zero changes**

The domain model, ingestion layer, and scoring caps were designed so FX is a service-layer concern — not a redesign.

---

## License

Private / personal project.
