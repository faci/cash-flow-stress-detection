# SME Credit Risk Analysis — PLAN (Node.js / TypeScript)

## 1. Objective

Build a Node.js (TypeScript) service exposing:

**POST /analyse**

It accepts a SME bank statement CSV and returns:

- `monthly_timeline`
- `stress_indicators`
- `stress_score` (integer 0–100)
- `forward_view` classification
- `parsing_warnings` (skipped rows surfaced to caller)

The system must be:

- Deterministic and auditable
- Testable in isolation (scoring logic unit-testable with no I/O)
- Explainable (every score delta traceable to a signal)
- Robust to real-world messy CSV data
- Extensible to multi-currency (future-ready, default currency: **AED**)

---

## 2. Core Principles

- Clean separation between ingestion, domain, and business logic
- No business logic in the API layer
- No ML or probabilistic scoring — fully rule-based
- Deterministic, auditable outputs
- CSV ingestion is a **lossy transformation** (expected in real-world data)
- Multi-currency support must not require a redesign of the scoring engine

---

## 3. Domain Model Strategy

### Key principle

The system never operates on raw CSV data outside the ingestion layer.

We transform CSV → **clean domain model** before any logic runs.

---

## 4. Transaction Model (Normalized Domain)

```ts
type Money = {
  amount: number; // always positive; sign encoded by Transaction.type
  currency: string; // ISO 4217 — e.g. "AED", "USD", "EUR"
};

type Transaction = {
  id: string; // deterministic row hash (rowIndex + date + amount)
  date: Date;
  description: string;
  amount: Money;
  balanceAfter?: Money; // optional — not guaranteed in every CSV
  type: "credit" | "debit";
};
```

### Notes

- `type` is **derived** from the amount sign — never trusted from raw input
- `balanceAfter` is optional; downstream logic falls back to running sum if absent
- `currency` is preserved on every `Money` object to support future FX conversion
- `amount` is always stored as a **positive number**; `type` carries the sign semantics

---

## 5. CSV Ingestion Pipeline

### Goal

Transform raw CSV into a validated `Transaction[]` safely, with full traceability of every dropped row.

---

### 5.1 Ingestion Architecture

```
Raw CSV
   ↓
Schema Validation (FAIL FAST)
   ↓
Row-level Validation (SOFT FAIL — skip + log)
   ↓
Normalization Layer
   ↓
Transaction Builder
   ↓
{ transactions: Transaction[], warnings: ParseWarning[] }
```

---

### 5.2 Step 1 — Schema Validation (Fail Fast)

Validate that all required columns are present in the CSV header before processing any rows.

**Required columns:**

- `date`
- `description`
- `amount`

**Optional columns:**

- `balance_after`
- `type` (used as a hint only — derived value takes precedence)
- `currency`

**Failure rule:**

- Any missing required column → reject the entire request with HTTP 400 and a descriptive error

---

### 5.3 Step 2 — Row-level Validation (Soft Fail)

Each row is validated independently. The pipeline never crashes on a single bad row.

**Invalid row conditions:**

- Empty row
- Missing or unparseable date
- Missing or non-numeric amount
- `amount === 0` (ambiguous — skip and warn)
- Missing description

**Strategy:**

- ❌ Do NOT abort the pipeline
- ✔ Skip the row
- ✔ Append a structured `ParseWarning` to the result

---

### 5.4 Step 3 — Normalization Layer

#### Date normalization

- Accept formats: `YYYY-MM-DD`, `DD/MM/YYYY`, `D MMM YYYY` (real-world messy input)
- Parse into native `Date`
- Reject anything unparseable → soft fail

#### Amount normalization

- Strip commas and currency symbols before parsing (e.g. `"1,500.00 AED"` → `1500.00`)
- Convert string → `number`
- Negative input → `debit`, positive → `credit`
- Store `amount` always as a positive number

#### Type derivation (overrides raw input)

```
parsed_amount > 0  →  type = "credit"
parsed_amount < 0  →  type = "debit"
```

#### Currency handling

- If a `currency` column is present and non-empty, use its value (uppercased, trimmed)
- If absent or empty → default to `"AED"`

---

### 5.5 Step 4 — Transaction Construction

Only rows that pass both schema and row-level validation become domain objects.

Output: `{ transactions: Transaction[], warnings: ParseWarning[] }`

---

