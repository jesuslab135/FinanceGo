# Finance Administration App — Design Spec

Date: 2026-09-30
Status: Approved in brainstorming, pending written-spec review

## 1. Purpose and success criteria

A responsive, multi-user personal finance web app, also built as a portfolio piece (clean architecture, tests, CI).

Users register expenses, define recurring income sources and fixed payments that are deducted from the month's income, keep reference data about their debit/credit cards, track credit-card debt, and see a dashboard by day, week, or month.

Success means:

- A new user can sign up, add income sources, fixed payments, and cards, log expenses, and immediately see an accurate **Available** figure for the month.
- Data of one user is never visible to another user.
- The app works well on a phone (≈375 px wide) and on desktop.
- Everything runs with `docker compose up`.
- CI verifies formatting, lint, tests, generated-code drift, and image builds.

## 2. Decisions

| Topic | Decision |
|---|---|
| Users | Public sign-up, fully isolated data per user (multi-tenant by `user_id`) |
| Income model | Recurring income sources + recurring fixed payments, auto-generated per month, editable per month |
| Card purchases | Reduce **Available** when the purchase is made (accrual); card payments are transfers, not spending |
| Currency / language | One currency per user (ISO 4217, chosen at signup, no conversion); UI in Spanish and English |
| Backend | Go, Gin, pgx/v5, sqlc, goose migrations, swag (OpenAPI) |
| Database | PostgreSQL 17 |
| Frontend | Next.js (App Router, TypeScript), Tailwind + shadcn/ui, TanStack Query, react-hook-form + zod, next-intl, Recharts |
| Money | `BIGINT` cents everywhere (DB, API, TS); never floats |
| Card data | Reference only: nickname, type, bank, network, last 4 digits. **Never** full PAN, CVV, or expiry |

The existing `financeGo/` scaffold (Gin + GORM, non-compiling, `float64` money) is replaced; GORM is removed.

## 3. Repository layout

Monorepo at `financeGo/`:

```
financeGo/
  api/
    cmd/api/main.go
    internal/
      config/        env loading
      auth/          argon2id hashing, JWT, refresh tokens
      http/          router, middleware, handlers, error mapping, DTOs
      service/       business rules (one file per domain)
      recurrence/    month generation, day clamping (pure functions)
      cards/         statement cycle and balance math (pure functions)
      store/         sqlc-generated code
    migrations/      goose SQL migrations
    queries/         sqlc SQL files
    sqlc.yaml
    Dockerfile
  web/
    src/app/[locale]/...   pages
    src/lib/api/           generated OpenAPI types + client
    src/components/...
    messages/{es,en}.json
    Dockerfile
  docker-compose.yml
  docker-compose.override.yml   dev: air + next dev
  .env.example
  .github/workflows/ci.yml
  docs/superpowers/{specs,plans}/
```

Layers in the API: handler (HTTP, binding, DTO) → service (rules, ownership checks) → store (sqlc). `recurrence` and `cards` are pure packages with no DB access, so they can be unit-tested exhaustively.

## 4. Data model

All tables have `id BIGINT GENERATED ALWAYS AS IDENTITY`, `created_at`, `updated_at` (timestamptz). Every user-owned table has `user_id BIGINT NOT NULL REFERENCES users ON DELETE CASCADE` and an index starting with `user_id`. All amounts are `BIGINT` cents with `CHECK (amount > 0)` unless noted.

**users**: `email CITEXT UNIQUE`, `password_hash`, `name`, `currency CHAR(3)`, `locale` (`es`|`en`), `timezone` (IANA name, e.g. `America/Tijuana`).

**refresh_tokens**: `user_id`, `token_hash` (SHA-256, unique), `expires_at`, `revoked_at NULL`, `replaced_by NULL`.

