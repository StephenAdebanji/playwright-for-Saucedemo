# Test Strategy

## Scope and risk

| Area                              | Main risk                                                        | Layer                     | Gate    |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------- | ------- |
| Authentication and access control | Unauthorised access; locked accounts get in                      | UI + API                  | PR      |
| Catalog and pricing               | Wrong price shown or charged                                     | UI (golden dataset) + API | PR      |
| Cart and checkout                 | Lost revenue from a broken purchase flow; wrong totals or tax    | UI                        | PR      |
| API contracts                     | Consumers break on schema drift                                  | API (zod, strict)         | PR      |
| Data integrity                    | Financial or inventory data contradicts itself                   | API (whole dataset)       | PR      |
| Accessibility                     | WCAG 2.1 AA regressions                                          | axe-core                  | PR      |
| Visual correctness                | Layout or image regressions that pixel diffs miss or over-report | AI oracle                 | Nightly |
| Stability                         | Flaky tests erode trust in CI                                    | Repeat runs               | Nightly |

## Shape of the suite

- **Unit (15):** the framework's own logic. AI redaction, prompt building and reconciliation, money maths.
  This code decides what leaves CI and how results are interpreted, so it needs tests of its own.
- **API (31):** contract, pagination, query semantics, auth, and integrity across the whole dataset.
  Fast and deterministic, so most data rules live here.
- **UI (62 per browser):** user journeys, plus UI-specific data checks: rendered catalog vs. the golden
  dataset, sort order computed from scraped data, and order-total arithmetic.
- **Accessibility (4):** one scan per key page.
- **AI (2):** nightly only.

Logged-in state is created once (`auth.setup.ts`) and reused. Only tests _about_ login go through the login form.

## Principles

1. **Validate against an independent source of truth.** UI prices are checked against `src/data/catalog.ts`,
   not against other UI pages, so a regression can't "agree with itself".
2. **Compute expectations, don't hard-code them.** Sorting tests derive the expected order from the
   scraped data, so they stay correct if the catalog changes.
3. **Known defects are executable.** `expectKnownDefect(id)` keeps CI green, makes the defect visible,
   and fails the build when the bug is fixed (see the README).
4. **No arbitrary waits.** Lint bans `waitForTimeout`, `networkidle` and `force: true`. Every wait is a
   web-first assertion on a real state change.
5. **Fail fast and specifically.** Every API response is validated at the boundary, and a contract break
   reports the exact path (`products.12.price`). Data rules list every offending record.

## Flakiness policy

- PRs run with `retries: 2`, but a test that only passes on retry is reported as **flaky**, never as passed,
  and the AI triage flags it.
- Nightly runs repeat every UI test 5× with `retries: 0`.
- A flaky test is either fixed at the root cause or quarantined with a tracked ticket. It is never just
  given more retries.

## AI usage policy

- AI is **advisory**. It never decides whether a merge passes or fails.
- Before anything is sent to the model, error text and titles are redacted (JWTs, API keys, passwords, emails).
- Outputs are schema-constrained. Any IDs the model invents are dropped; any it skips are back-filled as `unknown`.
- AI oracles must pass a negative and a positive control. Otherwise their verdicts are ignored.

## Not automated (deliberately)

- **Exploratory and usability testing:** human judgement is the point.
- **Load testing:** belongs in a dedicated tool (k6) against an environment we own, not a public demo.
- **Pixel-perfect visual baselines:** they break across OS and font rendering for little signal on a
  third-party site. The AI oracle covers the user-visible part.