### 5.6 Error and Warning Model

| Error type                          | Action                      |
| ----------------------------------- | --------------------------- |
| Missing required column(s)          | FAIL FAST — HTTP 400        |
| Invalid / unparseable row           | SKIP ROW + append warning   |
| Partial dataset (some rows skipped) | CONTINUE + include warnings |

**ParseWarning schema:**

```ts
type ParseWarning = {
  rowIndex: number;
  reason: string;
  rawRow: Record<string, string>;
};
```

**These warnings are included in the `/analyse` response** under `parsing_warnings`, so the caller knows exactly what was dropped.

---

### 5.7 `balanceAfter` Fallback Strategy

`balance_after` is not guaranteed in the CSV. When absent or unparseable:

- Use the last known `balanceAfter` value as a running anchor
- If no `balanceAfter` ever appears, fall back to a **running sum** from the first transaction
- Document this clearly in the response (the `monthly_timeline` entry notes the computation method)

---

## 6. Monthly Timeline

Compute per calendar month (`YYYY-MM`):

| Field                  | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `month`                | `"YYYY-MM"` string, sorted ascending deterministically    |
| `inflows`              | Sum of all credits in that month (AED)                    |
| `outflows`             | Sum of all debits in that month (AED, positive value)     |
| `net_flow`             | `inflows - outflows` (can be negative)                    |
| `end_of_month_balance` | Last `balanceAfter` in the month, or running sum fallback |

**Ordering:** always sorted `YYYY-MM` ascending. Do not rely on JS object key order — sort explicitly.

---

## 7. Stress Indicators

Each detected signal produces a structured indicator:

```ts
type StressIndicator = {
  type: string;
  severity: "low" | "medium" | "high";
  occurrences: number; // how many times this fired
  message: string; // human-readable, auditable
};
```

### 7.1 Required Signals

#### a) Bounced / Returned Payments

**Detection:** keyword match (case-insensitive) on `description`:

```
"return", "bounce", "dishonour", "dishonor", "unpaid",
"rejected", "RET", "R/D", "مرتجع"
```

- Severity: `high` if `occurrences >= 3`, else `medium`

---

#### b) Negative Net Cashflow Months

**Detection:** any month where `net_flow < 0`

- Severity: `low` if 1 month, `medium` if 2 months, `high` if 3+ months

---

#### c) Late Salary Payments

**Detection:**

1. Filter transactions matching salary keywords: `salary`, `salaire`, `payroll`, `wages`, `راتب`, `مرتب`
2. Establish **expected payment day** = median day-of-month of all salary transactions
3. For each salary transaction, compute `|actual_day - expected_day|`
4. If deviation > 7 days → flag as late

- Severity: `low` if 1 occurrence, `medium` if 2, `high` if 3+
- If no salary transactions found → signal is omitted (not penalized)

---

#### d) Sustained Low Balance Periods

**Detection:**

1. Compute **average monthly end-of-month balance** across all months
2. Flag any month where `end_of_month_balance < 10% of average balance`
3. Flag as "sustained" if 2+ consecutive months breach the threshold

- Severity: `low` if isolated, `medium` if 2 consecutive months, `high` if 3+

---

### 7.2 Additional Signals (Defended)

#### e) Declining Balance Trend

**Detection:** 3 or more consecutive months of falling `end_of_month_balance`

- Rationale: distinct from a single negative cashflow month — indicates structural deterioration
- Severity: `medium` if 3 consecutive, `high` if 4+

---

#### f) High Outflow Concentration (Counterparty Risk)

**Detection:**

1. Group outflow transactions by normalized counterparty name (lowercased, trimmed)
2. If a single counterparty accounts for > 60% of total outflows in any month → flag

- Rationale: single-counterparty dependency is a liquidity risk if that relationship breaks
- Severity: `medium`

---

## 8. Stress Scoring Engine

### 8.1 Design Principles

- Fully deterministic — same input always produces the same score
- Weighted by **frequency and recurrence**, not just presence
- Each signal's contribution is **capped** to prevent a single signal from dominating
- Score range: `0` (no stress) → `100` (decline)
- **Occurrence counts are normalized by dataset duration** when the period is shorter than 6 months, to avoid over-penalizing a naturally short history:

```
effective_occurrences = occurrences * (6 / total_months)   // only applied if total_months < 6
```