**categories**: `user_id`, `name`, `kind` (`expense`|`income`), `color`, `icon`; unique `(user_id, kind, name)`. At signup the user gets defaults: Comida, Transporte, Vivienda, Servicios, Salud, Entretenimiento, Suscripciones, Intereses y comisiones, Otros (expense) and Salario, Otros ingresos (income). Names are stored as created; the UI does not translate user data.

**payment_methods**: `user_id`, `nickname`, `type` (`credit`|`debit`|`cash`|`transfer`), `bank NULL`, `network NULL` (`visa`|`mastercard`|`amex`|`other`), `last4 CHAR(4) NULL CHECK (last4 ~ '^[0-9]{4}$')`, `color`, `active BOOL`.
Credit-only columns (NULL for other types, enforced by CHECK): `credit_limit BIGINT`, `statement_day SMALLINT 1–31`, `payment_due_day SMALLINT 1–31`, `opening_balance BIGINT DEFAULT 0 CHECK (>= 0)`, `opening_balance_date DATE`.

**income_sources**: `user_id`, `category_id NULL`, `name`, `amount`, `day_of_month 1–31`, `start_month DATE` (first of month), `end_month DATE NULL`, `active BOOL`.

**fixed_payments**: `user_id`, `category_id`, `payment_method_id NULL`, `name`, `amount`, `day_of_month 1–31`, `start_month`, `end_month NULL`, `active`.

**monthly_entries**: `user_id`, `month DATE` (first of month), `kind` (`income`|`fixed`), `income_source_id NULL`, `fixed_payment_id NULL`, `installment_plan_id NULL` (exactly one set, matching `kind`; CHECK-enforced), `name` (copied from the template), `category_id`, `payment_method_id NULL`, `amount`, `due_date DATE`, `status` (`pending`|`paid`|`received`|`skipped`), `settled_on DATE NULL`, `edited BOOL DEFAULT false`.
Unique indexes: `(fixed_payment_id, month)` and `(income_source_id, month)`.

**expenses**: `user_id`, `category_id`, `payment_method_id NULL`, `amount`, `description`, `spent_on DATE`. Index `(user_id, spent_on)`.

**card_payments**: `user_id`, `payment_method_id` (must be `type = credit`), `amount`, `paid_on DATE`, `note`.

**installment_plans** (meses sin intereses, MSI): `user_id`, `payment_method_id` (must be `type = credit`), `category_id`, `description`, `total_amount`, `installments SMALLINT` (2–48), `purchased_on DATE`, `active BOOL`. Installment `k` (1..N) = `total_amount / N`, rounded down to the cent; the last installment takes the remainder so the installments sum exactly to the total.

**category_budgets**: `user_id`, `category_id` (an expense category), `monthly_limit`; unique `(user_id, category_id)`. Optional per-category spending limit.

`monthly_entries.kind` is `income`|`fixed`|`installment`. Installment rows have `installment_plan_id` and `installment_no SMALLINT` set (unique `(installment_plan_id, installment_no)`), and inherit `category_id` and `payment_method_id` from the plan.

## 5. Core rules

### 5.1 Month generation (lazy, idempotent)

Any read of month `M` (entries, dashboard summary, series covering `M`) first calls `EnsureMonth(user, M)`. That is a single SQL statement: `INSERT ... SELECT` from active templates where `start_month <= M` and (`end_month IS NULL` or `end_month >= M`), with `ON CONFLICT DO NOTHING`. It is safe to call concurrently and repeatedly. No cron job is needed.

- **Day clamping:** `due_date = M + min(day_of_month, last day of M) - 1`. A payment set for the 31st falls on Feb 28/29, Apr 30, and so on.
- **Future months** are generated only when requested, up to 12 months ahead. Requests further out are rejected with 422.
- **Editing a template** (amount, name, category, card, day) updates the rows for the current and future months that are still `pending` and have `edited = false`. Past months and rows edited by hand are never changed.
- **Deactivating a template** or setting `end_month` deletes its `pending`, unedited rows after the end month. All other rows are kept.
- **Editing a monthly entry** sets `edited = true`.

