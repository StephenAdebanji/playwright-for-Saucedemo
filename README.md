# Playwright Quality Engineering

[![CI](https://github.com/StephenAdebanji/playwright-quality-engineering/actions/workflows/ci.yml/badge.svg)](https://github.com/StephenAdebanji/playwright-quality-engineering/actions/workflows/ci.yml)

A production-style test automation framework in **Playwright + TypeScript** covering UI, API contracts,
data integrity, accessibility, and **AI-assisted testing**. It runs against two public systems,
[SauceDemo](https://www.saucedemo.com) (web UI) and [DummyJSON](https://dummyjson.com) (REST API).

The suite found **11 real defects** in these systems. Each one is tracked as an executable test, so you
can reproduce it by running the suite.

|                        |                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **QA automation**      | Page Object Model, typed fixtures, auth via `storageState`, cross-browser + mobile, sharded CI                                  |
| **Automated testing**  | 114 test definitions across UI, API, accessibility and unit layers; ~165 executions per CI run                                  |
| **Data validation**    | Golden-dataset UI checks, order-total arithmetic, zod contract schemas, full-dataset integrity and referential rules            |
| **AI-enabled testing** | Claude-powered CI failure triage; LLM visual oracle with positive/negative controls; secret redaction before any data leaves CI |

---

## Highlights

### 1. Known defects as code, not as skipped tests

[`src/data/known-defects.ts`](src/data/known-defects.ts) is a defect register. A test linked to a defect
is marked as an _expected failure_ and annotated with the defect ID:

```ts
test('"In Stock" products can satisfy their own minimum order quantity', async ({ dataset }) => {
  expectKnownDefect('DQ-02');
  ...
```

This has three effects:

- CI stays green while the defect is open.
- The report shows the defect ID next to the test.
- When the bug is fixed, the test **unexpectedly passes and fails the build**, so the register can't silently go stale.

### 2. One behavioural contract, every persona

SauceDemo has six user personas, several of them deliberately broken. Instead of writing bespoke tests
for each one, [`personas.spec.ts`](tests/ui/personas.spec.ts) runs **the same six customer-facing checks against
every persona**. A deviation matrix then declares where each persona is expected to fail:

```ts
const DEVIATIONS = {
  problem_user: { images: 'SD-02', sorting: 'SD-03', cart: 'SD-04', checkout: 'SD-05' },
  error_user:   { sorting: 'SD-03', cart: 'SD-04', checkout: 'SD-06' },
  ...
```

### 3. Data validation over the whole dataset, not samples

[`data-integrity.spec.ts`](tests/api/data-integrity.spec.ts) pulls every product, cart and user once per worker
(about 3 requests, which keeps the suite inside the API's rate limit). It then checks business rules across
all of them:

- **Financial:** each line total = price × quantity; discounts reconcile; cart totals equal the sum of their lines.
- **Referential:** every cart belongs to a real user, and every cart line points to a real product at the catalog price.
- **Consistency:** stock status follows from stock level; anything "In Stock" can actually be bought.

When a rule fails, the test lists _every_ offending record, so the report also works as a data-quality audit.

### 4. AI-assisted testing, built to be trusted

| Component                                          | What it does                                                                                                                                                                                             | How it stays trustworthy                                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AI triage reporter](src/ai/ai-triage-reporter.ts) | After a CI run, sends all failures to Claude, which classifies each one (product defect, test defect, environment, flaky) with a root-cause hypothesis. The result is written to the GitHub job summary. | Structured output with a fixed set of categories. Secrets and PII are redacted before sending. Any IDs the model invents are dropped and any it skips are added back. Without an API key it falls back to a plain table, and it never fails the build. Unit-tested without network calls. |
| [Visual oracle](tests/ai/visual-oracle.spec.ts)    | Compares screenshots and describes user-visible visual defects in plain language.                                                                                                                        | Run like a measuring instrument with a **negative control** (identical pages must report no differences) and a **positive control** (a known-broken page must be flagged). Runs nightly, never as a merge gate.                                                                           |

### 5. Engineering hygiene

- **Flake policy:** a nightly run repeats every UI test 5× with retries off. While building this I found and fixed a race in one of my own tests (an SPA route change); the fix is explained in a comment in `tests/ui/inventory.spec.ts`.
- **Accessibility:** a WCAG 2.1 AA scan (axe-core) runs on key pages. It fails on _new_ violations and also when a baselined violation is fixed, so the baseline only ever shrinks.
- **CI:** lint, typecheck and unit tests run first (under 1 minute) → tests run across 3 shards → one merged HTML report plus AI triage.
- Test data is seeded per test with faker, so a failure can be reproduced from its test ID alone.
- Third-party telemetry is blocked in an auto fixture so it can't slow tests down or make them flaky.

---

## Defects found

| ID     | System    | Finding                                                                                                           |
| ------ | --------- | ----------------------------------------------------------------------------------------------------------------- |
| SD-01  | SauceDemo | Order summary shows unrounded floating-point totals (`Item total: $113.94999999999999`) for the **standard** user |
| SD-02  | SauceDemo | `problem_user` and `visual_user`: product images replaced by a 404 placeholder                                    |
| SD-03  | SauceDemo | `problem_user` and `error_user`: sorting has no effect                                                            |
| SD-04  | SauceDemo | `problem_user` and `error_user`: only 2 of 6 products can be added; "Remove" does nothing                         |
| SD-05  | SauceDemo | `problem_user`: typing in Last Name overwrites First Name                                                         |
| SD-06  | SauceDemo | `error_user`: "Finish" doesn't complete the order                                                                 |
| SD-07  | SauceDemo | `performance_glitch_user`: login takes ~5 s (budget is 2 s)                                                       |
| SD-08  | SauceDemo | `visual_user`: inventory prices are re-randomised on every render and don't match checkout                        |
| SEC-01 | DummyJSON | `/auth/me` returns **500** `invalid signature` for a tampered JWT (expected 401)                                  |
| DQ-01  | DummyJSON | `availabilityStatus` isn't a function of stock: stock = 7 is labelled both "Low Stock" and "In Stock"             |
| DQ-02  | DummyJSON | 8 products are marked "In Stock" with a minimum order quantity larger than their stock, so they can't be bought   |

Reproduction steps and impact for each: [docs/DEFECTS.md](docs/DEFECTS.md).

---

## Project structure

```
src/
  ai/            Claude client, failure triage + reporter, visual oracle
  api/           Typed DummyJSON client + zod contract schemas
  config/        Environment config (everything has a default)
  data/          Golden catalog, personas, known-defect register
  fixtures/      test.extend fixtures: page objects, loginAs, seeded customer, API dataset
  pages/         Page Objects (+ shared Header component)
  utils/         Money parsing/rounding
tests/
  auth.setup.ts  Logs in once; UI projects reuse the session
  ui/            Login, inventory, cart, checkout, persona contract
  api/           Contract, pagination, query semantics, auth, data integrity
  a11y/          axe-core WCAG 2.1 AA scan with baseline ratchet
  ai/            LLM visual oracle (opt-in)
  unit/          Tests for the framework's own logic (redaction, prompt building, money)
docs/            Test strategy, defect write-ups
```

## Running it

```bash
nvm use                      # Node 22
npm ci
npx playwright install chromium firefox

npm test                     # everything (AI suite auto-skips without a key)
npm run test:smoke           # @smoke subset across layers
npm run test:api             # API contract + data integrity only
npm run test:ui              # Chromium, Firefox, mobile
npm run verify               # lint + typecheck + format + unit tests
npm run report               # open the HTML report
```

To enable the AI features, set `ANTHROPIC_API_KEY` (see `.env.example`). In CI, add it as a repository
secret. The nightly AI job also requires the repository variable `ENABLE_AI_CHECKS=true`.

Further reading: [Test strategy](docs/TEST_STRATEGY.md) · [Defects](docs/DEFECTS.md)