This prevents a 2-month dataset with 2 negative cashflow months from scoring identically to a 9-month dataset with the same 2 months — the latter is structurally more concerning.

---

### 8.2 Signal Weights and Caps

| Signal                     | Weight per occurrence | Cap     |
| -------------------------- | --------------------- | ------- |
| Negative cashflow month    | 8 pts / month         | 24      |
| Bounced / returned payment | 10 pts / event        | 25      |
| Sustained low balance      | 7 pts / month         | 21      |
| Late salary payment        | 7 pts / event         | 14      |
| Declining balance trend    | 5 pts / month run     | 10      |
| High outflow concentration | 3 pts / month         | 6       |
| **Maximum possible total** |                       | **100** |

### 8.3 Scoring Formula

```
score = 0

for each signal:
  contribution = min(weight * occurrences, cap)
  score += contribution

final_score = min(score, 100)
```

### 8.4 Rationale

- A single bad month + one bounced payment = `8 + 10 = 18` → `low_risk`. Reasonable.
- Three bad cashflow months + three bounced payments = `24 + 25 = 49` → `moderate_risk`. Reasonable.
- All signals firing at max = `100` → `decline`. Reserved for genuinely distressed profiles.

---

## 9. Forward View Classification

| Score range | Label           | Justification template                                              |
| ----------- | --------------- | ------------------------------------------------------------------- |
| 0–20        | `low_risk`      | "No significant stress signals detected across the review period."  |
| 21–50       | `moderate_risk` | "Isolated stress signals present; monitor cashflow trajectory."     |
| 51–80       | `high_risk`     | "Multiple recurring stress signals indicate financial instability." |
| 81–100      | `decline`       | "Severe and sustained stress signals across critical dimensions."   |

The justification is generated deterministically from the **top 2 contributing signals** by score, not from a template string.

**Tie-break rule:** if two signals contribute equal points, rank by the following priority order (highest first): `bounced_payment` → `negative_cashflow` → `sustained_low_balance` → `late_salary` → `declining_trend` → `high_concentration`. This order is fixed and documented — not configurable at runtime — to guarantee determinism.

Example:

```
"Decline recommended: 3 negative cashflow months (24 pts) and 3 bounced payments (25 pts)
account for 49 of 58 stress points."
```

---

## 10. API Layer

### POST `/analyse`

- Accepts `multipart/form-data` with a `file` field (CSV)
- Calls service layer
- Returns structured JSON response

**Response schema:**

```ts
{
  monthly_timeline: MonthlyEntry[];
  stress_indicators: StressIndicator[];
  stress_score: number;           // integer 0–100
  forward_view: {
    label: "low_risk" | "moderate_risk" | "high_risk" | "decline";
    justification: string;
  };
  parsing_warnings: ParseWarning[];  // skipped rows surfaced to caller
  meta: {
    total_rows: number;
    parsed_rows: number;
    skipped_rows: number;
    currency: string;
    period: { from: string; to: string };
  };
}
```

**HTTP status codes:**

- `200` — analysis complete (even if some rows skipped)
- `400` — schema-level failure (missing required columns, empty file)
- `422` — file is not valid CSV
- `500` — unexpected internal error

---

## 11. Service Layer (Orchestration)

Responsibilities (in order):

1. Call ingestion pipeline → `{ transactions, warnings }`
2. Compute `monthly_timeline`
3. Run all stress indicator detectors
4. Compute `stress_score`
5. Derive `forward_view`
6. Return assembled response

**No business logic in the API controller.** The service layer is independently unit-testable with a pre-built `Transaction[]` input.

---

## 12. Testing Strategy

### Mandatory: Scoring Logic (Unit Tests)

Test runner: Vitest (compatible ESM + TypeScript natif, pas de config supplémentaire)

All tests use a **pre-built `Transaction[]`** — no CSV parsing involved.

| Test case                      | Expected score behaviour             |
| ------------------------------ | ------------------------------------ |
| Empty transaction list         | score = 0, `low_risk`                |
| 1 negative cashflow month      | score = 8, `low_risk`                |
| 3 negative cashflow months     | score = 24, `low_risk`               |
| 3 bounced payments             | score = 25 (capped), `moderate_risk` |
| 3 negative months + 3 bounces  | score = 49, `moderate_risk`          |
| All signals at max occurrences | score = 100, `decline`               |
| Same input twice → same score  | determinism assertion                |