### 5.2 Month balance

For month `M`:

- `Income = Σ income entries where status ≠ skipped`
- `FixedCommitted = Σ fixed entries where status ≠ skipped`
- `FixedPaid = Σ fixed entries where status = paid`
- `Installments = Σ installment entries of M where status ≠ skipped`
- `Spent = Σ expenses with spent_on in M`
- **`Available = Income − FixedCommitted − Installments − Spent`** (may be negative)
- **`SafeToSpendPerDay`** = `max(0, Available) ÷ days remaining in M, including today`. It is shown only for the current month.

Card payments are not part of `Spent`: they are transfers. Regular credit-card purchases count in `Spent` on the purchase date. An MSI purchase is **not** an expense; each installment counts in the month it is billed (see 5.5).

**Category budgets:** for each category that has a limit, the summary returns `spent`, `limit`, and `pct`. Here, `spent` = the category's expenses in M plus its fixed and installment entries in M that are not skipped. The UI shows amber at 80 % or more and red above 100 %.

### 5.3 Dashboard periods

The `day`, `week`, and `month` series cover the expenses plus the fixed entries whose `due_date` falls in each bucket, with each series reported separately. Empty buckets are returned as 0 (`generate_series`). Weeks are ISO weeks (Monday–Sunday) via `date_trunc('week', …)`. All dates are calendar dates in the user's timezone. The client sends local dates, and "today" is computed server-side with the user's `timezone`.

### 5.4 Credit-card debt

- **Charges on card C:** expenses with `payment_method_id = C` plus fixed entries with `payment_method_id = C`. A fixed entry counts when its status is `paid`, and only from `opening_balance_date` onward.
- **Current balance** = `opening_balance + charges − card_payments` (all from `opening_balance_date` onward). Section 5.5 extends this with installment plans.
- **Statement cycle `YYYY-MM`:** the cycle closes on `statement_day` of that month (clamped) and opens the day after the previous close.
  - **Statement balance** = the billed balance as of the close date (defined in 5.5).
  - **Due date** = the next occurrence of `payment_due_day` after the close date.
  - **Amount due** = `max(0, statement balance − payments made after close and up to the due date)`.
- **Utilization** = current balance ÷ `credit_limit` (omitted when there is no limit).
- **Interest and fees** are entered by the user as expenses on the card, in category "Intereses y comisiones". The app does not calculate interest.

### 5.5 Meses sin intereses (installment plans)

- **Billing:** the first installment is billed in the statement cycle that contains `purchased_on`, and installment `k` in the cycle `k − 1` after that.
- **Monthly entries:** `EnsureMonth` also creates `installment` entries for installments whose cycle **closes** in month M. The entry's `due_date` is that cycle's payment due date and its status starts as `pending`. Installment entries are *not* card charges themselves; they are the budget view of the plan.
- **Card balance** (updates 5.4):
  - The **regular charges** on a card are its expenses plus its paid fixed entries.
  - **Current balance (debt)** = `opening_balance + regular charges + Σ total_amount of the card's plans − card_payments`. The whole remaining MSI principal counts against the limit and utilization, the way banks count it.
  - **Billed balance at the close of cycle C** = `opening_balance + regular charges up to close + Σ installments billed in cycles ≤ C − payments up to close`.
  - **Amount due for C** = `max(0, billed balance − payments after close up to the due date)`, which is the amount to pay to avoid interest.
  - The statement endpoint lists the installments billed in C (`k/N`), and each plan shows its remaining installments and remaining amount.
- **Editing a plan:** a plan can be edited only while none of its installments have been billed in a closed cycle. Otherwise, only `description`, `category_id`, and `active` can change. Setting a plan inactive (cancelled or refunded) deletes its future pending entries and removes the unbilled remainder from the debt.

### 5.6 Upcoming dues

`GET /dashboard/upcoming?days=7..60` returns, sorted by date:

- `pending` fixed entries due within the window
- the amount due and due date for each credit card whose due date falls within the window and whose amount due is greater than 0. That amount already includes the card's billed MSI installments, so installment entries are **not** listed separately (avoiding double counting).

These are in-app only. Email and push notifications are out of scope.

## 6. API

The base path is `/api/v1`. JSON, `snake_case`, amounts as integer cents, dates as `YYYY-MM-DD`, months as `YYYY-MM`.

Every error uses the same shape, `{ "error": { "code": "validation_failed", "message": "...", "fields": { "amount": "must be > 0" } } }`, with these statuses:

- 400: bad JSON
- 401: not authenticated
- 404: not found, **including resources owned by another user**
- 409: conflict (for example, deleting a category that is still in use without `reassign_to`)
- 422: validation
- 429: rate limited
- 500: internal error, with a request ID and no details

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`, `PATCH /me` |
| Categories | `GET/POST /categories`, `PATCH/DELETE /categories/{id}?reassign_to=` |
| Payment methods | `GET/POST /payment-methods`, `PATCH/DELETE /payment-methods/{id}`, `GET /payment-methods/{id}/statement?cycle=YYYY-MM` |
| Card payments | `GET /card-payments?payment_method_id&from&to`, `POST /card-payments`, `DELETE /card-payments/{id}` |
| Income sources | `GET/POST /income-sources`, `PATCH/DELETE /income-sources/{id}` (DELETE deactivates) |
| Fixed payments | `GET/POST /fixed-payments`, `PATCH/DELETE /fixed-payments/{id}` (DELETE deactivates) |
| Monthly entries | `GET /months/{yyyy-mm}/entries`, `PATCH /entries/{id}` (amount, status, settled_on, payment_method_id) |
| Expenses | `GET /expenses?from&to&category_id&payment_method_id&q&cursor&limit`, `POST /expenses`, `PATCH/DELETE /expenses/{id}` |
| Installment plans (MSI) | `GET /installment-plans?payment_method_id&active`, `POST /installment-plans`, `PATCH/DELETE /installment-plans/{id}` (DELETE deactivates) |
| Category budgets | `GET /category-budgets`, `PUT /category-budgets/{category_id}` (upsert), `DELETE /category-budgets/{category_id}` |
| Dashboard | `GET /dashboard/summary?month=` (includes installments, safe-to-spend, and category budgets), `GET /dashboard/series?period=day\|week\|month&from&to`, `GET /dashboard/breakdown?by=category\|payment_method&from&to`, `GET /dashboard/cards`, `GET /dashboard/upcoming?days=` |
| Export and account | `GET /export/expenses.csv?from&to`, `GET /export/entries.csv?from&to` (UTF-8 with BOM so Excel opens it cleanly, amounts as decimals), `DELETE /me` (requires `password` in the body; deletes the account and all its data) |
| Ops | `GET /healthz` (liveness), `GET /readyz` (DB ping), `GET /docs/*` (Swagger UI) |

A payment method that is in use cannot be deleted (409). Deactivate it instead (`active = false`).

**Validation:**

- Amounts must be ≥ 1 and < 10¹².
- `day_of_month` must be 1–31.
- `from ≤ to`, with a range of at most 366 days for `day` series and at most 5 years for the others.
- Every referenced `*_id` must belong to the caller; otherwise the request fails with 422 `invalid_reference`.

## 7. Auth and security

- **Passwords:** argon2id (`golang.org/x/crypto/argon2`, OWASP parameters). Minimum 8 characters.
- **Access token:** HS256 JWT with a 15-minute TTL, carrying `sub = user_id`. Sent as `Authorization: Bearer`.
- **Refresh token:** 32 random bytes in an httpOnly, `Secure`, `SameSite=Lax` cookie scoped to `/api/v1/auth`, with a 30-day TTL. The database stores only its SHA-256 hash.
  - It is rotated on every refresh.
  - If an already-rotated token is used again, the user's whole token family is revoked.
- **Login is uniform:** the same error comes back whether the email exists or not, and argon2 runs even for unknown emails.
- **Rate limiting:** a per-IP token bucket on `/auth/*` (10/min).
- **CORS:** only `WEB_ORIGIN` is allowed, with credentials.
- **Security headers:** `X-Content-Type-Options`, `Referrer-Policy`, and a Content Security Policy on the web app.
- **Logging:** structured `slog` JSON with a request ID. Passwords, tokens, and full request bodies are never logged.
- **Tenant isolation:** every sqlc query on user data takes `user_id` as a parameter. An integration test asserts cross-user access fails on every endpoint.

## 8. Frontend

- **Routing:** `/[locale]/(auth)/login|register` and `/[locale]/(app)/dashboard|expenses|month/[yyyy-mm]|recurring|cards|cards/[id]|categories|settings`.
- **API client:** `openapi-typescript` generates types from the API's `swagger.json`, and `openapi-fetch` is the client. TanStack Query hooks sit per domain, and mutations invalidate the queries for the affected month and dashboard.
- **Auth:**
  - The access token lives in memory only.
  - On load, the app calls `/auth/refresh` to restore the session.
  - A 401 triggers a single refresh and a retry.
  - Next.js middleware redirects to `/login` when there is no session cookie hint.
- **Money:** held as integer cents in state. Input converts decimal text to cents with string math, never floats. Display uses `Intl.NumberFormat(locale, { style: 'currency', currency })`.
- **Dashboard:**
  - A Day / Week / Month toggle and a date picker.
  - KPI cards: Income, Fixed committed (with paid/pending), Spent, Available (red when below zero).
  - A spending bar chart, a category donut, a by-payment-method list, upcoming fixed payments with "mark paid", and a card debt summary.
- **Dashboard additions from research:** a "safe to spend today" figure under Available, category budget progress bars, and an "Upcoming" list (next 7 days, with a toggle for 30) that includes card payment due dates.
- **MSI:** from the card detail page, "New MSI purchase" opens a form with total, number of months, date, and category. Each plan appears as a row with a `k/N` progress bar and the remaining amount.
- **PWA:** a web manifest and icons so the app can be installed on a phone home screen. There is no offline mode.
- **Settings** also offers CSV export (date range) and "Delete account" (confirmation dialog plus password).
- **Cards page:** a card list with type, network, and last 4 digits. The credit-card detail page shows the current balance, the cycle selector with statement balance, amount due and due date, a utilization bar, charges, payments, and "record payment".
- **Responsive:**
  - Mobile-first.
  - Below `md`: a bottom tab bar (Dashboard, Expenses, **+**, Cards, More), lists rendered as cards, and dialogs as bottom sheets.
  - From `md` up: a sidebar and data tables.
- **Theme and accessibility:** light and dark themes, WCAG AA contrast, keyboard-accessible dialogs (shadcn/Radix).
- **i18n:** next-intl messages in `es.json` and `en.json`. The locale comes from the user profile (falling back to `Accept-Language`).

## 9. Testing

- **Go unit tests** (table-driven, TDD):
  - `recurrence`: clamping, start/end months, leap years, and template-edit propagation rules
  - balance math
  - `cards`: cycle boundaries, amount due, the opening balance, MSI installment billing (cycle assignment, remainder on the last installment, plans spanning a year boundary), and the current balance vs. billed balance
  - validators and error mapping
- **Go integration tests** (testcontainers-go, `postgres:17`, goose migrations applied):
  - every sqlc query
  - `EnsureMonth` idempotency, including concurrent calls
  - the auth flow, including refresh-token reuse detection
  - a **cross-tenant matrix**: user B's token against user A's IDs on every endpoint returns 404 or 422
  - dashboard series with empty buckets
- **Web:**
  - Vitest + Testing Library for money parsing and formatting, forms, and the KPI component.
  - Playwright end-to-end against `docker compose`: register → add an income source and a fixed payment on a credit card → add a card expense → the dashboard Available figure is correct → record a card payment → the card balance is correct → switch the language to English.

## 10. Docker, configuration, CI

- **`docker-compose.yml`:**
  - `db`: `postgres:17`, a named volume, and a `pg_isready` healthcheck.
  - `api`: a multi-stage Go build on distroless, running as non-root. It runs goose migrations at startup, then serves on `:8080`.
  - `web`: a Next.js standalone build on `:3000`.
  - `api` and `web` start only after `db` is healthy.
- **`docker-compose.override.yml` (dev):** `air` hot reload for the API, `next dev` for the web app, and bind mounts.
- **Configuration** is environment-only, documented in `.env.example`: `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN`, `API_PORT`, `COOKIE_SECURE`, `NEXT_PUBLIC_API_URL`. `.env` is gitignored.
- **CI (GitHub Actions):**
  - **API:** `gofmt` check, `go vet`, `golangci-lint`, `go test ./...` (integration tests via Docker on the runner), and `sqlc generate` + `swag init` followed by `git diff --exit-code`.
  - **Web:** `lint`, `tsc --noEmit`, `vitest`, `next build`, and the generated API types checked for drift.
  - **Docker:** both images build.
- **Local note:** the repo lives under OneDrive, where Go builds are known to fail. Go builds and tests run from a git worktree outside OneDrive.

## 11. Delivery order

1. Repo restructure, git init, tooling (sqlc, goose, swag, lint, compose with db)
2. Schema migrations and sqlc queries
3. Auth (register/login/refresh/logout/me) + middleware + error model
4. Categories + payment methods
5. Income sources, fixed payments, `recurrence` package, `EnsureMonth`, monthly entries
6. Expenses
7. Card payments + `cards` package + statement endpoint + installment plans (MSI)
8. Dashboard endpoints (summary with safe-to-spend and category budgets, series, breakdown, cards, upcoming) + CSV export + account deletion
9. Web shell: Next.js, i18n, auth flow, generated client, layout (sidebar/bottom bar)
10. Web pages: expenses, month, recurring, cards, categories, settings
11. Dashboard UI and charts
12. Docker production images, CI, Playwright E2E, README

## 12. Additions from research (2026-09-30)

These were added after checking current personal-finance apps and Mexican credit-card practice. They were not discussed in the brainstorming conversation and are flagged here for the owner's review:

| Addition | Why |
|---|---|
| Meses sin intereses (5.5) | A common way to pay with credit cards in Mexico. Apps such as Vexi and bank apps track installment plans alongside cut-off (*fecha de corte*) and payment (*fecha límite de pago*) dates. |
| Safe-to-spend per day (5.2) | PocketGuard-style "safe to spend" guardrails are a headline feature of popular 2026 budgeting apps. |
| Category monthly limits (5.2) | Budget limits per category appear on nearly every must-have feature list. Implemented as simple limits, not envelope budgeting. |
| Upcoming dues (5.6) | Bill reminders are a must-have. Shown in the app only, with no notification infrastructure. |
| CSV export and account deletion | Users own their data. Required for a public multi-user app under Mexico's personal-data law (LFPDPPP) and GDPR-style expectations. |
| PWA manifest | Makes the web app installable on a phone at almost no cost. |

**Deferred to v1.1+** (common in the apps reviewed, but they add real scope): savings goals, auto-categorization rules, recurring-expense detection, receipt photos, email/push reminders, net-worth tracking, CSV/bank import, and shared household budgets.

## 13. Out of scope (v1)

- Shared households or multiple users on one budget
- Multi-currency or exchange rates
- Bank sync or CSV import
- Budget envelopes
- Interest calculation or payoff planners
- Notifications or email
- Receipts or attachments
- Native mobile apps