### Mandatory: Indicator Detection (Unit Tests)

| Test case                                | Expected indicator              |
| ---------------------------------------- | ------------------------------- |
| Description "RETURN CHEQUÉ"              | bounced payment detected        |
| Description "مرتجع"                      | bounced payment detected        |
| Salary on day 1, then day 12, then day 3 | late salary flagged (day 12)    |
| Balance 500 vs average 10,000            | sustained low balance flagged   |
| 4 consecutive months of falling balance  | declining trend flagged, `high` |

### Mandatory: Ingestion (Unit Tests)

| Test case                        | Expected behaviour                  |
| -------------------------------- | ----------------------------------- |
| Valid CSV, clean rows            | all rows parsed, 0 warnings         |
| Row with non-numeric amount      | row skipped, warning logged         |
| Row with missing date            | row skipped, warning logged         |
| CSV missing `amount` column      | HTTP 400, fail fast                 |
| CSV missing `description` column | HTTP 400, fail fast                 |
| Empty CSV (header only)          | 0 transactions, 0 warnings, score 0 |
| Mixed-case `type` column         | derived from amount, not raw value  |

### Edge Cases

- All transactions are credits (no outflows) — no stress, score = 0
- Single-month dataset — timeline has 1 entry, trend signals not applicable
- Duplicate rows — deduplicated by transaction `id` hash
- Extreme volatility — score bounded to 100, does not overflow

---

## 13. Multi-Currency Design (Future-Ready)

All financial values use the `Money` type throughout. No raw `number` floats leak outside the ingestion layer.

### Extension point (not implemented):

```ts
interface CurrencyConverter {
  convert(amount: Money, targetCurrency: string): Promise<Money>;
}
```

When multi-currency is the next ticket:

1. Inject `CurrencyConverter` into the service layer
2. Normalize all `Money` values to a base currency before aggregation
3. The scoring engine, indicator detectors, and timeline computation require **zero changes**

---

## 14. Project Structure

```
src/
  api/
    analyse.route.ts         # thin controller
  service/
    analyse.service.ts       # orchestration only
  ingestion/
    csv.parser.ts            # raw CSV → ParsedRow[]
    row.validator.ts         # row-level validation
    normalizer.ts            # normalization layer
    transaction.builder.ts   # domain object construction
  domain/
    types.ts                 # Transaction, Money, StressIndicator, etc.
  indicators/
    bounced.detector.ts
    cashflow.detector.ts
    salary.detector.ts
    low-balance.detector.ts
    trend.detector.ts
    concentration.detector.ts
  scoring/
    score.engine.ts          # deterministic scoring
    forward-view.ts          # label + justification
  tests/
    scoring.test.ts
    indicators.test.ts
    ingestion.test.ts
```

---

## 15. Assumptions and Limitations

| Assumption / Limitation                                | Note                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single currency per file in v1                         | Multi-currency ready via `Money` type, not implemented                                                                                                                                                                                                                                                                                                                  |
| Salary detection is keyword-based                      | Will miss non-standard descriptions                                                                                                                                                                                                                                                                                                                                     |
| `balanceAfter` may be absent                           | Running sum fallback applied; noted in response `meta`                                                                                                                                                                                                                                                                                                                  |
| No persistent storage                                  | In-memory per request, as per spec                                                                                                                                                                                                                                                                                                                                      |
| Files > 50MB not supported in v1                       | Streaming ingestion is a future improvement                                                                                                                                                                                                                                                                                                                             |
| Counterparty normalization is naive (lowercase + trim) | No entity resolution or fuzzy matching in v1                                                                                                                                                                                                                                                                                                                            |
| **Dataset shorter than 2 months**                      | Signals requiring a baseline or trend (salary median, declining balance trend, sustained low balance) are **mathematically invalid** with < 2 months of data. These signals are silently skipped and a `meta.warnings` entry is added: `"Insufficient history for trend-based signals (< 2 months)"`. The score is computed from the remaining applicable signals only. |

---

## 16. Future Improvements (Out of Scope)

- Multi-currency FX conversion engine (interface already defined)
- Streaming ingestion for large files (> 50MB)
- Merchant / counterparty classification
- Persistent storage layer
- Anomaly detection models (complement to rule-based scoring)
- Trend forecasting (extrapolate forward view beyond 1-sentence label)
