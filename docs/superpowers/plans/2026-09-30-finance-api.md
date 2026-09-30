# Finance App — API Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Go REST API for the multi-user finance app: auth, categories, payment methods, recurring income and fixed payments with lazy month generation, expenses, credit-card debt with MSI installment plans, dashboards, CSV export, Docker image, and CI.

**Architecture:** One Go module in `api/`. Gin handlers (`internal/httpapi`) bind JSON and call a `service.Service` that owns the business rules and runs sqlc-generated queries (`internal/store`) on a pgx pool. Pure date and card maths live in `internal/datex` and `internal/cards` with exhaustive unit tests. Integration tests drive the real router against a throwaway PostgreSQL 17 database per test, cloned from a migrated template in a testcontainers container.

**Tech Stack:** Go 1.26, Gin, pgx/v5 + pgxpool, sqlc v1.29.0, goose v3 (embedded migrations, run at startup), golang-jwt/jwt/v5, golang.org/x/crypto/argon2, golang.org/x/time/rate, gin-contrib/cors, swaggo/swag v1.16.4 + gin-swagger, testcontainers-go (postgres module), PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-09-30-finance-app-design.md`. Read it before starting any task. Plan 2 (`2026-09-30-finance-web.md`) builds the Next.js client on top of this API.

## Global Constraints

- Module path is `financego`, in `api/go.mod`, `go 1.26`.
- **Money is `int64` cents** in Go, `BIGINT` in SQL and integers in JSON. Never use `float64` for money. Every amount except `opening_balance` must satisfy `1 <= amount < 1_000_000_000_000` (opening_balance may be 0).
- **Dates** are calendar dates held as `time.Time` at 00:00 UTC. They travel in JSON as `"YYYY-MM-DD"` (`datex.Date`) and months as `"YYYY-MM"` (`datex.Month`). "Today" is always computed in the user's IANA timezone: `Actor.Today(now)`.
- **Tenant isolation:** every query on user data filters by `user_id`. A resource owned by another user returns **404** `not_found`. A referenced `*_id` owned by another user (or missing) returns **422** `invalid_reference`.
- **Error body** is always `{"error":{"code":"...","message":"...","fields":{...}}}`. Status codes:
  - 400 `bad_request`: malformed JSON or query
  - 401 `unauthorized`
  - 404 `not_found`
  - 409 conflict codes: `email_taken`, `category_exists`, `category_in_use`, `payment_method_in_use`, `plan_locked`
  - 422 `validation_failed`, `invalid_reference`, `month_out_of_range`
  - 429 `rate_limited`
  - 500 `internal`
- **Lists** return `{"items":[...]}`. The expenses list adds `"next_cursor"`.
- **Updates** are `PUT` with the full set of editable fields (nullable fields are cleared by `null`). Templates and plans are never hard-deleted: `DELETE` deactivates or cancels them.
- **Timestamps:** every `UPDATE` query sets `updated_at = now()`.
- **Auth parameters:**
  - access JWT: HS256, 15 minutes
  - refresh token: 30 days, 32 random bytes, stored as SHA-256 hex, rotated on use; reusing a revoked token revokes its whole `family_id`
  - refresh cookie: `fin_refresh`, Path `/api/v1/auth`, HttpOnly, SameSite=Lax, Secure=`COOKIE_SECURE`
  - argon2id: m=19456 KiB, t=2, p=1, 16-byte salt, 32-byte key
  - `/auth/*` is rate-limited per IP to `AUTH_RATE_PER_MIN` (default 10) requests per minute
- **Environment variables:**
  - `DATABASE_URL` (required)
  - `JWT_SECRET` (required, at least 32 bytes)
  - `WEB_ORIGIN` (required)
  - `API_PORT` (default `8080`)
  - `COOKIE_SECURE` (default `true`)
  - `AUTH_RATE_PER_MIN` (default `10`)
- **Future months:** they can be generated at most 12 months after the current month; later months return 422 `month_out_of_range`.
- **Logging:** never log passwords, tokens or request bodies.
- **Build location:** the repo lives under OneDrive, where `go build` is known to fail. **Work in a git worktree outside OneDrive**, at `C:\dev\financego` (branch `feat/api`). Docker Desktop must be running for integration tests. `go test -short ./...` skips them.

## Review Focus

Five failure modes that the spec implies but no endpoint happy path exercises. Each one has a pinned test in the task named:

1. **Day 29–31 templates in short months:** a payment on day 31 must fall on Feb 28, Feb 29 in a leap year, and Apr 30, never spilling into the next month. Pinned in Task 3 (`TestClamp`) and Task 9 (`TestEnsureMonthClampsDay31`).
2. **User timezone at a month boundary:** a user in `America/Tijuana` at 03:00 UTC on Apr 1 is still on Mar 31. "Today", the current month and safe-to-spend must use Mar 31. Pinned in Task 6 (`TestActorTodayUsesUserTimezone`) and Task 13 (`TestSummarySafeToSpendUsesLocalDate`).
3. **Two tabs loading the same month at once:** concurrent month generation must create each entry exactly once and never return 500. Pinned in Task 9 (`TestEnsureMonthConcurrent`).
4. **Someone else's IDs used as references:** creating an expense with another user's `category_id` or `payment_method_id` must give 422 `invalid_reference`, not 500 or a leak. Pinned in Task 10 (`TestExpenseRejectsForeignReferences`) and the Task 16 matrix.
5. **MSI purchase made on the statement (cut-off) day:** it belongs to the cycle closing that day, and its first installment is billed in that cycle. A purchase one day later goes to the next cycle. Pinned in Task 11 (`TestInstallmentCycleOnStatementDay`).

## File Structure

```
api/
  go.mod, go.sum, sqlc.yaml, .golangci.yml, .swaggo, Dockerfile, .dockerignore, .air.toml
  cmd/api/main.go                  wiring, HTTP server, graceful shutdown
  migrations/embed.go              //go:embed *.sql
  migrations/00001_init.sql        full schema
  queries/*.sql                    sqlc queries, one file per domain
  internal/config/config.go        env → Config
  internal/db/migrate.go           goose Up on embedded FS
  internal/testutil/pg.go          testcontainers PG + per-test DB from template
  internal/apperr/apperr.go        typed API errors + field validator
  internal/datex/datex.go          dates, months, clamping, Date/Month JSON types
  internal/cards/cards.go          cycles, due dates, installments, statement maths
  internal/auth/password.go        argon2id
  internal/auth/tokens.go          JWT + refresh tokens
  internal/store/                  sqlc output (generated, committed)
  internal/service/service.go      Service, Actor, tx helper, shared checks
  internal/service/{users,categories,payment_methods,recurring,entries,expenses,cards,dashboard,export}.go
  internal/httpapi/router.go       routes + middleware wiring
  internal/httpapi/middleware.go   request id, access log, recover, auth, rate limit
  internal/httpapi/respond.go      error/JSON helpers, param parsing
  internal/httpapi/{auth,categories,payment_methods,recurring,entries,expenses,cards,dashboard,export}.go  handlers
  internal/httpapi/harness_test.go shared integration harness
  docs/                            swag output (generated, committed)
docker-compose.yml, docker-compose.override.yml, .env.example   (repo root)
.github/workflows/ci.yml                                         (repo root)
```

---

### Task 1: Workspace, module skeleton, config, health endpoint, compose DB

**Files:**
- Create: `api/go.mod`, `api/internal/config/config.go`, `api/internal/config/config_test.go`, `api/cmd/api/main.go` (temporary minimal version, replaced in Task 5), `docker-compose.yml`, `.env.example`

**Interfaces:**
- Produces: `config.Config{DatabaseURL string; JWTSecret []byte; WebOrigin string; Port string; CookieSecure bool; AccessTTL, RefreshTTL time.Duration; AuthRatePerMin int}`, `config.Load() (config.Config, error)`, `config.LoadFrom(get func(string) string) (config.Config, error)`

- [ ] **Step 1: Create the worktree outside OneDrive** (use superpowers:using-git-worktrees)

```bash
cd /c/Users/lider/OneDrive/Desktop/PROJECTS/financeGo
git worktree add /c/dev/financego -b feat/api
cd /c/dev/financego && mkdir -p api && cd api && go mod init financego && go mod edit -go=1.26
```

The old Gin + GORM scaffold (`cmd/`, `internal/`, `go.mod` at the repo root) is untracked in the main checkout and is **not** carried over. Do not copy it.

- [ ] **Step 2: Write the failing config test** `api/internal/config/config_test.go`

```go
package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadFromDefaults(t *testing.T) {
	cfg, err := LoadFrom(env(map[string]string{
		"DATABASE_URL": "postgres://x",
		"JWT_SECRET":   strings.Repeat("s", 32),
		"WEB_ORIGIN":   "http://localhost:3000",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || !cfg.CookieSecure || cfg.AuthRatePerMin != 10 {
		t.Fatalf("bad defaults: %+v", cfg)
	}
	if cfg.AccessTTL != 15*time.Minute || cfg.RefreshTTL != 30*24*time.Hour {
		t.Fatalf("bad ttls: %v %v", cfg.AccessTTL, cfg.RefreshTTL)
	}
}

func TestLoadFromOverrides(t *testing.T) {
	cfg, err := LoadFrom(env(map[string]string{
		"DATABASE_URL": "postgres://x", "JWT_SECRET": strings.Repeat("s", 40),
		"WEB_ORIGIN": "https://app.example", "API_PORT": "9000",
		"COOKIE_SECURE": "false", "AUTH_RATE_PER_MIN": "50",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "9000" || cfg.CookieSecure || cfg.AuthRatePerMin != 50 {
		t.Fatalf("overrides ignored: %+v", cfg)
	}
}

func TestLoadFromErrors(t *testing.T) {
	cases := map[string]map[string]string{
		"missing db":   {"JWT_SECRET": strings.Repeat("s", 32), "WEB_ORIGIN": "x"},
		"short secret": {"DATABASE_URL": "x", "JWT_SECRET": "short", "WEB_ORIGIN": "x"},
		"no origin":    {"DATABASE_URL": "x", "JWT_SECRET": strings.Repeat("s", 32)},
		"bad bool":     {"DATABASE_URL": "x", "JWT_SECRET": strings.Repeat("s", 32), "WEB_ORIGIN": "x", "COOKIE_SECURE": "maybe"},
		"bad rate":     {"DATABASE_URL": "x", "JWT_SECRET": strings.Repeat("s", 32), "WEB_ORIGIN": "x", "AUTH_RATE_PER_MIN": "0"},
	}
	for name, m := range cases {
		if _, err := LoadFrom(env(m)); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}
```

- [ ] **Step 3: Run it and confirm it fails.** Run `cd /c/dev/financego/api && go test ./internal/config/`. Expected: FAIL, `undefined: LoadFrom`.

- [ ] **Step 4: Implement** `api/internal/config/config.go`

```go
// Package config loads runtime configuration from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	DatabaseURL    string
	JWTSecret      []byte
	WebOrigin      string
	Port           string
	CookieSecure   bool
	AccessTTL      time.Duration
	RefreshTTL     time.Duration
	AuthRatePerMin int
}

func Load() (Config, error) { return LoadFrom(os.Getenv) }

func LoadFrom(get func(string) string) (Config, error) {
	cfg := Config{
		DatabaseURL:    get("DATABASE_URL"),
		JWTSecret:      []byte(get("JWT_SECRET")),
		WebOrigin:      get("WEB_ORIGIN"),
		Port:           get("API_PORT"),
		CookieSecure:   true,
		AccessTTL:      15 * time.Minute,
		RefreshTTL:     30 * 24 * time.Hour,
		AuthRatePerMin: 10,
	}
	if cfg.DatabaseURL == "" {
		return cfg, errors.New("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return cfg, errors.New("JWT_SECRET must be at least 32 bytes")
	}
	if cfg.WebOrigin == "" {
		return cfg, errors.New("WEB_ORIGIN is required")
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if v := get("COOKIE_SECURE"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return cfg, fmt.Errorf("COOKIE_SECURE: %w", err)
		}
		cfg.CookieSecure = b
	}
	if v := get("AUTH_RATE_PER_MIN"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return cfg, errors.New("AUTH_RATE_PER_MIN must be a positive integer")
		}
		cfg.AuthRatePerMin = n
	}
	return cfg, nil
}
```

- [ ] **Step 5: Run the tests and confirm they pass.** Run `go test ./internal/config/`. Expected: PASS.

- [ ] **Step 6: Add a temporary `api/cmd/api/main.go`** that only serves `/healthz`, so the module builds. Task 5 replaces it.

```go
package main

import (
	"log"
	"net/http"

	"financego/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte(`{"status":"ok"}`)) })
	log.Fatal(http.ListenAndServe(":"+cfg.Port, mux))
}
```

- [ ] **Step 7: Add the compose database and env template** at the repo root

`docker-compose.yml`. Task 17 extends it with the api and web services.

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-fin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-fin}
      POSTGRES_DB: ${POSTGRES_DB:-finance}
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pgdata:
```

`.env.example`:

```
POSTGRES_USER=fin
POSTGRES_PASSWORD=fin
POSTGRES_DB=finance
DATABASE_URL=postgres://fin:fin@localhost:5432/finance?sslmode=disable
JWT_SECRET=change-me-to-a-random-string-of-at-least-32-bytes
WEB_ORIGIN=http://localhost:3000
API_PORT=8080
COOKIE_SECURE=false
AUTH_RATE_PER_MIN=10
```

- [ ] **Step 8: Verify and commit**

```bash
cd /c/dev/financego/api && go vet ./... && go build ./... && cd .. && docker compose config -q
git add api docker-compose.yml .env.example
git commit -m "feat(api): module skeleton, config loading, compose db"
```

---

### Task 2: Schema migration, migrator, test database harness

**Files:**
- Create: `api/migrations/00001_init.sql`, `api/migrations/embed.go`, `api/internal/db/migrate.go`, `api/internal/testutil/pg.go`, `api/internal/db/migrate_test.go`

**Interfaces:**
- Produces: `migrations.FS embed.FS`, `db.Migrate(ctx context.Context, dsn string) error`, `testutil.NewPool(t *testing.T) *pgxpool.Pool` (a fresh, migrated database per call; the test is skipped under `-short`)

- [ ] **Step 1: Add dependencies**

```bash
cd /c/dev/financego/api
go get github.com/jackc/pgx/v5@latest github.com/pressly/goose/v3@latest \
  github.com/testcontainers/testcontainers-go@latest github.com/testcontainers/testcontainers-go/modules/postgres@latest
```

- [ ] **Step 2: Write the schema** `api/migrations/00001_init.sql`

```sql
-- +goose Up
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    currency      TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    locale        TEXT NOT NULL CHECK (locale IN ('es', 'en')),
    timezone      TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    family_id  TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE categories (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    kind       TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    color      TEXT NOT NULL DEFAULT '#64748b',
    icon       TEXT NOT NULL DEFAULT 'tag',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, kind, name)
);

CREATE TABLE payment_methods (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    nickname             TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 60),
    type                 TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'cash', 'transfer')),
    bank                 TEXT,
    network              TEXT CHECK (network IN ('visa', 'mastercard', 'amex', 'other')),
    last4                TEXT CHECK (last4 ~ '^[0-9]{4}$'),
    color                TEXT NOT NULL DEFAULT '#64748b',
    active               BOOLEAN NOT NULL DEFAULT true,
    credit_limit         BIGINT CHECK (credit_limit > 0),
    statement_day        INTEGER CHECK (statement_day BETWEEN 1 AND 31),
    payment_due_day      INTEGER CHECK (payment_due_day BETWEEN 1 AND 31),
    opening_balance      BIGINT NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
    opening_balance_date DATE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((type = 'credit') = (statement_day IS NOT NULL AND payment_due_day IS NOT NULL AND opening_balance_date IS NOT NULL)),
    CHECK (type = 'credit' OR (credit_limit IS NULL AND opening_balance = 0))
);
CREATE INDEX payment_methods_user_idx ON payment_methods (user_id);

CREATE TABLE income_sources (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    category_id  BIGINT REFERENCES categories,
    name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    amount       BIGINT NOT NULL CHECK (amount > 0),
    day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    start_month  DATE NOT NULL CHECK (EXTRACT(DAY FROM start_month) = 1),
    end_month    DATE CHECK (EXTRACT(DAY FROM end_month) = 1),
    active       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_month IS NULL OR end_month >= start_month)
);
CREATE INDEX income_sources_user_idx ON income_sources (user_id);

CREATE TABLE fixed_payments (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    category_id       BIGINT NOT NULL REFERENCES categories,
    payment_method_id BIGINT REFERENCES payment_methods,
    name              TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    amount            BIGINT NOT NULL CHECK (amount > 0),
    day_of_month      INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    start_month       DATE NOT NULL CHECK (EXTRACT(DAY FROM start_month) = 1),
    end_month         DATE CHECK (EXTRACT(DAY FROM end_month) = 1),
    active            BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_month IS NULL OR end_month >= start_month)
);
CREATE INDEX fixed_payments_user_idx ON fixed_payments (user_id);

CREATE TABLE installment_plans (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    payment_method_id BIGINT NOT NULL REFERENCES payment_methods,
    category_id       BIGINT NOT NULL REFERENCES categories,
    description       TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 120),
    total_amount      BIGINT NOT NULL CHECK (total_amount > 0),
    installments      INTEGER NOT NULL CHECK (installments BETWEEN 2 AND 48),
    purchased_on      DATE NOT NULL,
    cancelled_on      DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (total_amount >= installments)
);
CREATE INDEX installment_plans_user_idx ON installment_plans (user_id, payment_method_id);

CREATE TABLE monthly_entries (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    month               DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
    kind                TEXT NOT NULL CHECK (kind IN ('income', 'fixed', 'installment')),
    income_source_id    BIGINT REFERENCES income_sources ON DELETE CASCADE,
    fixed_payment_id    BIGINT REFERENCES fixed_payments ON DELETE CASCADE,
    installment_plan_id BIGINT REFERENCES installment_plans ON DELETE CASCADE,
    installment_no      INTEGER,
    name                TEXT NOT NULL,
    category_id         BIGINT REFERENCES categories,
    payment_method_id   BIGINT REFERENCES payment_methods,
    amount              BIGINT NOT NULL CHECK (amount > 0),
    due_date            DATE NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'received', 'skipped')),
    settled_on          DATE,
    edited              BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (kind = 'income' AND income_source_id IS NOT NULL AND fixed_payment_id IS NULL AND installment_plan_id IS NULL AND installment_no IS NULL)
     OR (kind = 'fixed' AND fixed_payment_id IS NOT NULL AND income_source_id IS NULL AND installment_plan_id IS NULL AND installment_no IS NULL)
     OR (kind = 'installment' AND installment_plan_id IS NOT NULL AND installment_no IS NOT NULL AND income_source_id IS NULL AND fixed_payment_id IS NULL)
    ),
    UNIQUE (income_source_id, month),
    UNIQUE (fixed_payment_id, month),
    UNIQUE (installment_plan_id, installment_no)
);
CREATE INDEX monthly_entries_user_month_idx ON monthly_entries (user_id, month);
CREATE INDEX monthly_entries_user_due_idx ON monthly_entries (user_id, due_date);

CREATE TABLE expenses (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    category_id       BIGINT NOT NULL REFERENCES categories,
    payment_method_id BIGINT REFERENCES payment_methods,
    amount            BIGINT NOT NULL CHECK (amount > 0),
    description       TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 200),
    spent_on          DATE NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expenses_user_spent_idx ON expenses (user_id, spent_on DESC, id DESC);

CREATE TABLE card_payments (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id           BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    payment_method_id BIGINT NOT NULL REFERENCES payment_methods,
    amount            BIGINT NOT NULL CHECK (amount > 0),
    paid_on           DATE NOT NULL,
    note              TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX card_payments_user_idx ON card_payments (user_id, payment_method_id, paid_on);

CREATE TABLE category_budgets (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    category_id   BIGINT NOT NULL REFERENCES categories ON DELETE CASCADE,
    monthly_limit BIGINT NOT NULL CHECK (monthly_limit > 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, category_id)
);

-- +goose Down
DROP TABLE category_budgets, card_payments, expenses, monthly_entries, installment_plans,
    fixed_payments, income_sources, payment_methods, categories, refresh_tokens, users;
```

- [ ] **Step 3: Embed the migrations and add the migrator**

`api/migrations/embed.go`:

```go
// Package migrations embeds the goose SQL migrations.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
```

`api/internal/db/migrate.go`:

```go
// Package db applies database migrations.
package db

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver "pgx"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/database"

	"financego/migrations"
)

// Migrate applies all pending up-migrations to the database at dsn.
func Migrate(ctx context.Context, dsn string) error {
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	p, err := goose.NewProvider(database.DialectPostgres, sqlDB, migrations.FS)
	if err != nil {
		return err
	}
	if _, err := p.Up(ctx); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Add the test harness** `api/internal/testutil/pg.go`

```go
// Package testutil provides integration-test helpers backed by a real PostgreSQL.
package testutil

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"financego/internal/db"
)

const templateDB = "fin_template"

var (
	setupOnce sync.Once
	adminDSN  string
	setupErr  error
	counter   atomic.Int64
)

func withDB(dsn, name string) string {
	u, err := url.Parse(dsn)
	if err != nil {
		panic(err)
	}
	u.Path = "/" + name
	return u.String()
}

func setup() {
	ctx := context.Background()
	ctr, err := postgres.Run(ctx, "postgres:17-alpine",
		postgres.WithDatabase("postgres"),
		postgres.WithUsername("fin"),
		postgres.WithPassword("fin"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		setupErr = err
		return
	}
	if adminDSN, err = ctr.ConnectionString(ctx, "sslmode=disable"); err != nil {
		setupErr = err
		return
	}
	conn, err := pgx.Connect(ctx, adminDSN)
	if err != nil {
		setupErr = err
		return
	}
	defer conn.Close(ctx)
	if _, err = conn.Exec(ctx, "CREATE DATABASE "+templateDB); err != nil {
		setupErr = err
		return
	}
	setupErr = db.Migrate(ctx, withDB(adminDSN, templateDB))
}

// NewPool returns a pool on a brand-new database cloned from the migrated
// template. Each test gets its own database, so tests may run in parallel.
func NewPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testing.Short() {
		t.Skip("integration test: needs Docker")
	}
	setupOnce.Do(setup)
	if setupErr != nil {
		t.Fatalf("postgres test container: %v", setupErr)
	}
	ctx := context.Background()
	name := fmt.Sprintf("t_%d_%d", os.Getpid(), counter.Add(1))
	conn, err := pgx.Connect(ctx, adminDSN)
	if err != nil {
		t.Fatal(err)
	}
	_, err = conn.Exec(ctx, fmt.Sprintf("CREATE DATABASE %s TEMPLATE %s", name, templateDB))
	conn.Close(ctx)
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, withDB(adminDSN, name))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}
```

- [ ] **Step 5: Write a test that the schema applies and its constraints hold** `api/internal/db/migrate_test.go`

```go
package db_test

import (
	"context"
	"testing"

	"financego/internal/testutil"
)

func TestSchemaConstraints(t *testing.T) {
	pool := testutil.NewPool(t)
	ctx := context.Background()
	var uid int64
	if err := pool.QueryRow(ctx, `INSERT INTO users (email,password_hash,name,currency,locale,timezone)
		VALUES ('a@b.c','h','A','MXN','es','UTC') RETURNING id`).Scan(&uid); err != nil {
		t.Fatal(err)
	}
	bad := map[string]string{
		"uppercase email": `INSERT INTO users (email,password_hash,name,currency,locale,timezone) VALUES ('X@b.c','h','A','MXN','es','UTC')`,
		"last4 letters":   `INSERT INTO payment_methods (user_id,nickname,type,last4) VALUES ($1,'d','debit','12ab')`,
		"credit no days":  `INSERT INTO payment_methods (user_id,nickname,type) VALUES ($1,'c','credit')`,
		"debit w/ limit":  `INSERT INTO payment_methods (user_id,nickname,type,credit_limit) VALUES ($1,'d','debit',100)`,
		"mid-month start": `INSERT INTO income_sources (user_id,name,amount,day_of_month,start_month) VALUES ($1,'s',1,1,'2026-01-15')`,
	}
	for name, q := range bad {
		var err error
		if name == "uppercase email" {
			_, err = pool.Exec(ctx, q)
		} else {
			_, err = pool.Exec(ctx, q, uid)
		}
		if err == nil {
			t.Errorf("%s: expected constraint violation", name)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO payment_methods (user_id,nickname,type,last4,statement_day,payment_due_day,opening_balance_date)
		VALUES ($1,'c','credit','4242',15,5,'2026-01-01')`, uid); err != nil {
		t.Fatalf("valid credit card rejected: %v", err)
	}
}
```

- [ ] **Step 6: Run it.** Make sure Docker Desktop is running, then run `go mod tidy && go test ./internal/db/ -v`. Expected: PASS. The first run pulls `postgres:17-alpine`.

- [ ] **Step 7: Commit**

```bash
git add api && git commit -m "feat(api): schema migration, goose migrator, testcontainers harness"
```

---

### Task 3: `datex` (dates, months, clamping, JSON types) and `apperr`

**Files:**
- Create: `api/internal/datex/datex.go`, `api/internal/datex/datex_test.go`, `api/internal/apperr/apperr.go`, `api/internal/apperr/apperr_test.go`

**Interfaces:**
- Produces (datex):
  - `ParseDate(s string) (time.Time, error)`, `ParseMonth(s string) (time.Time, error)`
  - `MonthStart(t time.Time) time.Time`, `AddMonths(month time.Time, n int) time.Time`, `DaysIn(month time.Time) int`, `Clamp(month time.Time, day int) time.Time`, `MonthsBetween(a, b time.Time) int` (b minus a, in whole months, using month starts)
  - `Today(now time.Time, loc *time.Location) time.Time`
  - JSON types `type Date struct{ time.Time }` and `type Month struct{ time.Time }` with `MarshalJSON`/`UnmarshalJSON`, constructors `NewDate(t) Date`, `NewMonth(t) Month`, and helpers `DatePtr(*time.Time) *Date`, `MonthPtr(*time.Time) *Month`
- Produces (apperr):
  - `type Error struct{ Status int; Code, Message string; Fields map[string]string }`
  - constructors `NotFound()`, `Unauthorized()`, `BadRequest(msg)`, `Validation(fields)`, `InvalidReference(field)`, `Conflict(code, msg)`, `RateLimited()`, `MonthOutOfRange()`
  - `type V struct`, with `(*V).Check(ok bool, field, msg string)` and `(*V).Err() error`

- [ ] **Step 1: Write the failing tests** `api/internal/datex/datex_test.go`

```go
package datex

import (
	"encoding/json"
	"testing"
	"time"
)

func d(s string) time.Time { t, _ := ParseDate(s); return t }

func TestClamp(t *testing.T) {
	cases := []struct {
		month string
		day   int
		want  string
	}{
		{"2026-02-01", 31, "2026-02-28"},
		{"2028-02-01", 31, "2028-02-29"}, // leap year
		{"2028-02-01", 29, "2028-02-29"},
		{"2026-04-01", 31, "2026-04-30"},
		{"2026-01-01", 31, "2026-01-31"},
		{"2026-03-01", 1, "2026-03-01"},
		{"2026-12-01", 15, "2026-12-15"},
	}
	for _, c := range cases {
		if got := Clamp(d(c.month), c.day); !got.Equal(d(c.want)) {
			t.Errorf("Clamp(%s,%d)=%s want %s", c.month, c.day, got.Format(time.DateOnly), c.want)
		}
	}
}

func TestMonthHelpers(t *testing.T) {
	if got := MonthStart(d("2026-03-17")); !got.Equal(d("2026-03-01")) {
		t.Errorf("MonthStart=%v", got)
	}
	if got := AddMonths(d("2026-11-01"), 3); !got.Equal(d("2027-02-01")) {
		t.Errorf("AddMonths=%v", got)
	}
	if got := AddMonths(d("2026-01-01"), -1); !got.Equal(d("2025-12-01")) {
		t.Errorf("AddMonths neg=%v", got)
	}
	if DaysIn(d("2028-02-01")) != 29 || DaysIn(d("2026-02-01")) != 28 {
		t.Error("DaysIn wrong")
	}
	if MonthsBetween(d("2026-11-01"), d("2027-02-01")) != 3 || MonthsBetween(d("2026-03-01"), d("2026-01-01")) != -2 {
		t.Error("MonthsBetween wrong")
	}
}

func TestToday(t *testing.T) {
	tj, err := time.LoadLocation("America/Tijuana")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 4, 1, 3, 0, 0, 0, time.UTC) // Mar 31 20:00 in Tijuana
	if got := Today(now, tj); !got.Equal(d("2026-03-31")) {
		t.Errorf("Today=%v", got)
	}
	if got := Today(now, time.UTC); !got.Equal(d("2026-04-01")) {
		t.Errorf("Today UTC=%v", got)
	}
}

func TestParse(t *testing.T) {
	for _, bad := range []string{"", "2026-13-01", "2026-02-30", "03/15/2026", "2026-3-5"} {
		if _, err := ParseDate(bad); err == nil {
			t.Errorf("ParseDate(%q) should fail", bad)
		}
	}
	m, err := ParseMonth("2026-03")
	if err != nil || !m.Equal(d("2026-03-01")) {
		t.Errorf("ParseMonth=%v %v", m, err)
	}
	if _, err := ParseMonth("2026-3"); err == nil {
		t.Error("ParseMonth should reject 2026-3")
	}
}

func TestJSON(t *testing.T) {
	type payload struct {
		D  Date   `json:"d"`
		M  Month  `json:"m"`
		DP *Date  `json:"dp"`
		MP *Month `json:"mp"`
	}
	b, err := json.Marshal(payload{D: NewDate(d("2026-03-05")), M: NewMonth(d("2026-03-01"))})
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != `{"d":"2026-03-05","m":"2026-03","dp":null,"mp":null}` {
		t.Fatalf("marshal=%s", b)
	}
	var p payload
	if err := json.Unmarshal([]byte(`{"d":"2026-03-05","m":"2026-03","dp":"2026-01-02","mp":null}`), &p); err != nil {
		t.Fatal(err)
	}
	if !p.D.Equal(d("2026-03-05")) || p.DP == nil || !p.DP.Equal(d("2026-01-02")) || p.MP != nil {
		t.Fatalf("unmarshal=%+v", p)
	}
	if err := json.Unmarshal([]byte(`{"d":"05/03/2026"}`), &p); err == nil {
		t.Fatal("expected error for bad date")
	}
}
```

- [ ] **Step 2: Run it and confirm it fails.** Run `go test ./internal/datex/`. Expected: FAIL (undefined functions).

- [ ] **Step 3: Implement** `api/internal/datex/datex.go`

```go
// Package datex handles calendar dates and months as UTC-midnight time.Time values.
package datex

import (
	"encoding/json"
	"fmt"
	"time"
)

const monthLayout = "2006-01"

// ParseDate parses a strict YYYY-MM-DD calendar date.
func ParseDate(s string) (time.Time, error) {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid date %q (want YYYY-MM-DD)", s)
	}
	return t, nil
}

// ParseMonth parses a strict YYYY-MM month and returns its first day.
func ParseMonth(s string) (time.Time, error) {
	t, err := time.Parse(monthLayout, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid month %q (want YYYY-MM)", s)
	}
	return t, nil
}

func MonthStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func AddMonths(month time.Time, n int) time.Time {
	return time.Date(month.Year(), month.Month()+time.Month(n), 1, 0, 0, 0, 0, time.UTC)
}

func DaysIn(month time.Time) int {
	return time.Date(month.Year(), month.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// Clamp returns the date for `day` in the month containing `month`,
// moved back to the month's last day when the month is shorter.
func Clamp(month time.Time, day int) time.Time {
	m := MonthStart(month)
	return m.AddDate(0, 0, min(day, DaysIn(m))-1)
}

// MonthsBetween returns the number of whole months from a's month to b's month.
func MonthsBetween(a, b time.Time) int {
	return (b.Year()-a.Year())*12 + int(b.Month()) - int(a.Month())
}

// Today is the calendar date of `now` in `loc`, as UTC midnight.
func Today(now time.Time, loc *time.Location) time.Time {
	l := now.In(loc)
	return time.Date(l.Year(), l.Month(), l.Day(), 0, 0, 0, 0, time.UTC)
}

// Date is a calendar date serialized as "YYYY-MM-DD".
type Date struct{ time.Time }

func NewDate(t time.Time) Date { return Date{t} }

func DatePtr(t *time.Time) *Date {
	if t == nil {
		return nil
	}
	return &Date{*t}
}

func (d Date) MarshalJSON() ([]byte, error) { return json.Marshal(d.Format(time.DateOnly)) }

func (d *Date) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	t, err := ParseDate(s)
	if err != nil {
		return err
	}
	d.Time = t
	return nil
}

// Month is a calendar month serialized as "YYYY-MM"; Time is the first day.
type Month struct{ time.Time }

func NewMonth(t time.Time) Month { return Month{MonthStart(t)} }

func MonthPtr(t *time.Time) *Month {
	if t == nil {
		return nil
	}
	m := NewMonth(*t)
	return &m
}

func (m Month) MarshalJSON() ([]byte, error) { return json.Marshal(m.Format(monthLayout)) }

func (m *Month) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	t, err := ParseMonth(s)
	if err != nil {
		return err
	}
	m.Time = t
	return nil
}
```

- [ ] **Step 4: Write the apperr test** `api/internal/apperr/apperr_test.go`

```go
package apperr

import (
	"errors"
	"testing"
)

func TestValidator(t *testing.T) {
	var v V
	v.Check(true, "a", "never")
	if v.Err() != nil {
		t.Fatal("no failures should give nil error")
	}
	v.Check(false, "amount", "must be > 0")
	v.Check(false, "amount", "second message ignored")
	v.Check(false, "name", "required")
	var e *Error
	if !errors.As(v.Err(), &e) || e.Status != 422 || e.Code != "validation_failed" {
		t.Fatalf("got %#v", v.Err())
	}
	if e.Fields["amount"] != "must be > 0" || e.Fields["name"] != "required" {
		t.Fatalf("fields=%v", e.Fields)
	}
}

func TestConstructors(t *testing.T) {
	if NotFound().Status != 404 || Unauthorized().Status != 401 || Conflict("x", "y").Status != 409 ||
		InvalidReference("category_id").Fields["category_id"] == "" || RateLimited().Status != 429 ||
		MonthOutOfRange().Code != "month_out_of_range" || BadRequest("m").Status != 400 {
		t.Fatal("constructor mismatch")
	}
}
```

- [ ] **Step 5: Implement** `api/internal/apperr/apperr.go`

```go
// Package apperr defines the typed errors the API returns to clients.
package apperr

import "net/http"

type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func NotFound() *Error {
	return &Error{Status: http.StatusNotFound, Code: "not_found", Message: "resource not found"}
}

func Unauthorized() *Error {
	return &Error{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "authentication required"}
}

func BadRequest(msg string) *Error {
	return &Error{Status: http.StatusBadRequest, Code: "bad_request", Message: msg}
}

func Validation(fields map[string]string) *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "validation_failed", Message: "invalid input", Fields: fields}
}

func InvalidReference(field string) *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "invalid_reference", Message: "referenced resource does not exist",
		Fields: map[string]string{field: "does not exist"}}
}

func Conflict(code, msg string) *Error {
	return &Error{Status: http.StatusConflict, Code: code, Message: msg}
}

func RateLimited() *Error {
	return &Error{Status: http.StatusTooManyRequests, Code: "rate_limited", Message: "too many requests"}
}

func MonthOutOfRange() *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "month_out_of_range", Message: "month is more than 12 months ahead"}
}

// V collects field validation failures; the first message per field wins.
type V struct{ fields map[string]string }

func (v *V) Check(ok bool, field, msg string) {
	if ok {
		return
	}
	if v.fields == nil {
		v.fields = map[string]string{}
	}
	if _, exists := v.fields[field]; !exists {
		v.fields[field] = msg
	}
}

func (v *V) Err() error {
	if len(v.fields) == 0 {
		return nil
	}
	return Validation(v.fields)
}
```

- [ ] **Step 6: Run both test packages.** Run `go test ./internal/datex/ ./internal/apperr/`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api && git commit -m "feat(api): datex date/month helpers and apperr typed errors"
```

---

### Task 4: `auth` primitives (argon2id, JWT, refresh tokens)

**Files:**
- Create: `api/internal/auth/password.go`, `api/internal/auth/tokens.go`, `api/internal/auth/auth_test.go`

**Interfaces:**
- Produces:
  - `HashPassword(pw string) (string, error)`, `VerifyPassword(encoded, pw string) (bool, error)`, `DummyVerify(pw string)`, which spends the same time as a real verify
  - `NewTokens(secret []byte, ttl time.Duration, now func() time.Time) *Tokens`, `(*Tokens).Issue(userID int64) (string, error)`, `(*Tokens).Parse(tok string) (int64, error)`
  - `NewRefresh() (raw, hash string, err error)`, `HashRefresh(raw string) string`, `NewFamilyID() (string, error)`

- [ ] **Step 1: Add dependencies.** Run `go get github.com/golang-jwt/jwt/v5@latest golang.org/x/crypto@latest`.

- [ ] **Step 2: Write the failing tests** `api/internal/auth/auth_test.go`

```go
package auth

import (
	"strings"
	"testing"
	"time"
)

func TestPasswordRoundTrip(t *testing.T) {
	h, err := HashPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatalf("unexpected encoding %q", h)
	}
	if ok, err := VerifyPassword(h, "correct horse"); !ok || err != nil {
		t.Fatalf("verify good: %v %v", ok, err)
	}
	if ok, _ := VerifyPassword(h, "wrong"); ok {
		t.Fatal("wrong password accepted")
	}
	h2, _ := HashPassword("correct horse")
	if h == h2 {
		t.Fatal("salt not random")
	}
	if _, err := VerifyPassword("garbage", "x"); err == nil {
		t.Fatal("malformed hash should error")
	}
}

func TestTokens(t *testing.T) {
	now := time.Date(2026, 3, 15, 12, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	tk := NewTokens([]byte(strings.Repeat("k", 32)), 15*time.Minute, clock)
	s, err := tk.Issue(42)
	if err != nil {
		t.Fatal(err)
	}
	if id, err := tk.Parse(s); err != nil || id != 42 {
		t.Fatalf("parse: %d %v", id, err)
	}
	now = now.Add(16 * time.Minute)
	if _, err := tk.Parse(s); err == nil {
		t.Fatal("expired token accepted")
	}
	other := NewTokens([]byte(strings.Repeat("z", 32)), 15*time.Minute, clock)
	s2, _ := other.Issue(42)
	if _, err := tk.Parse(s2); err == nil {
		t.Fatal("token signed with other key accepted")
	}
	if _, err := tk.Parse("eyJhbGciOiJub25lIn0.eyJzdWIiOiI0MiJ9."); err == nil {
		t.Fatal("alg=none accepted")
	}
}

func TestRefresh(t *testing.T) {
	raw, hash, err := NewRefresh()
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) < 40 || HashRefresh(raw) != hash || len(hash) != 64 {
		t.Fatalf("raw=%q hash=%q", raw, hash)
	}
	raw2, _, _ := NewRefresh()
	if raw == raw2 {
		t.Fatal("refresh not random")
	}
	f, err := NewFamilyID()
	if err != nil || len(f) != 32 {
		t.Fatalf("family %q %v", f, err)
	}
}
```

- [ ] **Step 3: Run it and confirm it fails.** Run `go test ./internal/auth/`. Expected: FAIL.

- [ ] **Step 4: Implement** `api/internal/auth/password.go`

```go
// Package auth implements password hashing and token handling.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// OWASP-recommended argon2id parameters.
const (
	argonMemory  = 19456
	argonTime    = 2
	argonThreads = 1
	argonKeyLen  = 32
	argonSaltLen = 16
)

var b64 = base64.RawStdEncoding

func HashPassword(pw string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

func VerifyPassword(encoded, pw string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("malformed hash")
	}
	var mem uint32
	var t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &mem, &t, &p); err != nil {
		return false, fmt.Errorf("malformed params: %w", err)
	}
	salt, err := b64.DecodeString(parts[4])
	if err != nil {
		return false, err
	}
	want, err := b64.DecodeString(parts[5])
	if err != nil {
		return false, err
	}
	got := argon2.IDKey([]byte(pw), salt, t, mem, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

var dummyHash, _ = HashPassword("dummy-password-for-timing")

// DummyVerify burns the same CPU as a real check so unknown emails are not
// distinguishable by response time.
func DummyVerify(pw string) { _, _ = VerifyPassword(dummyHash, pw) }
```

- [ ] **Step 5: Implement** `api/internal/auth/tokens.go`

```go
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Tokens struct {
	secret []byte
	ttl    time.Duration
	now    func() time.Time
}

func NewTokens(secret []byte, ttl time.Duration, now func() time.Time) *Tokens {
	return &Tokens{secret: secret, ttl: ttl, now: now}
}

func (t *Tokens) Issue(userID int64) (string, error) {
	iat := t.now()
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(userID, 10),
		IssuedAt:  jwt.NewNumericDate(iat),
		ExpiresAt: jwt.NewNumericDate(iat.Add(t.ttl)),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(t.secret)
}

func (t *Tokens) Parse(tok string) (int64, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(tok, &claims, func(*jwt.Token) (any, error) { return t.secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithTimeFunc(t.now),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return 0, err
	}
	id, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("bad subject")
	}
	return id, nil
}

// NewRefresh returns a random refresh token and the hash stored in the database.
func NewRefresh() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	return raw, HashRefresh(raw), nil
}

func HashRefresh(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func NewFamilyID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
```

- [ ] **Step 6: Run the tests and confirm they pass.** Run `go test ./internal/auth/`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api && git commit -m "feat(api): argon2id passwords, JWT access tokens, refresh token helpers"
```

---
### Task 5: sqlc setup, service core, HTTP skeleton, real `main.go`

**Files:**
- Create: `api/sqlc.yaml`, `api/queries/users.sql`, `api/internal/store/*` (generated), `api/internal/service/service.go`, `api/internal/service/actor_test.go`, `api/internal/httpapi/router.go`, `api/internal/httpapi/middleware.go`, `api/internal/httpapi/respond.go`, `api/internal/httpapi/harness_test.go`, `api/internal/httpapi/health_test.go`
- Replace: `api/cmd/api/main.go`

**Interfaces:**
- Consumes: `config.Config`, `db.Migrate`, `auth.Tokens`, `apperr.*`, `datex.Today`, `testutil.NewPool`
- Produces:
  - `service.New(pool *pgxpool.Pool, tokens *auth.Tokens, refreshTTL time.Duration, now func() time.Time) *Service`
  - `service.Actor{UserID int64; Loc *time.Location}` with `(Actor).Today(now time.Time) time.Time`
  - `(*Service).Authenticate(ctx, token string) (Actor, error)`, `(*Service).Ping(ctx) error`
  - internal helpers `s.inTx(ctx, func(q *store.Queries) error) error`, `s.today(a Actor) time.Time`, `notFound(err) error`, `isUnique(err) bool`
  - `httpapi.NewRouter(cfg config.Config, svc *service.Service, log *slog.Logger) *gin.Engine`
  - in httpapi: `fail(c, err)`, `bind(c, dst) bool`, `pathID(c) (int64, bool)`, `actorOf(c) service.Actor`, `queryDate(c, key) (*time.Time, bool)`, `queryInt64(c, key) (*int64, bool)`, `items[T](list []T) gin.H`, the `ErrorResponse` type, and the `(*handlers).routes(v1 *gin.RouterGroup)` registration point
  - test harness: `newHarness(t)`, `newHarnessWith(t, func(*config.Config))`, `(*harness).do(method, path, token string, body any, cookies ...*http.Cookie) resp`, `expect[T](t, r, code) T`, `errCode(r) string`, `errFields(r) map[string]string`, type `M = map[string]any`, `h.pool`, `h.setNow(t)`

- [ ] **Step 1: Add dependencies.** Run `go get github.com/gin-gonic/gin@latest github.com/gin-contrib/cors@latest golang.org/x/time@latest`.

- [ ] **Step 2: Configure sqlc** `api/sqlc.yaml`

```yaml
version: "2"
sql:
  - engine: postgresql
    schema: migrations
    queries: queries
    gen:
      go:
        package: store
        out: internal/store
        sql_package: pgx/v5
        emit_pointers_for_null_types: true
        overrides:
          - db_type: date
            go_type: time.Time
          - db_type: date
            nullable: true
            go_type:
              type: time.Time
              pointer: true
          - db_type: timestamptz
            go_type: time.Time
          - db_type: timestamptz
            nullable: true
            go_type:
              type: time.Time
              pointer: true
          - db_type: pg_catalog.timestamptz
            go_type: time.Time
          - db_type: pg_catalog.timestamptz
            nullable: true
            go_type:
              type: time.Time
              pointer: true
```

- [ ] **Step 3: Write the user queries** `api/queries/users.sql`

```sql
-- name: CreateUser :one
INSERT INTO users (email, password_hash, name, currency, locale, timezone)
VALUES (@email, @password_hash, @name, @currency, @locale, @timezone)
RETURNING *;

-- name: GetUser :one
SELECT * FROM users WHERE id = @id;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = @email;

-- name: UpdateUser :one
UPDATE users SET name = @name, currency = @currency, locale = @locale, timezone = @timezone, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteUser :execrows
DELETE FROM users WHERE id = @id;

-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
VALUES (@user_id, @family_id, @token_hash, @expires_at);

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens WHERE token_hash = @token_hash;

-- name: RevokeRefreshToken :execrows
UPDATE refresh_tokens SET revoked_at = now() WHERE id = @id AND revoked_at IS NULL;

-- name: RevokeRefreshByHash :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = @token_hash AND revoked_at IS NULL;

-- name: RevokeRefreshFamily :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = @family_id AND revoked_at IS NULL;
```

Run `cd /c/dev/financego/api && sqlc generate && go build ./...`. Expected: the `internal/store/` files (`db.go`, `models.go`, `users.sql.go`) are created and the build succeeds. **Every later task that edits `queries/*.sql` must re-run `sqlc generate` and commit `internal/store`.**

- [ ] **Step 4: Write the failing Actor test** `api/internal/service/actor_test.go`

```go
package service

import (
	"testing"
	"time"
)

func TestActorTodayUsesUserTimezone(t *testing.T) {
	tj, _ := time.LoadLocation("America/Tijuana")
	a := Actor{UserID: 1, Loc: tj}
	now := time.Date(2026, 4, 1, 3, 0, 0, 0, time.UTC)
	if got := a.Today(now).Format(time.DateOnly); got != "2026-03-31" {
		t.Fatalf("Today=%s, want 2026-03-31", got)
	}
}
```

Run `go test ./internal/service/`. Expected: FAIL (package or `Actor` missing).

- [ ] **Step 5: Implement** `api/internal/service/service.go`

```go
// Package service holds the business rules; handlers call it, it calls the store.
package service

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"financego/internal/apperr"
	"financego/internal/auth"
	"financego/internal/datex"
	"financego/internal/store"
)

type Service struct {
	pool       *pgxpool.Pool
	q          *store.Queries
	tokens     *auth.Tokens
	refreshTTL time.Duration
	now        func() time.Time
}

func New(pool *pgxpool.Pool, tokens *auth.Tokens, refreshTTL time.Duration, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{pool: pool, q: store.New(pool), tokens: tokens, refreshTTL: refreshTTL, now: now}
}

func (s *Service) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

func (s *Service) inTx(ctx context.Context, fn func(q *store.Queries) error) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error { return fn(s.q.WithTx(tx)) })
}

// Actor is the authenticated user making a request.
type Actor struct {
	UserID int64
	Loc    *time.Location
}

// Today is the actor's local calendar date.
func (a Actor) Today(now time.Time) time.Time { return datex.Today(now, a.Loc) }

func (s *Service) today(a Actor) time.Time { return a.Today(s.now()) }

func (s *Service) Authenticate(ctx context.Context, token string) (Actor, error) {
	id, err := s.tokens.Parse(token)
	if err != nil {
		return Actor{}, apperr.Unauthorized()
	}
	u, err := s.q.GetUser(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Actor{}, apperr.Unauthorized()
	}
	if err != nil {
		return Actor{}, err
	}
	return Actor{UserID: u.ID, Loc: loadLoc(u.Timezone)}, nil
}

func loadLoc(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		return time.UTC
	}
	return loc
}

// notFound maps "no rows" to a 404 and passes other errors through.
func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.NotFound()
	}
	return err
}

func isUnique(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}
```

Run `go test ./internal/service/`. Expected: PASS.

- [ ] **Step 6: Implement the HTTP helpers** `api/internal/httpapi/respond.go`

```go
// Package httpapi exposes the service over HTTP with Gin.
package httpapi

import (
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/service"
)

const (
	actorKey     = "actor"
	requestIDKey = "request_id"
	loggerKey    = "logger"
)

// ErrorResponse is the body of every non-2xx response.
type ErrorResponse struct {
	Error *apperr.Error `json:"error"`
}

func loggerOf(c *gin.Context) *slog.Logger {
	if l, ok := c.Get(loggerKey); ok {
		return l.(*slog.Logger)
	}
	return slog.Default()
}

// fail writes err as a JSON error; unknown errors become a logged 500.
func fail(c *gin.Context, err error) {
	var ae *apperr.Error
	if !errors.As(err, &ae) {
		rid := c.GetString(requestIDKey)
		loggerOf(c).Error("internal error", "err", err, "request_id", rid)
		ae = &apperr.Error{Status: 500, Code: "internal", Message: fmt.Sprintf("internal error (request %s)", rid)}
	}
	c.AbortWithStatusJSON(ae.Status, ErrorResponse{Error: ae})
}

func bind(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		fail(c, apperr.BadRequest("invalid JSON body: "+err.Error()))
		return false
	}
	return true
}

func pathID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		fail(c, apperr.NotFound())
		return 0, false
	}
	return id, true
}

func actorOf(c *gin.Context) service.Actor { return c.MustGet(actorKey).(service.Actor) }

func queryDate(c *gin.Context, key string) (*time.Time, bool) {
	v := c.Query(key)
	if v == "" {
		return nil, true
	}
	t, err := datex.ParseDate(v)
	if err != nil {
		fail(c, apperr.BadRequest(key+": "+err.Error()))
		return nil, false
	}
	return &t, true
}

func queryInt64(c *gin.Context, key string) (*int64, bool) {
	v := c.Query(key)
	if v == "" {
		return nil, true
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		fail(c, apperr.BadRequest(key+": must be an integer"))
		return nil, false
	}
	return &n, true
}

func items[T any](list []T) gin.H {
	if list == nil {
		list = []T{}
	}
	return gin.H{"items": list}
}
```

- [ ] **Step 7: Implement the middleware** `api/internal/httpapi/middleware.go`

```go
package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"

	"financego/internal/apperr"
	"financego/internal/service"
)

func requestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" || len(id) > 64 {
			b := make([]byte, 8)
			_, _ = rand.Read(b)
			id = hex.EncodeToString(b)
		}
		c.Set(requestIDKey, id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

// accessLog logs method, route, status and latency — never bodies or headers.
func accessLog(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Set(loggerKey, log)
		c.Next()
		log.Info("request", "method", c.Request.Method, "route", c.FullPath(), "status", c.Writer.Status(),
			"duration_ms", time.Since(start).Milliseconds(), "request_id", c.GetString(requestIDKey))
	}
}

func recoverer() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, rec any) { fail(c, fmt.Errorf("panic: %v", rec)) })
}

func securityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "no-referrer")
		c.Next()
	}
}

func requireAuth(svc *service.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		tok, ok := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
		if !ok || tok == "" {
			fail(c, apperr.Unauthorized())
			return
		}
		a, err := svc.Authenticate(c.Request.Context(), tok)
		if err != nil {
			fail(c, err)
			return
		}
		c.Set(actorKey, a)
		c.Next()
	}
}

type ipLimiter struct {
	mu    sync.Mutex
	m     map[string]*rate.Limiter
	limit rate.Limit
	burst int
}

func (l *ipLimiter) get(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.m) > 10000 { // crude bound on memory; limits simply restart
		l.m = map[string]*rate.Limiter{}
	}
	lim, ok := l.m[ip]
	if !ok {
		lim = rate.NewLimiter(l.limit, l.burst)
		l.m[ip] = lim
	}
	return lim
}

// rateLimit allows perMin requests per minute per client IP (token bucket).
func rateLimit(perMin int) gin.HandlerFunc {
	l := &ipLimiter{m: map[string]*rate.Limiter{}, limit: rate.Limit(float64(perMin) / 60), burst: perMin}
	return func(c *gin.Context) {
		if !l.get(c.ClientIP()).Allow() {
			fail(c, apperr.RateLimited())
			return
		}
		c.Next()
	}
}
```

- [ ] **Step 8: Implement the router** `api/internal/httpapi/router.go`

```go
package httpapi

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/config"
	"financego/internal/service"
)

type handlers struct {
	svc *service.Service
	cfg config.Config
}

func NewRouter(cfg config.Config, svc *service.Service, log *slog.Logger) *gin.Engine {
	r := gin.New()
	_ = r.SetTrustedProxies(nil)
	r.Use(requestID(), accessLog(log), recoverer(), securityHeaders(), cors.New(cors.Config{
		AllowOrigins:     []string{cfg.WebOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "X-Request-ID"},
		ExposeHeaders:    []string{"X-Request-ID", "Content-Disposition"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	r.NoRoute(func(c *gin.Context) { fail(c, apperr.NotFound()) })

	h := &handlers{svc: svc, cfg: cfg}
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/readyz", func(c *gin.Context) {
		if err := svc.Ping(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db unavailable"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	h.routes(r.Group("/api/v1"))
	return r
}

// routes is the single place endpoints are registered; each task adds its lines here.
func (h *handlers) routes(v1 *gin.RouterGroup) {
	_ = v1
}
```

- [ ] **Step 9: Replace `api/cmd/api/main.go`**

```go
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // IANA zones even in minimal containers

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"financego/internal/auth"
	"financego/internal/config"
	"financego/internal/db"
	"financego/internal/httpapi"
	"financego/internal/service"
)

// @title                      Finance API
// @version                    1.0
// @BasePath                   /api/v1
// @securityDefinitions.apikey BearerAuth
// @in                         header
// @name                       Authorization
func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := db.Migrate(ctx, cfg.DatabaseURL); err != nil {
		return err
	}
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	gin.SetMode(gin.ReleaseMode)
	tokens := auth.NewTokens(cfg.JWTSecret, cfg.AccessTTL, time.Now)
	svc := service.New(pool, tokens, cfg.RefreshTTL, time.Now)
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.NewRouter(cfg, svc, log),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr)
		errc <- srv.ListenAndServe()
	}()
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
```

- [ ] **Step 10: Write the shared integration harness** `api/internal/httpapi/harness_test.go`

```go
package httpapi_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"financego/internal/auth"
	"financego/internal/config"
	"financego/internal/httpapi"
	"financego/internal/service"
	"financego/internal/testutil"
)

type M = map[string]any

// harness runs the real router against a fresh database with a controllable clock.
// Default clock: 2026-03-15 18:00 UTC.
type harness struct {
	t    *testing.T
	srv  *gin.Engine
	svc  *service.Service
	pool *pgxpool.Pool
	mu   sync.Mutex
	now  time.Time
}

func newHarness(t *testing.T) *harness { return newHarnessWith(t, nil) }

func newHarnessWith(t *testing.T, tweak func(*config.Config)) *harness {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h := &harness{t: t, pool: testutil.NewPool(t), now: time.Date(2026, 3, 15, 18, 0, 0, 0, time.UTC)}
	clock := func() time.Time {
		h.mu.Lock()
		defer h.mu.Unlock()
		return h.now
	}
	cfg := config.Config{
		JWTSecret: []byte(strings.Repeat("k", 32)), WebOrigin: "http://localhost:3000",
		AccessTTL: 15 * time.Minute, RefreshTTL: 30 * 24 * time.Hour, AuthRatePerMin: 10000,
	}
	if tweak != nil {
		tweak(&cfg)
	}
	h.svc = service.New(h.pool, auth.NewTokens(cfg.JWTSecret, cfg.AccessTTL, clock), cfg.RefreshTTL, clock)
	h.srv = httpapi.NewRouter(cfg, h.svc, slog.New(slog.DiscardHandler))
	return h
}

// setNow moves the clock. Access tokens expire 15 minutes after issue on this
// clock, so tests that jump in time must sign up (or log in) after the jump.
func (h *harness) setNow(t time.Time) {
	h.mu.Lock()
	h.now = t
	h.mu.Unlock()
}

type resp struct {
	Code    int
	Body    []byte
	Header  http.Header
	Cookies []*http.Cookie
}

func (h *harness) do(method, path, token string, body any, cookies ...*http.Cookie) resp {
	h.t.Helper()
	var r io.Reader
	if body != nil {
		if s, ok := body.(string); ok {
			r = strings.NewReader(s)
		} else {
			b, err := json.Marshal(body)
			if err != nil {
				h.t.Fatal(err)
			}
			r = bytes.NewReader(b)
		}
	}
	req := httptest.NewRequest(method, path, r)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	h.srv.ServeHTTP(rec, req)
	return resp{Code: rec.Code, Body: rec.Body.Bytes(), Header: rec.Header(), Cookies: rec.Result().Cookies()}
}

func expect[T any](t *testing.T, r resp, code int) T {
	t.Helper()
	if r.Code != code {
		t.Fatalf("status %d, want %d; body: %s", r.Code, code, r.Body)
	}
	var v T
	if len(r.Body) > 0 {
		if err := json.Unmarshal(r.Body, &v); err != nil {
			t.Fatalf("decode: %v; body: %s", err, r.Body)
		}
	}
	return v
}

type errBody struct {
	Error struct {
		Code   string            `json:"code"`
		Fields map[string]string `json:"fields"`
	} `json:"error"`
}

func errCode(r resp) string {
	var b errBody
	_ = json.Unmarshal(r.Body, &b)
	return b.Error.Code
}

func errFields(r resp) map[string]string {
	var b errBody
	_ = json.Unmarshal(r.Body, &b)
	return b.Error.Fields
}
```

- [ ] **Step 11: Write the health test** `api/internal/httpapi/health_test.go`

```go
package httpapi_test

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHealthAndErrors(t *testing.T) {
	h := newHarness(t)
	expect[M](t, h.do("GET", "/healthz", "", nil), 200)
	expect[M](t, h.do("GET", "/readyz", "", nil), 200)

	r := h.do("GET", "/api/v1/nope", "", nil)
	if r.Code != 404 || errCode(r) != "not_found" {
		t.Fatalf("unknown route: %d %s", r.Code, r.Body)
	}
	if r.Header.Get("X-Request-ID") == "" || r.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("missing request id or security header")
	}

	h.srv.GET("/boom", func(*gin.Context) { panic("kaboom") })
	r = h.do("GET", "/boom", "", nil)
	if r.Code != 500 || errCode(r) != "internal" {
		t.Fatalf("panic not converted: %d %s", r.Code, r.Body)
	}
}
```

- [ ] **Step 12: Run everything.** Run `go mod tidy && go vet ./... && go test ./...`. Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add api && git commit -m "feat(api): sqlc setup, service core, gin router with middleware, main server"
```

---

### Task 6: Auth endpoints (register, login, refresh, logout, me)

**Files:**
- Create: `api/queries/categories.sql` (only `CreateCategory` for now; Task 7 adds the rest), `api/internal/service/users.go`, `api/internal/httpapi/auth.go`, `api/internal/httpapi/auth_test.go`
- Modify: `api/internal/httpapi/router.go` (`routes`), `api/internal/httpapi/harness_test.go` (adds `signup`)

**Interfaces:**
- Consumes: Task 5 helpers and the store queries from `users.sql`
- Produces:
  - `service.User{ID, Email, Name, Currency, Locale, Timezone, CreatedAt}`, `service.RegisterInput`, `service.ProfileInput{Name, Currency, Locale, Timezone}`, `service.Session{AccessToken string; User User; RefreshToken string (json:"-")}`
  - `(*Service).Register`, `Login(ctx, email, password)`, `Refresh(ctx, raw)`, `Logout(ctx, raw)`, `Me(ctx, a)`, `UpdateMe(ctx, a, ProfileInput)`
  - in httpapi: `const refreshCookie = "fin_refresh"`, `(*handlers).setRefreshCookie(c, raw string, maxAge int)`, and the `protected` route group created in `routes` (every later task registers on `p`)
  - harness: `(*harness).signup(email string) string`, which returns an access token for a user with currency MXN, locale es and timezone UTC

- [ ] **Step 1: Add `CreateCategory`** in `api/queries/categories.sql`

```sql
-- name: CreateCategory :one
INSERT INTO categories (user_id, name, kind, color, icon)
VALUES (@user_id, @name, @kind, @color, @icon)
RETURNING *;
```

Run `sqlc generate`.

- [ ] **Step 2: Add `signup` to the harness** (append to `harness_test.go`)

```go
func (h *harness) signup(email string) string {
	h.t.Helper()
	r := h.do("POST", "/api/v1/auth/register", "", M{
		"email": email, "password": "password123", "name": "Test User",
		"currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	s := expect[struct {
		AccessToken string `json:"access_token"`
	}](h.t, r, 201)
	return s.AccessToken
}
```

- [ ] **Step 3: Write the failing tests** `api/internal/httpapi/auth_test.go`

```go
package httpapi_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"financego/internal/config"
)

func refreshCookieOf(t *testing.T, r resp) *http.Cookie {
	t.Helper()
	for _, c := range r.Cookies {
		if c.Name == "fin_refresh" {
			return c
		}
	}
	t.Fatalf("no fin_refresh cookie in %v", r.Cookies)
	return nil
}

func TestRegisterCreatesUserSessionAndDefaults(t *testing.T) {
	h := newHarness(t)
	r := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "  Ana@Example.com ", "password": "password123", "name": "Ana",
		"currency": "MXN", "locale": "es", "timezone": "America/Tijuana",
	})
	body := expect[struct {
		AccessToken string `json:"access_token"`
		User        struct {
			ID       int64  `json:"id"`
			Email    string `json:"email"`
			Timezone string `json:"timezone"`
		} `json:"user"`
	}](t, r, 201)
	if body.AccessToken == "" || body.User.Email != "ana@example.com" || body.User.Timezone != "America/Tijuana" {
		t.Fatalf("bad body %+v", body)
	}
	c := refreshCookieOf(t, r)
	if !c.HttpOnly || c.Path != "/api/v1/auth" || c.SameSite != http.SameSiteLaxMode || c.MaxAge <= 0 {
		t.Fatalf("bad cookie %+v", c)
	}
	var n int
	if err := h.pool.QueryRow(context.Background(), "SELECT count(*) FROM categories WHERE user_id=$1", body.User.ID).Scan(&n); err != nil || n != 11 {
		t.Fatalf("default categories = %d (%v), want 11", n, err)
	}

	dup := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "ANA@example.com", "password": "password123", "name": "Ana",
		"currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	if dup.Code != 409 || errCode(dup) != "email_taken" {
		t.Fatalf("duplicate: %d %s", dup.Code, dup.Body)
	}
}

func TestRegisterValidation(t *testing.T) {
	h := newHarness(t)
	r := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "nope", "password": "short", "name": "", "currency": "mxn", "locale": "fr", "timezone": "Mars/Base",
	})
	if r.Code != 422 {
		t.Fatalf("status %d", r.Code)
	}
	f := errFields(r)
	for _, k := range []string{"email", "password", "name", "currency", "locale", "timezone"} {
		if f[k] == "" {
			t.Errorf("missing field error %q in %v", k, f)
		}
	}
	if bad := h.do("POST", "/api/v1/auth/register", "", "{not json"); bad.Code != 400 {
		t.Fatalf("malformed JSON: %d", bad.Code)
	}
}

func TestLoginAndMe(t *testing.T) {
	h := newHarness(t)
	h.signup("bo@example.com")

	for _, pw := range []string{"wrongpass1"} {
		r := h.do("POST", "/api/v1/auth/login", "", M{"email": "bo@example.com", "password": pw})
		if r.Code != 401 || errCode(r) != "invalid_credentials" {
			t.Fatalf("wrong password: %d %s", r.Code, r.Body)
		}
	}
	unknown := h.do("POST", "/api/v1/auth/login", "", M{"email": "ghost@example.com", "password": "password123"})
	if unknown.Code != 401 || errCode(unknown) != "invalid_credentials" {
		t.Fatalf("unknown email: %d %s", unknown.Code, unknown.Body)
	}

	r := h.do("POST", "/api/v1/auth/login", "", M{"email": "BO@example.com", "password": "password123"})
	tok := expect[struct {
		AccessToken string `json:"access_token"`
	}](t, r, 200).AccessToken

	me := expect[M](t, h.do("GET", "/api/v1/me", tok, nil), 200)
	if me["email"] != "bo@example.com" || me["currency"] != "MXN" {
		t.Fatalf("me=%v", me)
	}
	if r := h.do("GET", "/api/v1/me", "", nil); r.Code != 401 {
		t.Fatalf("no token: %d", r.Code)
	}
	if r := h.do("GET", "/api/v1/me", "garbage", nil); r.Code != 401 {
		t.Fatalf("garbage token: %d", r.Code)
	}
	h.setNow(h.now.Add(16 * time.Minute))
	if r := h.do("GET", "/api/v1/me", tok, nil); r.Code != 401 {
		t.Fatalf("expired token: %d", r.Code)
	}
}

func TestUpdateMe(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("cy@example.com")
	u := expect[M](t, h.do("PUT", "/api/v1/me", tok, M{"name": "Cy", "currency": "USD", "locale": "en", "timezone": "America/Mexico_City"}), 200)
	if u["currency"] != "USD" || u["locale"] != "en" || u["timezone"] != "America/Mexico_City" {
		t.Fatalf("update=%v", u)
	}
	if r := h.do("PUT", "/api/v1/me", tok, M{"name": "Cy", "currency": "USD", "locale": "en", "timezone": "Local"}); r.Code != 422 {
		t.Fatalf("Local timezone accepted: %d", r.Code)
	}
}

func TestRefreshRotationAndReuse(t *testing.T) {
	h := newHarness(t)
	reg := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "di@example.com", "password": "password123", "name": "Di", "currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	c1 := refreshCookieOf(t, reg)

	r := h.do("POST", "/api/v1/auth/refresh", "", nil, c1)
	body := expect[struct {
		AccessToken string `json:"access_token"`
	}](t, r, 200)
	c2 := refreshCookieOf(t, r)
	if body.AccessToken == "" || c2.Value == c1.Value {
		t.Fatal("refresh did not rotate")
	}

	// Reusing the rotated token revokes the whole family, including c2.
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil, c1); r.Code != 401 {
		t.Fatalf("reuse: %d", r.Code)
	}
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil, c2); r.Code != 401 {
		t.Fatalf("family not revoked: %d", r.Code)
	}
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil); r.Code != 401 {
		t.Fatalf("no cookie: %d", r.Code)
	}
}

func TestLogoutRevokesRefresh(t *testing.T) {
	h := newHarness(t)
	reg := h.do("POST", "/api/v1/auth/register", "", M{
		"email": "ed@example.com", "password": "password123", "name": "Ed", "currency": "MXN", "locale": "es", "timezone": "UTC",
	})
	c := refreshCookieOf(t, reg)
	out := h.do("POST", "/api/v1/auth/logout", "", nil, c)
	if out.Code != 204 || refreshCookieOf(t, out).MaxAge >= 0 {
		t.Fatalf("logout: %d cookies=%v", out.Code, out.Cookies)
	}
	if r := h.do("POST", "/api/v1/auth/refresh", "", nil, c); r.Code != 401 {
		t.Fatalf("refresh after logout: %d", r.Code)
	}
}

func TestAuthRateLimit(t *testing.T) {
	h := newHarnessWith(t, func(c *config.Config) { c.AuthRatePerMin = 2 })
	body := M{"email": "x@example.com", "password": "password123"}
	h.do("POST", "/api/v1/auth/login", "", body)
	h.do("POST", "/api/v1/auth/login", "", body)
	if r := h.do("POST", "/api/v1/auth/login", "", body); r.Code != 429 || errCode(r) != "rate_limited" {
		t.Fatalf("3rd attempt: %d %s", r.Code, r.Body)
	}
}
```

Run `go test ./internal/httpapi/ -run 'Register|Login|UpdateMe|Refresh|Logout|RateLimit'`. Expected: FAIL (404s, since the routes don't exist yet).

- [ ] **Step 4: Implement** `api/internal/service/users.go`

```go
package service

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"

	"financego/internal/apperr"
	"financego/internal/auth"
	"financego/internal/store"
)

type User struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Currency  string    `json:"currency"`
	Locale    string    `json:"locale"`
	Timezone  string    `json:"timezone"`
	CreatedAt time.Time `json:"created_at"`
}

func toUser(u store.User) User {
	return User{ID: u.ID, Email: u.Email, Name: u.Name, Currency: u.Currency, Locale: u.Locale, Timezone: u.Timezone, CreatedAt: u.CreatedAt}
}

type RegisterInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Currency string `json:"currency"`
	Locale   string `json:"locale"`
	Timezone string `json:"timezone"`
}

type ProfileInput struct {
	Name     string `json:"name"`
	Currency string `json:"currency"`
	Locale   string `json:"locale"`
	Timezone string `json:"timezone"`
}

type Session struct {
	AccessToken  string `json:"access_token"`
	User         User   `json:"user"`
	RefreshToken string `json:"-"`
}

var (
	emailRe    = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
	currencyRe = regexp.MustCompile(`^[A-Z]{3}$`)
)

func checkProfile(v *apperr.V, p ProfileInput) {
	n := utf8.RuneCountInString(p.Name)
	v.Check(n >= 1 && n <= 80, "name", "must be 1-80 characters")
	v.Check(currencyRe.MatchString(p.Currency), "currency", "must be an ISO 4217 code such as MXN")
	v.Check(p.Locale == "es" || p.Locale == "en", "locale", "must be es or en")
	_, err := time.LoadLocation(p.Timezone)
	v.Check(p.Timezone != "" && p.Timezone != "Local" && err == nil, "timezone", "must be an IANA timezone such as America/Tijuana")
}

func invalidCredentials() error {
	return &apperr.Error{Status: http.StatusUnauthorized, Code: "invalid_credentials", Message: "email or password is incorrect"}
}

type defaultCategory struct{ name, kind, color, icon string }

func defaultCategories(locale string) []defaultCategory {
	es := []defaultCategory{
		{"Comida", "expense", "#f97316", "utensils"}, {"Transporte", "expense", "#0ea5e9", "car"},
		{"Vivienda", "expense", "#8b5cf6", "home"}, {"Servicios", "expense", "#14b8a6", "zap"},
		{"Salud", "expense", "#ef4444", "heart-pulse"}, {"Entretenimiento", "expense", "#ec4899", "film"},
		{"Suscripciones", "expense", "#6366f1", "repeat"}, {"Intereses y comisiones", "expense", "#b91c1c", "percent"},
		{"Otros", "expense", "#64748b", "tag"}, {"Salario", "income", "#22c55e", "briefcase"},
		{"Otros ingresos", "income", "#84cc16", "plus"},
	}
	if locale != "en" {
		return es
	}
	en := []string{"Food", "Transport", "Housing", "Utilities", "Health", "Entertainment", "Subscriptions",
		"Interest & fees", "Other", "Salary", "Other income"}
	out := make([]defaultCategory, len(es))
	for i, c := range es {
		c.name = en[i]
		out[i] = c
	}
	return out
}

func (s *Service) Register(ctx context.Context, in RegisterInput) (Session, error) {
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Name = strings.TrimSpace(in.Name)
	var v apperr.V
	v.Check(len(in.Email) <= 254 && emailRe.MatchString(in.Email), "email", "must be a valid email address")
	pw := utf8.RuneCountInString(in.Password)
	v.Check(pw >= 8 && len(in.Password) <= 128, "password", "must be 8-128 characters")
	checkProfile(&v, ProfileInput{Name: in.Name, Currency: in.Currency, Locale: in.Locale, Timezone: in.Timezone})
	if err := v.Err(); err != nil {
		return Session{}, err
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return Session{}, err
	}
	var sess Session
	err = s.inTx(ctx, func(q *store.Queries) error {
		u, err := q.CreateUser(ctx, store.CreateUserParams{
			Email: in.Email, PasswordHash: hash, Name: in.Name, Currency: in.Currency, Locale: in.Locale, Timezone: in.Timezone,
		})
		if isUnique(err) {
			return apperr.Conflict("email_taken", "an account with this email already exists")
		}
		if err != nil {
			return err
		}
		for _, c := range defaultCategories(in.Locale) {
			if _, err := q.CreateCategory(ctx, store.CreateCategoryParams{UserID: u.ID, Name: c.name, Kind: c.kind, Color: c.color, Icon: c.icon}); err != nil {
				return err
			}
		}
		sess, err = s.newSession(ctx, q, u, "")
		return err
	})
	return sess, err
}

func (s *Service) newSession(ctx context.Context, q *store.Queries, u store.User, family string) (Session, error) {
	access, err := s.tokens.Issue(u.ID)
	if err != nil {
		return Session{}, err
	}
	raw, hash, err := auth.NewRefresh()
	if err != nil {
		return Session{}, err
	}
	if family == "" {
		if family, err = auth.NewFamilyID(); err != nil {
			return Session{}, err
		}
	}
	err = q.CreateRefreshToken(ctx, store.CreateRefreshTokenParams{
		UserID: u.ID, FamilyID: family, TokenHash: hash, ExpiresAt: s.now().Add(s.refreshTTL),
	})
	if err != nil {
		return Session{}, err
	}
	return Session{AccessToken: access, RefreshToken: raw, User: toUser(u)}, nil
}

func (s *Service) Login(ctx context.Context, email, password string) (Session, error) {
	u, err := s.q.GetUserByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	if errors.Is(err, pgx.ErrNoRows) {
		auth.DummyVerify(password)
		return Session{}, invalidCredentials()
	}
	if err != nil {
		return Session{}, err
	}
	ok, err := auth.VerifyPassword(u.PasswordHash, password)
	if err != nil {
		return Session{}, err
	}
	if !ok {
		return Session{}, invalidCredentials()
	}
	return s.newSession(ctx, s.q, u, "")
}

// Refresh rotates a refresh token. Presenting an already-revoked token is
// treated as theft: the whole family is revoked (outside any rollback).
func (s *Service) Refresh(ctx context.Context, raw string) (Session, error) {
	if raw == "" {
		return Session{}, apperr.Unauthorized()
	}
	rt, err := s.q.GetRefreshToken(ctx, auth.HashRefresh(raw))
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, apperr.Unauthorized()
	}
	if err != nil {
		return Session{}, err
	}
	if rt.RevokedAt != nil {
		if err := s.q.RevokeRefreshFamily(ctx, rt.FamilyID); err != nil {
			return Session{}, err
		}
		return Session{}, apperr.Unauthorized()
	}
	if !s.now().Before(rt.ExpiresAt) {
		return Session{}, apperr.Unauthorized()
	}
	var sess Session
	err = s.inTx(ctx, func(q *store.Queries) error {
		n, err := q.RevokeRefreshToken(ctx, rt.ID)
		if err != nil {
			return err
		}
		if n == 0 { // a concurrent refresh won the race
			return apperr.Unauthorized()
		}
		u, err := q.GetUser(ctx, rt.UserID)
		if err != nil {
			return err
		}
		sess, err = s.newSession(ctx, q, u, rt.FamilyID)
		return err
	})
	return sess, err
}

func (s *Service) Logout(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}
	return s.q.RevokeRefreshByHash(ctx, auth.HashRefresh(raw))
}

func (s *Service) Me(ctx context.Context, a Actor) (User, error) {
	u, err := s.q.GetUser(ctx, a.UserID)
	if err != nil {
		return User{}, notFound(err)
	}
	return toUser(u), nil
}

func (s *Service) UpdateMe(ctx context.Context, a Actor, in ProfileInput) (User, error) {
	in.Name = strings.TrimSpace(in.Name)
	var v apperr.V
	checkProfile(&v, in)
	if err := v.Err(); err != nil {
		return User{}, err
	}
	u, err := s.q.UpdateUser(ctx, store.UpdateUserParams{ID: a.UserID, Name: in.Name, Currency: in.Currency, Locale: in.Locale, Timezone: in.Timezone})
	if err != nil {
		return User{}, notFound(err)
	}
	return toUser(u), nil
}
```

- [ ] **Step 5: Implement the handlers** `api/internal/httpapi/auth.go`

```go
package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/service"
)

const refreshCookie = "fin_refresh"

func (h *handlers) setRefreshCookie(c *gin.Context, raw string, maxAge int) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(refreshCookie, raw, maxAge, "/api/v1/auth", "", h.cfg.CookieSecure, true)
}

func (h *handlers) startSession(c *gin.Context, code int, sess service.Session) {
	h.setRefreshCookie(c, sess.RefreshToken, int(h.cfg.RefreshTTL.Seconds()))
	c.JSON(code, sess)
}

type loginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// register godoc
// @Summary Create an account and start a session
// @Tags    auth
// @Accept  json
// @Produce json
// @Param   body body     service.RegisterInput true "account"
// @Success 201  {object} service.Session
// @Failure 409  {object} ErrorResponse
// @Failure 422  {object} ErrorResponse
// @Router  /auth/register [post]
func (h *handlers) register(c *gin.Context) {
	var in service.RegisterInput
	if !bind(c, &in) {
		return
	}
	sess, err := h.svc.Register(c.Request.Context(), in)
	if err != nil {
		fail(c, err)
		return
	}
	h.startSession(c, http.StatusCreated, sess)
}

// login godoc
// @Summary Log in with email and password
// @Tags    auth
// @Accept  json
// @Produce json
// @Param   body body     loginInput true "credentials"
// @Success 200  {object} service.Session
// @Failure 401  {object} ErrorResponse
// @Router  /auth/login [post]
func (h *handlers) login(c *gin.Context) {
	var in loginInput
	if !bind(c, &in) {
		return
	}
	sess, err := h.svc.Login(c.Request.Context(), in.Email, in.Password)
	if err != nil {
		fail(c, err)
		return
	}
	h.startSession(c, http.StatusOK, sess)
}

// refresh godoc
// @Summary Exchange the refresh cookie for a new access token (rotates the cookie)
// @Tags    auth
// @Produce json
// @Success 200 {object} service.Session
// @Failure 401 {object} ErrorResponse
// @Router  /auth/refresh [post]
func (h *handlers) refresh(c *gin.Context) {
	raw, _ := c.Cookie(refreshCookie)
	sess, err := h.svc.Refresh(c.Request.Context(), raw)
	if err != nil {
		h.setRefreshCookie(c, "", -1)
		fail(c, err)
		return
	}
	h.startSession(c, http.StatusOK, sess)
}

// logout godoc
// @Summary Revoke the refresh cookie
// @Tags    auth
// @Success 204
// @Router  /auth/logout [post]
func (h *handlers) logout(c *gin.Context) {
	raw, _ := c.Cookie(refreshCookie)
	if err := h.svc.Logout(c.Request.Context(), raw); err != nil {
		fail(c, err)
		return
	}
	h.setRefreshCookie(c, "", -1)
	c.Status(http.StatusNoContent)
}

// getMe godoc
// @Summary  Current user profile
// @Tags     me
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} service.User
// @Router   /me [get]
func (h *handlers) getMe(c *gin.Context) {
	u, err := h.svc.Me(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, u)
}

// putMe godoc
// @Summary  Update profile (name, currency, locale, timezone)
// @Tags     me
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.ProfileInput true "profile"
// @Success  200  {object} service.User
// @Failure  422  {object} ErrorResponse
// @Router   /me [put]
func (h *handlers) putMe(c *gin.Context) {
	var in service.ProfileInput
	if !bind(c, &in) {
		return
	}
	u, err := h.svc.UpdateMe(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, u)
}
```

- [ ] **Step 6: Register the routes.** Replace `routes` in `router.go`:

```go
// routes is the single place endpoints are registered; each task adds its lines here.
func (h *handlers) routes(v1 *gin.RouterGroup) {
	a := v1.Group("/auth", rateLimit(h.cfg.AuthRatePerMin))
	a.POST("/register", h.register)
	a.POST("/login", h.login)
	a.POST("/refresh", h.refresh)
	a.POST("/logout", h.logout)

	p := v1.Group("", requireAuth(h.svc))
	p.GET("/me", h.getMe)
	p.PUT("/me", h.putMe)
}
```

- [ ] **Step 7: Run the tests and confirm they pass.** Run `go test ./internal/...`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api && git commit -m "feat(api): register, login, refresh rotation with reuse detection, logout, profile"
```

---
### Task 7: Categories and payment methods

**Files:**
- Modify: `api/queries/categories.sql` (add the remaining queries)
- Create: `api/queries/payment_methods.sql`, `api/internal/service/refs.go`, `api/internal/service/categories.go`, `api/internal/service/payment_methods.go`, `api/internal/httpapi/categories.go`, `api/internal/httpapi/payment_methods.go`, `api/internal/httpapi/categories_test.go`, `api/internal/httpapi/payment_methods_test.go`
- Modify: `api/internal/httpapi/router.go`

**Interfaces:**
- Produces (refs.go, shared by every later task):
  - `const maxAmount int64 = 1_000_000_000_000`
  - `checkAmount(v *apperr.V, field string, amount int64)`
  - `(*Service).checkCategoryRef(ctx, q *store.Queries, userID, id int64, kind, field string) error`, where kind `""` means any kind
  - `(*Service).checkPaymentMethodRef(ctx, q *store.Queries, userID int64, id *int64, field string, creditOnly bool) (*store.PaymentMethod, error)`
  - `eqPtr[T comparable](a, b *T) bool`
  - `hasCardNumber(s string) bool`
  - `colorRe`
- Produces (types and methods):
  - `service.Category{ID, Name, Kind, Color, Icon}`, `service.CategoryInput{Name, Kind, Color, Icon}`
  - `ListCategories(ctx, a, kind *string)`, `CreateCategory`, `UpdateCategory(ctx, a, id, in)`, `DeleteCategory(ctx, a, id int64, reassignTo *int64) error`
  - `service.PaymentMethod{ID, Nickname, Type, Bank, Network, Last4 *string, Color, Active, CreditLimit *int64, StatementDay, PaymentDueDay *int32, OpeningBalance int64, OpeningBalanceDate *datex.Date}`, `service.PaymentMethodInput` (same fields without ID; `Active *bool`)
  - `ListPaymentMethods`, `GetPaymentMethod`, `CreatePaymentMethod`, `UpdatePaymentMethod`, `DeletePaymentMethod`
  - `toPaymentMethod(store.PaymentMethod) PaymentMethod`

- [ ] **Step 1: Queries.** Append to `api/queries/categories.sql`:

```sql
-- name: ListCategories :many
SELECT * FROM categories
WHERE user_id = @user_id AND (sqlc.narg(kind)::text IS NULL OR kind = sqlc.narg(kind))
ORDER BY kind, name;

-- name: GetCategory :one
SELECT * FROM categories WHERE id = @id AND user_id = @user_id;

-- name: UpdateCategory :one
UPDATE categories SET name = @name, color = @color, icon = @icon, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: CategoryUsage :one
SELECT ((SELECT count(*) FROM expenses e WHERE e.category_id = @id)
      + (SELECT count(*) FROM fixed_payments f WHERE f.category_id = @id)
      + (SELECT count(*) FROM income_sources i WHERE i.category_id = @id)
      + (SELECT count(*) FROM monthly_entries m WHERE m.category_id = @id)
      + (SELECT count(*) FROM installment_plans p WHERE p.category_id = @id))::bigint AS uses;

-- name: ReassignExpensesCategory :exec
UPDATE expenses SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id;

-- name: ReassignFixedCategory :exec
UPDATE fixed_payments SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id;

-- name: ReassignIncomeCategory :exec
UPDATE income_sources SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id;

-- name: ReassignEntriesCategory :exec
UPDATE monthly_entries SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id;

-- name: ReassignPlansCategory :exec
UPDATE installment_plans SET category_id = @to_id, updated_at = now() WHERE category_id = @from_id;

-- name: DeleteCategory :execrows
DELETE FROM categories WHERE id = @id AND user_id = @user_id;
```

Create `api/queries/payment_methods.sql`:

```sql
-- name: CreatePaymentMethod :one
INSERT INTO payment_methods (user_id, nickname, type, bank, network, last4, color, active,
    credit_limit, statement_day, payment_due_day, opening_balance, opening_balance_date)
VALUES (@user_id, @nickname, @type, sqlc.narg(bank), sqlc.narg(network), sqlc.narg(last4), @color, @active,
    sqlc.narg(credit_limit), sqlc.narg(statement_day), sqlc.narg(payment_due_day), @opening_balance, sqlc.narg(opening_balance_date))
RETURNING *;

-- name: ListPaymentMethods :many
SELECT * FROM payment_methods WHERE user_id = @user_id ORDER BY active DESC, nickname, id;

-- name: ListCreditCards :many
SELECT * FROM payment_methods WHERE user_id = @user_id AND type = 'credit' AND active ORDER BY nickname, id;

-- name: GetPaymentMethod :one
SELECT * FROM payment_methods WHERE id = @id AND user_id = @user_id;

-- name: UpdatePaymentMethod :one
UPDATE payment_methods SET nickname = @nickname, bank = sqlc.narg(bank), network = sqlc.narg(network),
    last4 = sqlc.narg(last4), color = @color, active = @active, credit_limit = sqlc.narg(credit_limit),
    statement_day = sqlc.narg(statement_day), payment_due_day = sqlc.narg(payment_due_day),
    opening_balance = @opening_balance, opening_balance_date = sqlc.narg(opening_balance_date), updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: PaymentMethodUsage :one
SELECT ((SELECT count(*) FROM expenses e WHERE e.payment_method_id = @id)
      + (SELECT count(*) FROM fixed_payments f WHERE f.payment_method_id = @id)
      + (SELECT count(*) FROM monthly_entries m WHERE m.payment_method_id = @id)
      + (SELECT count(*) FROM installment_plans p WHERE p.payment_method_id = @id)
      + (SELECT count(*) FROM card_payments c WHERE c.payment_method_id = @id))::bigint AS uses;

-- name: DeletePaymentMethod :execrows
DELETE FROM payment_methods WHERE id = @id AND user_id = @user_id;
```

Run `sqlc generate && go build ./...`.

- [ ] **Step 2: Write the failing tests** `api/internal/httpapi/categories_test.go`

```go
package httpapi_test

import (
	"context"
	"fmt"
	"testing"
)

type category struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Kind  string `json:"kind"`
	Color string `json:"color"`
}

type list[T any] struct {
	Items []T `json:"items"`
}

// catID returns the id of the user's category with the given name.
func (h *harness) catID(tok, name string) int64 {
	h.t.Helper()
	for _, c := range expect[list[category]](h.t, h.do("GET", "/api/v1/categories", tok, nil), 200).Items {
		if c.Name == name {
			return c.ID
		}
	}
	h.t.Fatalf("category %q not found", name)
	return 0
}

func TestCategoriesCRUD(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("cat@example.com")

	all := expect[list[category]](t, h.do("GET", "/api/v1/categories", tok, nil), 200)
	inc := expect[list[category]](t, h.do("GET", "/api/v1/categories?kind=income", tok, nil), 200)
	if len(all.Items) != 11 || len(inc.Items) != 2 {
		t.Fatalf("all=%d income=%d", len(all.Items), len(inc.Items))
	}

	c := expect[category](t, h.do("POST", "/api/v1/categories", tok, M{"name": " Mascotas ", "kind": "expense", "color": "#123abc"}), 201)
	if c.Name != "Mascotas" || c.Color != "#123abc" {
		t.Fatalf("created %+v", c)
	}
	if r := h.do("POST", "/api/v1/categories", tok, M{"name": "Mascotas", "kind": "expense"}); r.Code != 409 || errCode(r) != "category_exists" {
		t.Fatalf("dup: %d %s", r.Code, r.Body)
	}
	if r := h.do("POST", "/api/v1/categories", tok, M{"name": "", "kind": "other", "color": "red"}); r.Code != 422 || len(errFields(r)) != 3 {
		t.Fatalf("validation: %d %s", r.Code, r.Body)
	}
	up := expect[category](t, h.do("PUT", fmt.Sprintf("/api/v1/categories/%d", c.ID), tok, M{"name": "Pets", "kind": "expense", "color": "#000000", "icon": "paw"}), 200)
	if up.Name != "Pets" {
		t.Fatalf("update %+v", up)
	}
	if r := h.do("PUT", fmt.Sprintf("/api/v1/categories/%d", c.ID), tok, M{"name": "Pets", "kind": "income"}); r.Code != 422 {
		t.Fatalf("kind change allowed: %d", r.Code)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d", c.ID), tok, nil); r.Code != 204 {
		t.Fatalf("delete unused: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d", c.ID), tok, nil); r.Code != 404 {
		t.Fatalf("delete twice: %d", r.Code)
	}
}

func TestDeleteCategoryInUse(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("use@example.com")
	food, other, salary := h.catID(tok, "Comida"), h.catID(tok, "Otros"), h.catID(tok, "Salario")
	var uid int64
	ctx := context.Background()
	_ = h.pool.QueryRow(ctx, "SELECT user_id FROM categories WHERE id=$1", food).Scan(&uid)
	if _, err := h.pool.Exec(ctx, "INSERT INTO expenses (user_id,category_id,amount,spent_on) VALUES ($1,$2,500,'2026-03-01')", uid, food); err != nil {
		t.Fatal(err)
	}

	r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d", food), tok, nil)
	if r.Code != 409 || errCode(r) != "category_in_use" {
		t.Fatalf("in use: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d?reassign_to=%d", food, salary), tok, nil); r.Code != 422 {
		t.Fatalf("reassign to income kind: %d", r.Code)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d?reassign_to=%d", food, food), tok, nil); r.Code != 422 {
		t.Fatalf("reassign to self: %d", r.Code)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/categories/%d?reassign_to=%d", food, other), tok, nil); r.Code != 204 {
		t.Fatalf("reassign: %d %s", r.Code, r.Body)
	}
	var now int64
	_ = h.pool.QueryRow(ctx, "SELECT category_id FROM expenses WHERE user_id=$1", uid).Scan(&now)
	if now != other {
		t.Fatalf("expense category = %d, want %d", now, other)
	}
}
```

`api/internal/httpapi/payment_methods_test.go`:

```go
package httpapi_test

import (
	"context"
	"fmt"
	"testing"
)

type paymentMethod struct {
	ID                 int64   `json:"id"`
	Nickname           string  `json:"nickname"`
	Type               string  `json:"type"`
	Last4              *string `json:"last4"`
	Active             bool    `json:"active"`
	CreditLimit        *int64  `json:"credit_limit"`
	StatementDay       *int32  `json:"statement_day"`
	PaymentDueDay      *int32  `json:"payment_due_day"`
	OpeningBalance     int64   `json:"opening_balance"`
	OpeningBalanceDate *string `json:"opening_balance_date"`
}

// creditCard creates a credit card closing on day 15, due on day 5.
func (h *harness) creditCard(tok string) int64 {
	h.t.Helper()
	return expect[paymentMethod](h.t, h.do("POST", "/api/v1/payment-methods", tok, M{
		"nickname": "BBVA Oro", "type": "credit", "bank": "BBVA", "network": "visa", "last4": "4242",
		"credit_limit": 5000000, "statement_day": 15, "payment_due_day": 5,
		"opening_balance": 0, "opening_balance_date": "2026-01-01",
	}), 201).ID
}

func TestPaymentMethods(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("pm@example.com")

	cc := expect[paymentMethod](t, h.do("POST", "/api/v1/payment-methods", tok, M{
		"nickname": "BBVA Oro", "type": "credit", "last4": "4242", "credit_limit": 5000000,
		"statement_day": 15, "payment_due_day": 5, "opening_balance": 120000,
	}), 201)
	if !cc.Active || *cc.StatementDay != 15 || cc.OpeningBalance != 120000 || *cc.OpeningBalanceDate != "2026-03-15" {
		t.Fatalf("credit card %+v", cc)
	}
	deb := expect[paymentMethod](t, h.do("POST", "/api/v1/payment-methods", tok, M{"nickname": "Nómina", "type": "debit", "last4": "0001"}), 201)
	if deb.StatementDay != nil || deb.CreditLimit != nil {
		t.Fatalf("debit %+v", deb)
	}

	bad := []M{
		{"nickname": "x", "type": "debit", "statement_day": 3},
		{"nickname": "x", "type": "credit", "payment_due_day": 5},
		{"nickname": "x", "type": "debit", "last4": "12a4"},
		{"nickname": "Tarjeta 4111111111111111", "type": "debit"},
		{"nickname": "x", "type": "bitcoin"},
		{"nickname": "x", "type": "credit", "statement_day": 32, "payment_due_day": 5},
	}
	for i, b := range bad {
		if r := h.do("POST", "/api/v1/payment-methods", tok, b); r.Code != 422 {
			t.Errorf("bad[%d] accepted: %d %s", i, r.Code, r.Body)
		}
	}

	path := fmt.Sprintf("/api/v1/payment-methods/%d", deb.ID)
	if r := h.do("PUT", path, tok, M{"nickname": "Nómina", "type": "credit", "statement_day": 1, "payment_due_day": 20}); r.Code != 422 {
		t.Fatalf("type change allowed: %d", r.Code)
	}
	up := expect[paymentMethod](t, h.do("PUT", path, tok, M{"nickname": "Nómina BBVA", "type": "debit", "last4": nil, "active": false}), 200)
	if up.Nickname != "Nómina BBVA" || up.Last4 != nil || up.Active {
		t.Fatalf("update %+v", up)
	}
	got := expect[paymentMethod](t, h.do("GET", path, tok, nil), 200)
	if got.ID != deb.ID {
		t.Fatal("get mismatch")
	}
	if l := expect[list[paymentMethod]](t, h.do("GET", "/api/v1/payment-methods", tok, nil), 200); len(l.Items) != 2 {
		t.Fatalf("list %d", len(l.Items))
	}

	var uid int64
	ctx := context.Background()
	_ = h.pool.QueryRow(ctx, "SELECT user_id FROM payment_methods WHERE id=$1", cc.ID).Scan(&uid)
	if _, err := h.pool.Exec(ctx, "INSERT INTO card_payments (user_id,payment_method_id,amount,paid_on) VALUES ($1,$2,100,'2026-03-01')", uid, cc.ID); err != nil {
		t.Fatal(err)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/payment-methods/%d", cc.ID), tok, nil); r.Code != 409 || errCode(r) != "payment_method_in_use" {
		t.Fatalf("delete in use: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", path, tok, nil); r.Code != 204 {
		t.Fatalf("delete unused: %d", r.Code)
	}
}
```

Run `go test ./internal/httpapi/ -run 'Categor|PaymentMethods'`. Expected: FAIL (404s).

- [ ] **Step 3: Implement the shared checks** `api/internal/service/refs.go`

```go
package service

import (
	"context"
	"errors"
	"regexp"

	"github.com/jackc/pgx/v5"

	"financego/internal/apperr"
	"financego/internal/store"
)

const maxAmount int64 = 1_000_000_000_000

var (
	colorRe      = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	cardNumberRe = regexp.MustCompile(`\d(?:[ -]?\d){12,18}`)
)

func checkAmount(v *apperr.V, field string, amount int64) {
	v.Check(amount >= 1 && amount < maxAmount, field, "must be between 1 and 999999999999 cents")
}

// hasCardNumber reports whether s looks like it contains a full card number (13-19 digits).
func hasCardNumber(s string) bool { return cardNumberRe.MatchString(s) }

func eqPtr[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

// checkCategoryRef verifies the category belongs to the user (and has `kind` when non-empty).
func (s *Service) checkCategoryRef(ctx context.Context, q *store.Queries, userID, id int64, kind, field string) error {
	c, err := q.GetCategory(ctx, store.GetCategoryParams{ID: id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.InvalidReference(field)
	}
	if err != nil {
		return err
	}
	if kind != "" && c.Kind != kind {
		return apperr.Validation(map[string]string{field: "must be an " + kind + " category"})
	}
	return nil
}

// checkPaymentMethodRef verifies an optional payment method belongs to the user.
func (s *Service) checkPaymentMethodRef(ctx context.Context, q *store.Queries, userID int64, id *int64, field string, creditOnly bool) (*store.PaymentMethod, error) {
	if id == nil {
		return nil, nil
	}
	pm, err := q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: *id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.InvalidReference(field)
	}
	if err != nil {
		return nil, err
	}
	if creditOnly && pm.Type != "credit" {
		return nil, apperr.Validation(map[string]string{field: "must be a credit card"})
	}
	return &pm, nil
}
```

(The message "an expense category" reads fine; "an income category" too.)

- [ ] **Step 4: Implement** `api/internal/service/categories.go`

```go
package service

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/store"
)

type Category struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Kind  string `json:"kind"`
	Color string `json:"color"`
	Icon  string `json:"icon"`
}

type CategoryInput struct {
	Name  string `json:"name"`
	Kind  string `json:"kind"`
	Color string `json:"color"`
	Icon  string `json:"icon"`
}

func toCategory(c store.Category) Category {
	return Category{ID: c.ID, Name: c.Name, Kind: c.Kind, Color: c.Color, Icon: c.Icon}
}

func normalizeCategory(in *CategoryInput) error {
	in.Name = strings.TrimSpace(in.Name)
	if in.Color == "" {
		in.Color = "#64748b"
	}
	if in.Icon == "" {
		in.Icon = "tag"
	}
	var v apperr.V
	n := utf8.RuneCountInString(in.Name)
	v.Check(n >= 1 && n <= 60, "name", "must be 1-60 characters")
	v.Check(in.Kind == "expense" || in.Kind == "income", "kind", "must be expense or income")
	v.Check(colorRe.MatchString(in.Color), "color", "must be a hex color such as #22c55e")
	v.Check(len(in.Icon) <= 40, "icon", "must be at most 40 characters")
	return v.Err()
}

func (s *Service) ListCategories(ctx context.Context, a Actor, kind *string) ([]Category, error) {
	rows, err := s.q.ListCategories(ctx, store.ListCategoriesParams{UserID: a.UserID, Kind: kind})
	if err != nil {
		return nil, err
	}
	out := make([]Category, len(rows))
	for i, r := range rows {
		out[i] = toCategory(r)
	}
	return out, nil
}

func (s *Service) CreateCategory(ctx context.Context, a Actor, in CategoryInput) (Category, error) {
	if err := normalizeCategory(&in); err != nil {
		return Category{}, err
	}
	c, err := s.q.CreateCategory(ctx, store.CreateCategoryParams{UserID: a.UserID, Name: in.Name, Kind: in.Kind, Color: in.Color, Icon: in.Icon})
	if isUnique(err) {
		return Category{}, apperr.Conflict("category_exists", "a category with this name already exists")
	}
	if err != nil {
		return Category{}, err
	}
	return toCategory(c), nil
}

func (s *Service) UpdateCategory(ctx context.Context, a Actor, id int64, in CategoryInput) (Category, error) {
	if err := normalizeCategory(&in); err != nil {
		return Category{}, err
	}
	cur, err := s.q.GetCategory(ctx, store.GetCategoryParams{ID: id, UserID: a.UserID})
	if err != nil {
		return Category{}, notFound(err)
	}
	if cur.Kind != in.Kind {
		return Category{}, apperr.Validation(map[string]string{"kind": "cannot be changed"})
	}
	c, err := s.q.UpdateCategory(ctx, store.UpdateCategoryParams{ID: id, UserID: a.UserID, Name: in.Name, Color: in.Color, Icon: in.Icon})
	if isUnique(err) {
		return Category{}, apperr.Conflict("category_exists", "a category with this name already exists")
	}
	if err != nil {
		return Category{}, notFound(err)
	}
	return toCategory(c), nil
}

// DeleteCategory removes a category. If it is referenced, reassignTo must name
// another category of the same kind, which inherits every reference.
func (s *Service) DeleteCategory(ctx context.Context, a Actor, id int64, reassignTo *int64) error {
	return s.inTx(ctx, func(q *store.Queries) error {
		cat, err := q.GetCategory(ctx, store.GetCategoryParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		if reassignTo != nil {
			if *reassignTo == id {
				return apperr.Validation(map[string]string{"reassign_to": "must be a different category"})
			}
			if err := s.checkCategoryRef(ctx, q, a.UserID, *reassignTo, cat.Kind, "reassign_to"); err != nil {
				return err
			}
			to, from := *reassignTo, id
			if err := q.ReassignExpensesCategory(ctx, store.ReassignExpensesCategoryParams{ToID: to, FromID: from}); err != nil {
				return err
			}
			if err := q.ReassignFixedCategory(ctx, store.ReassignFixedCategoryParams{ToID: to, FromID: from}); err != nil {
				return err
			}
			if err := q.ReassignIncomeCategory(ctx, store.ReassignIncomeCategoryParams{ToID: &to, FromID: &from}); err != nil {
				return err
			}
			if err := q.ReassignEntriesCategory(ctx, store.ReassignEntriesCategoryParams{ToID: &to, FromID: &from}); err != nil {
				return err
			}
			if err := q.ReassignPlansCategory(ctx, store.ReassignPlansCategoryParams{ToID: to, FromID: from}); err != nil {
				return err
			}
		} else {
			uses, err := q.CategoryUsage(ctx, id)
			if err != nil {
				return err
			}
			if uses > 0 {
				return apperr.Conflict("category_in_use", fmt.Sprintf("category is used by %d records; pass reassign_to", uses))
			}
		}
		_, err = q.DeleteCategory(ctx, store.DeleteCategoryParams{ID: id, UserID: a.UserID})
		return err
	})
}
```

> **sqlc typing note:** `income_sources.category_id` and `monthly_entries.category_id` are nullable, so sqlc types their reassign params as `*int64`. The other three tables use `int64`. If `go build` reports a mismatch, follow the generated `*Params` struct; the logic is unchanged.

- [ ] **Step 5: Implement** `api/internal/service/payment_methods.go`

```go
package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

type PaymentMethod struct {
	ID                 int64       `json:"id"`
	Nickname           string      `json:"nickname"`
	Type               string      `json:"type"`
	Bank               *string     `json:"bank"`
	Network            *string     `json:"network"`
	Last4              *string     `json:"last4"`
	Color              string      `json:"color"`
	Active             bool        `json:"active"`
	CreditLimit        *int64      `json:"credit_limit"`
	StatementDay       *int32      `json:"statement_day"`
	PaymentDueDay      *int32      `json:"payment_due_day"`
	OpeningBalance     int64       `json:"opening_balance"`
	OpeningBalanceDate *datex.Date `json:"opening_balance_date"`
}

type PaymentMethodInput struct {
	Nickname           string      `json:"nickname"`
	Type               string      `json:"type"`
	Bank               *string     `json:"bank"`
	Network            *string     `json:"network"`
	Last4              *string     `json:"last4"`
	Color              string      `json:"color"`
	Active             *bool       `json:"active"`
	CreditLimit        *int64      `json:"credit_limit"`
	StatementDay       *int32      `json:"statement_day"`
	PaymentDueDay      *int32      `json:"payment_due_day"`
	OpeningBalance     int64       `json:"opening_balance"`
	OpeningBalanceDate *datex.Date `json:"opening_balance_date"`
}

var last4Re = regexp.MustCompile(`^[0-9]{4}$`)

func toPaymentMethod(p store.PaymentMethod) PaymentMethod {
	return PaymentMethod{
		ID: p.ID, Nickname: p.Nickname, Type: p.Type, Bank: p.Bank, Network: p.Network, Last4: p.Last4,
		Color: p.Color, Active: p.Active, CreditLimit: p.CreditLimit, StatementDay: p.StatementDay,
		PaymentDueDay: p.PaymentDueDay, OpeningBalance: p.OpeningBalance, OpeningBalanceDate: datex.DatePtr(p.OpeningBalanceDate),
	}
}

func blankToNil(p *string) *string {
	if p == nil {
		return nil
	}
	t := strings.TrimSpace(*p)
	if t == "" {
		return nil
	}
	return &t
}

func dayOK(d *int32) bool { return d != nil && *d >= 1 && *d <= 31 }

// normalizePaymentMethod validates the input and fills defaults. today is used
// as the default opening_balance_date for credit cards.
func normalizePaymentMethod(in *PaymentMethodInput, today time.Time) error {
	in.Nickname = strings.TrimSpace(in.Nickname)
	in.Bank, in.Network, in.Last4 = blankToNil(in.Bank), blankToNil(in.Network), blankToNil(in.Last4)
	if in.Color == "" {
		in.Color = "#64748b"
	}
	if in.Active == nil {
		t := true
		in.Active = &t
	}
	var v apperr.V
	n := utf8.RuneCountInString(in.Nickname)
	v.Check(n >= 1 && n <= 60, "nickname", "must be 1-60 characters")
	v.Check(!hasCardNumber(in.Nickname), "nickname", "must not contain a card number")
	v.Check(in.Type == "credit" || in.Type == "debit" || in.Type == "cash" || in.Type == "transfer", "type", "must be credit, debit, cash or transfer")
	v.Check(in.Bank == nil || (utf8.RuneCountInString(*in.Bank) <= 60 && !hasCardNumber(*in.Bank)), "bank", "must be at most 60 characters and contain no card number")
	v.Check(in.Network == nil || *in.Network == "visa" || *in.Network == "mastercard" || *in.Network == "amex" || *in.Network == "other", "network", "must be visa, mastercard, amex or other")
	v.Check(in.Last4 == nil || last4Re.MatchString(*in.Last4), "last4", "must be exactly 4 digits")
	v.Check(colorRe.MatchString(in.Color), "color", "must be a hex color such as #22c55e")
	if in.Type == "credit" {
		v.Check(dayOK(in.StatementDay), "statement_day", "is required for credit cards (1-31)")
		v.Check(dayOK(in.PaymentDueDay), "payment_due_day", "is required for credit cards (1-31)")
		if in.CreditLimit != nil {
			checkAmount(&v, "credit_limit", *in.CreditLimit)
		}
		v.Check(in.OpeningBalance >= 0 && in.OpeningBalance < maxAmount, "opening_balance", "must be between 0 and 999999999999 cents")
		if in.OpeningBalanceDate == nil {
			d := datex.NewDate(today)
			in.OpeningBalanceDate = &d
		}
	} else {
		v.Check(in.StatementDay == nil, "statement_day", "only allowed for credit cards")
		v.Check(in.PaymentDueDay == nil, "payment_due_day", "only allowed for credit cards")
		v.Check(in.CreditLimit == nil, "credit_limit", "only allowed for credit cards")
		v.Check(in.OpeningBalance == 0, "opening_balance", "only allowed for credit cards")
		in.OpeningBalanceDate = nil
	}
	return v.Err()
}

func dateOrNil(d *datex.Date) *time.Time {
	if d == nil {
		return nil
	}
	t := d.Time
	return &t
}

func (s *Service) ListPaymentMethods(ctx context.Context, a Actor) ([]PaymentMethod, error) {
	rows, err := s.q.ListPaymentMethods(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	out := make([]PaymentMethod, len(rows))
	for i, r := range rows {
		out[i] = toPaymentMethod(r)
	}
	return out, nil
}

func (s *Service) GetPaymentMethod(ctx context.Context, a Actor, id int64) (PaymentMethod, error) {
	p, err := s.q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: id, UserID: a.UserID})
	if err != nil {
		return PaymentMethod{}, notFound(err)
	}
	return toPaymentMethod(p), nil
}

func (s *Service) CreatePaymentMethod(ctx context.Context, a Actor, in PaymentMethodInput) (PaymentMethod, error) {
	if err := normalizePaymentMethod(&in, s.today(a)); err != nil {
		return PaymentMethod{}, err
	}
	p, err := s.q.CreatePaymentMethod(ctx, store.CreatePaymentMethodParams{
		UserID: a.UserID, Nickname: in.Nickname, Type: in.Type, Bank: in.Bank, Network: in.Network, Last4: in.Last4,
		Color: in.Color, Active: *in.Active, CreditLimit: in.CreditLimit, StatementDay: in.StatementDay,
		PaymentDueDay: in.PaymentDueDay, OpeningBalance: in.OpeningBalance, OpeningBalanceDate: dateOrNil(in.OpeningBalanceDate),
	})
	if err != nil {
		return PaymentMethod{}, err
	}
	return toPaymentMethod(p), nil
}

func (s *Service) UpdatePaymentMethod(ctx context.Context, a Actor, id int64, in PaymentMethodInput) (PaymentMethod, error) {
	cur, err := s.q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: id, UserID: a.UserID})
	if err != nil {
		return PaymentMethod{}, notFound(err)
	}
	if in.Type != cur.Type {
		return PaymentMethod{}, apperr.Validation(map[string]string{"type": "cannot be changed"})
	}
	if err := normalizePaymentMethod(&in, s.today(a)); err != nil {
		return PaymentMethod{}, err
	}
	p, err := s.q.UpdatePaymentMethod(ctx, store.UpdatePaymentMethodParams{
		ID: id, UserID: a.UserID, Nickname: in.Nickname, Bank: in.Bank, Network: in.Network, Last4: in.Last4,
		Color: in.Color, Active: *in.Active, CreditLimit: in.CreditLimit, StatementDay: in.StatementDay,
		PaymentDueDay: in.PaymentDueDay, OpeningBalance: in.OpeningBalance, OpeningBalanceDate: dateOrNil(in.OpeningBalanceDate),
	})
	if err != nil {
		return PaymentMethod{}, notFound(err)
	}
	return toPaymentMethod(p), nil
}

func (s *Service) DeletePaymentMethod(ctx context.Context, a Actor, id int64) error {
	return s.inTx(ctx, func(q *store.Queries) error {
		if _, err := q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: id, UserID: a.UserID}); err != nil {
			return notFound(err)
		}
		uses, err := q.PaymentMethodUsage(ctx, id)
		if err != nil {
			return err
		}
		if uses > 0 {
			return apperr.Conflict("payment_method_in_use", fmt.Sprintf("payment method is used by %d records; deactivate it instead", uses))
		}
		_, err = q.DeletePaymentMethod(ctx, store.DeletePaymentMethodParams{ID: id, UserID: a.UserID})
		return err
	})
}
```

- [ ] **Step 6: Handlers** `api/internal/httpapi/categories.go`

```go
package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/service"
)

// listCategories godoc
// @Summary  List categories
// @Tags     categories
// @Produce  json
// @Security BearerAuth
// @Param    kind query string false "expense or income"
// @Success  200 {object} object{items=[]service.Category}
// @Router   /categories [get]
func (h *handlers) listCategories(c *gin.Context) {
	var kind *string
	if k := c.Query("kind"); k != "" {
		kind = &k
	}
	list, err := h.svc.ListCategories(c.Request.Context(), actorOf(c), kind)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createCategory godoc
// @Summary  Create a category
// @Tags     categories
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.CategoryInput true "category"
// @Success  201  {object} service.Category
// @Failure  409  {object} ErrorResponse
// @Failure  422  {object} ErrorResponse
// @Router   /categories [post]
func (h *handlers) createCategory(c *gin.Context) {
	var in service.CategoryInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateCategory(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateCategory godoc
// @Summary  Update a category (kind cannot change)
// @Tags     categories
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                   true "category id"
// @Param    body body     service.CategoryInput true "category"
// @Success  200  {object} service.Category
// @Router   /categories/{id} [put]
func (h *handlers) updateCategory(c *gin.Context) {
	id, ok := pathID(c)
	var in service.CategoryInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateCategory(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteCategory godoc
// @Summary  Delete a category; if it is in use, pass reassign_to
// @Tags     categories
// @Security BearerAuth
// @Param    id          path  int true  "category id"
// @Param    reassign_to query int false "category that inherits all references"
// @Success  204
// @Failure  409 {object} ErrorResponse
// @Router   /categories/{id} [delete]
func (h *handlers) deleteCategory(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	to, ok := queryInt64(c, "reassign_to")
	if !ok {
		return
	}
	if err := h.svc.DeleteCategory(c.Request.Context(), actorOf(c), id, to); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
```

`api/internal/httpapi/payment_methods.go`:

```go
package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/service"
)

// listPaymentMethods godoc
// @Summary  List payment methods (cards are reference data: last 4 digits only)
// @Tags     payment-methods
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.PaymentMethod}
// @Router   /payment-methods [get]
func (h *handlers) listPaymentMethods(c *gin.Context) {
	list, err := h.svc.ListPaymentMethods(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// getPaymentMethod godoc
// @Summary  Get a payment method
// @Tags     payment-methods
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "payment method id"
// @Success  200 {object} service.PaymentMethod
// @Router   /payment-methods/{id} [get]
func (h *handlers) getPaymentMethod(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.svc.GetPaymentMethod(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// createPaymentMethod godoc
// @Summary  Create a payment method
// @Tags     payment-methods
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.PaymentMethodInput true "payment method"
// @Success  201  {object} service.PaymentMethod
// @Failure  422  {object} ErrorResponse
// @Router   /payment-methods [post]
func (h *handlers) createPaymentMethod(c *gin.Context) {
	var in service.PaymentMethodInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreatePaymentMethod(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updatePaymentMethod godoc
// @Summary  Replace a payment method's editable fields (type cannot change)
// @Tags     payment-methods
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                        true "payment method id"
// @Param    body body     service.PaymentMethodInput true "payment method"
// @Success  200  {object} service.PaymentMethod
// @Router   /payment-methods/{id} [put]
func (h *handlers) updatePaymentMethod(c *gin.Context) {
	id, ok := pathID(c)
	var in service.PaymentMethodInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdatePaymentMethod(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deletePaymentMethod godoc
// @Summary  Delete an unused payment method (deactivate used ones instead)
// @Tags     payment-methods
// @Security BearerAuth
// @Param    id path int true "payment method id"
// @Success  204
// @Failure  409 {object} ErrorResponse
// @Router   /payment-methods/{id} [delete]
func (h *handlers) deletePaymentMethod(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.DeletePaymentMethod(c.Request.Context(), actorOf(c), id); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 7: Register the routes.** Append these lines inside `routes`, after the `/me` lines:

```go
	p.GET("/categories", h.listCategories)
	p.POST("/categories", h.createCategory)
	p.PUT("/categories/:id", h.updateCategory)
	p.DELETE("/categories/:id", h.deleteCategory)

	p.GET("/payment-methods", h.listPaymentMethods)
	p.POST("/payment-methods", h.createPaymentMethod)
	p.GET("/payment-methods/:id", h.getPaymentMethod)
	p.PUT("/payment-methods/:id", h.updatePaymentMethod)
	p.DELETE("/payment-methods/:id", h.deletePaymentMethod)
```

- [ ] **Step 8: Run the tests and confirm they pass.** Run `go test ./internal/...`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add api && git commit -m "feat(api): categories with reassign-on-delete, payment methods (reference-only card data)"
```

---

### Task 8: Income sources and fixed payments (templates)

**Files:**
- Create: `api/queries/recurring.sql`, `api/internal/service/recurring.go`, `api/internal/httpapi/recurring.go`, `api/internal/httpapi/recurring_test.go`
- Modify: `api/internal/httpapi/router.go`

**Interfaces:**
- Produces:
  - `service.IncomeSource{ID, CategoryID *int64, Name, Amount, DayOfMonth int32, StartMonth datex.Month, EndMonth *datex.Month, Active}` and `service.IncomeSourceInput` (no ID; `Active *bool`)
  - `service.FixedPayment{ID, CategoryID int64, PaymentMethodID *int64, Name, Amount, DayOfMonth, StartMonth, EndMonth, Active}` and `service.FixedPaymentInput`
  - `List/Create/Update/DeactivateIncomeSource(s)` and `List/Create/Update/DeactivateFixedPayment(s)`
  - Update and Deactivate run inside `s.inTx` and call a hook, `s.afterIncomeChange(ctx, q, a, id)` or `s.afterFixedChange(ctx, q, a, id)`. The hooks are no-ops here; Task 9 fills them in.

- [ ] **Step 1: Queries** `api/queries/recurring.sql`

```sql
-- name: CreateIncomeSource :one
INSERT INTO income_sources (user_id, category_id, name, amount, day_of_month, start_month, end_month, active)
VALUES (@user_id, sqlc.narg(category_id), @name, @amount, @day_of_month, @start_month, sqlc.narg(end_month), @active)
RETURNING *;

-- name: ListIncomeSources :many
SELECT * FROM income_sources WHERE user_id = @user_id ORDER BY active DESC, name, id;

-- name: UpdateIncomeSource :one
UPDATE income_sources SET category_id = sqlc.narg(category_id), name = @name, amount = @amount,
    day_of_month = @day_of_month, start_month = @start_month, end_month = sqlc.narg(end_month),
    active = @active, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: DeactivateIncomeSource :one
UPDATE income_sources SET active = false, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: CreateFixedPayment :one
INSERT INTO fixed_payments (user_id, category_id, payment_method_id, name, amount, day_of_month, start_month, end_month, active)
VALUES (@user_id, @category_id, sqlc.narg(payment_method_id), @name, @amount, @day_of_month, @start_month, sqlc.narg(end_month), @active)
RETURNING *;

-- name: ListFixedPayments :many
SELECT * FROM fixed_payments WHERE user_id = @user_id ORDER BY active DESC, name, id;

-- name: UpdateFixedPayment :one
UPDATE fixed_payments SET category_id = @category_id, payment_method_id = sqlc.narg(payment_method_id), name = @name,
    amount = @amount, day_of_month = @day_of_month, start_month = @start_month, end_month = sqlc.narg(end_month),
    active = @active, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: DeactivateFixedPayment :one
UPDATE fixed_payments SET active = false, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;
```

Run `sqlc generate`.

- [ ] **Step 2: Write the failing tests** `api/internal/httpapi/recurring_test.go`

```go
package httpapi_test

import (
	"fmt"
	"testing"
)

type incomeSource struct {
	ID         int64   `json:"id"`
	CategoryID *int64  `json:"category_id"`
	Name       string  `json:"name"`
	Amount     int64   `json:"amount"`
	DayOfMonth int32   `json:"day_of_month"`
	StartMonth string  `json:"start_month"`
	EndMonth   *string `json:"end_month"`
	Active     bool    `json:"active"`
}

type fixedPayment struct {
	ID              int64   `json:"id"`
	CategoryID      int64   `json:"category_id"`
	PaymentMethodID *int64  `json:"payment_method_id"`
	Name            string  `json:"name"`
	Amount          int64   `json:"amount"`
	DayOfMonth      int32   `json:"day_of_month"`
	StartMonth      string  `json:"start_month"`
	EndMonth        *string `json:"end_month"`
	Active          bool    `json:"active"`
}

func (h *harness) income(tok string, amount int64, day int, start string) int64 {
	h.t.Helper()
	return expect[incomeSource](h.t, h.do("POST", "/api/v1/income-sources", tok, M{
		"name": "Salario", "amount": amount, "day_of_month": day, "start_month": start, "category_id": h.catID(tok, "Salario"),
	}), 201).ID
}

func (h *harness) fixed(tok, name string, amount int64, day int, start string, pm *int64) int64 {
	h.t.Helper()
	return expect[fixedPayment](h.t, h.do("POST", "/api/v1/fixed-payments", tok, M{
		"name": name, "amount": amount, "day_of_month": day, "start_month": start,
		"category_id": h.catID(tok, "Vivienda"), "payment_method_id": pm,
	}), 201).ID
}

func TestIncomeSources(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("inc@example.com")
	id := h.income(tok, 2500000, 15, "2026-01")

	l := expect[list[incomeSource]](t, h.do("GET", "/api/v1/income-sources", tok, nil), 200)
	if len(l.Items) != 1 || l.Items[0].StartMonth != "2026-01" || !l.Items[0].Active {
		t.Fatalf("list %+v", l.Items)
	}
	up := expect[incomeSource](t, h.do("PUT", fmt.Sprintf("/api/v1/income-sources/%d", id), tok, M{
		"name": "Salario", "amount": 2600000, "day_of_month": 30, "start_month": "2026-01", "end_month": "2026-12",
	}), 200)
	if up.Amount != 2600000 || up.EndMonth == nil || *up.EndMonth != "2026-12" || up.CategoryID != nil {
		t.Fatalf("update %+v", up)
	}
	off := expect[incomeSource](t, h.do("DELETE", fmt.Sprintf("/api/v1/income-sources/%d", id), tok, nil), 200)
	if off.Active {
		t.Fatal("not deactivated")
	}

	bad := []M{
		{"name": "x", "amount": 0, "day_of_month": 1, "start_month": "2026-01"},
		{"name": "x", "amount": 1, "day_of_month": 32, "start_month": "2026-01"},
		{"name": "x", "amount": 1, "day_of_month": 1},
		{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-05", "end_month": "2026-04"},
		{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": h.catID(tok, "Comida")},
	}
	for i, b := range bad {
		if r := h.do("POST", "/api/v1/income-sources", tok, b); r.Code != 422 {
			t.Errorf("bad[%d]: %d %s", i, r.Code, r.Body)
		}
	}
	if r := h.do("POST", "/api/v1/income-sources", tok, M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-1"}); r.Code != 400 {
		t.Errorf("malformed month: %d", r.Code)
	}
}

func TestFixedPayments(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("fix@example.com")
	cc := h.creditCard(tok)
	id := h.fixed(tok, "Renta", 1000000, 1, "2026-01", &cc)

	l := expect[list[fixedPayment]](t, h.do("GET", "/api/v1/fixed-payments", tok, nil), 200)
	if len(l.Items) != 1 || *l.Items[0].PaymentMethodID != cc {
		t.Fatalf("list %+v", l.Items)
	}
	if r := h.do("POST", "/api/v1/fixed-payments", tok, M{
		"name": "Luz", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": h.catID(tok, "Salario"),
	}); r.Code != 422 {
		t.Fatalf("income category accepted: %d", r.Code)
	}
	other := newHarnessUserOn(h, "other-fix@example.com")
	if r := h.do("POST", "/api/v1/fixed-payments", other, M{
		"name": "Luz", "amount": 1, "day_of_month": 1, "start_month": "2026-01",
		"category_id": h.catID(other, "Vivienda"), "payment_method_id": cc,
	}); r.Code != 422 || errCode(r) != "invalid_reference" {
		t.Fatalf("foreign card: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/fixed-payments/%d", id), other, nil); r.Code != 404 {
		t.Fatalf("foreign deactivate: %d", r.Code)
	}
}

// newHarnessUserOn signs up a second user on the same harness and returns its token.
func newHarnessUserOn(h *harness, email string) string { return h.signup(email) }
```

Run `go test ./internal/httpapi/ -run 'IncomeSources|FixedPayments'`. Expected: FAIL.

- [ ] **Step 3: Implement** `api/internal/service/recurring.go`

```go
package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

type IncomeSource struct {
	ID         int64        `json:"id"`
	CategoryID *int64       `json:"category_id"`
	Name       string       `json:"name"`
	Amount     int64        `json:"amount"`
	DayOfMonth int32        `json:"day_of_month"`
	StartMonth datex.Month  `json:"start_month"`
	EndMonth   *datex.Month `json:"end_month"`
	Active     bool         `json:"active"`
}

type IncomeSourceInput struct {
	CategoryID *int64       `json:"category_id"`
	Name       string       `json:"name"`
	Amount     int64        `json:"amount"`
	DayOfMonth int32        `json:"day_of_month"`
	StartMonth datex.Month  `json:"start_month"`
	EndMonth   *datex.Month `json:"end_month"`
	Active     *bool        `json:"active"`
}

type FixedPayment struct {
	ID              int64        `json:"id"`
	CategoryID      int64        `json:"category_id"`
	PaymentMethodID *int64       `json:"payment_method_id"`
	Name            string       `json:"name"`
	Amount          int64        `json:"amount"`
	DayOfMonth      int32        `json:"day_of_month"`
	StartMonth      datex.Month  `json:"start_month"`
	EndMonth        *datex.Month `json:"end_month"`
	Active          bool         `json:"active"`
}

type FixedPaymentInput struct {
	CategoryID      int64        `json:"category_id"`
	PaymentMethodID *int64       `json:"payment_method_id"`
	Name            string       `json:"name"`
	Amount          int64        `json:"amount"`
	DayOfMonth      int32        `json:"day_of_month"`
	StartMonth      datex.Month  `json:"start_month"`
	EndMonth        *datex.Month `json:"end_month"`
	Active          *bool        `json:"active"`
}

func toIncomeSource(r store.IncomeSource) IncomeSource {
	return IncomeSource{ID: r.ID, CategoryID: r.CategoryID, Name: r.Name, Amount: r.Amount, DayOfMonth: r.DayOfMonth,
		StartMonth: datex.NewMonth(r.StartMonth), EndMonth: datex.MonthPtr(r.EndMonth), Active: r.Active}
}

func toFixedPayment(r store.FixedPayment) FixedPayment {
	return FixedPayment{ID: r.ID, CategoryID: r.CategoryID, PaymentMethodID: r.PaymentMethodID, Name: r.Name, Amount: r.Amount,
		DayOfMonth: r.DayOfMonth, StartMonth: datex.NewMonth(r.StartMonth), EndMonth: datex.MonthPtr(r.EndMonth), Active: r.Active}
}

func checkTemplate(v *apperr.V, name *string, amount int64, day int32, start datex.Month, end *datex.Month, active **bool) {
	*name = strings.TrimSpace(*name)
	n := utf8.RuneCountInString(*name)
	v.Check(n >= 1 && n <= 80, "name", "must be 1-80 characters")
	checkAmount(v, "amount", amount)
	v.Check(day >= 1 && day <= 31, "day_of_month", "must be between 1 and 31")
	v.Check(!start.IsZero(), "start_month", "is required")
	v.Check(end == nil || !end.Before(start.Time), "end_month", "must not be before start_month")
	if *active == nil {
		t := true
		*active = &t
	}
}

func monthOrNil(m *datex.Month) *time.Time {
	if m == nil {
		return nil
	}
	t := m.Time
	return &t
}

func (s *Service) validateIncome(ctx context.Context, q *store.Queries, a Actor, in *IncomeSourceInput) error {
	var v apperr.V
	checkTemplate(&v, &in.Name, in.Amount, in.DayOfMonth, in.StartMonth, in.EndMonth, &in.Active)
	if err := v.Err(); err != nil {
		return err
	}
	if in.CategoryID != nil {
		return s.checkCategoryRef(ctx, q, a.UserID, *in.CategoryID, "income", "category_id")
	}
	return nil
}

func (s *Service) validateFixed(ctx context.Context, q *store.Queries, a Actor, in *FixedPaymentInput) error {
	var v apperr.V
	checkTemplate(&v, &in.Name, in.Amount, in.DayOfMonth, in.StartMonth, in.EndMonth, &in.Active)
	v.Check(in.CategoryID > 0, "category_id", "is required")
	if err := v.Err(); err != nil {
		return err
	}
	if err := s.checkCategoryRef(ctx, q, a.UserID, in.CategoryID, "expense", "category_id"); err != nil {
		return err
	}
	_, err := s.checkPaymentMethodRef(ctx, q, a.UserID, in.PaymentMethodID, "payment_method_id", false)
	return err
}

func (s *Service) ListIncomeSources(ctx context.Context, a Actor) ([]IncomeSource, error) {
	rows, err := s.q.ListIncomeSources(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	out := make([]IncomeSource, len(rows))
	for i, r := range rows {
		out[i] = toIncomeSource(r)
	}
	return out, nil
}

func (s *Service) CreateIncomeSource(ctx context.Context, a Actor, in IncomeSourceInput) (IncomeSource, error) {
	if err := s.validateIncome(ctx, s.q, a, &in); err != nil {
		return IncomeSource{}, err
	}
	r, err := s.q.CreateIncomeSource(ctx, store.CreateIncomeSourceParams{
		UserID: a.UserID, CategoryID: in.CategoryID, Name: in.Name, Amount: in.Amount, DayOfMonth: in.DayOfMonth,
		StartMonth: in.StartMonth.Time, EndMonth: monthOrNil(in.EndMonth), Active: *in.Active,
	})
	if err != nil {
		return IncomeSource{}, err
	}
	return toIncomeSource(r), nil
}

func (s *Service) UpdateIncomeSource(ctx context.Context, a Actor, id int64, in IncomeSourceInput) (IncomeSource, error) {
	var out IncomeSource
	err := s.inTx(ctx, func(q *store.Queries) error {
		if err := s.validateIncome(ctx, q, a, &in); err != nil {
			return err
		}
		r, err := q.UpdateIncomeSource(ctx, store.UpdateIncomeSourceParams{
			ID: id, UserID: a.UserID, CategoryID: in.CategoryID, Name: in.Name, Amount: in.Amount, DayOfMonth: in.DayOfMonth,
			StartMonth: in.StartMonth.Time, EndMonth: monthOrNil(in.EndMonth), Active: *in.Active,
		})
		if err != nil {
			return notFound(err)
		}
		out = toIncomeSource(r)
		return s.afterIncomeChange(ctx, q, a, id)
	})
	return out, err
}

func (s *Service) DeactivateIncomeSource(ctx context.Context, a Actor, id int64) (IncomeSource, error) {
	var out IncomeSource
	err := s.inTx(ctx, func(q *store.Queries) error {
		r, err := q.DeactivateIncomeSource(ctx, store.DeactivateIncomeSourceParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		out = toIncomeSource(r)
		return s.afterIncomeChange(ctx, q, a, id)
	})
	return out, err
}

func (s *Service) ListFixedPayments(ctx context.Context, a Actor) ([]FixedPayment, error) {
	rows, err := s.q.ListFixedPayments(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	out := make([]FixedPayment, len(rows))
	for i, r := range rows {
		out[i] = toFixedPayment(r)
	}
	return out, nil
}

func (s *Service) CreateFixedPayment(ctx context.Context, a Actor, in FixedPaymentInput) (FixedPayment, error) {
	if err := s.validateFixed(ctx, s.q, a, &in); err != nil {
		return FixedPayment{}, err
	}
	r, err := s.q.CreateFixedPayment(ctx, store.CreateFixedPaymentParams{
		UserID: a.UserID, CategoryID: in.CategoryID, PaymentMethodID: in.PaymentMethodID, Name: in.Name, Amount: in.Amount,
		DayOfMonth: in.DayOfMonth, StartMonth: in.StartMonth.Time, EndMonth: monthOrNil(in.EndMonth), Active: *in.Active,
	})
	if err != nil {
		return FixedPayment{}, err
	}
	return toFixedPayment(r), nil
}

func (s *Service) UpdateFixedPayment(ctx context.Context, a Actor, id int64, in FixedPaymentInput) (FixedPayment, error) {
	var out FixedPayment
	err := s.inTx(ctx, func(q *store.Queries) error {
		if err := s.validateFixed(ctx, q, a, &in); err != nil {
			return err
		}
		r, err := q.UpdateFixedPayment(ctx, store.UpdateFixedPaymentParams{
			ID: id, UserID: a.UserID, CategoryID: in.CategoryID, PaymentMethodID: in.PaymentMethodID, Name: in.Name, Amount: in.Amount,
			DayOfMonth: in.DayOfMonth, StartMonth: in.StartMonth.Time, EndMonth: monthOrNil(in.EndMonth), Active: *in.Active,
		})
		if err != nil {
			return notFound(err)
		}
		out = toFixedPayment(r)
		return s.afterFixedChange(ctx, q, a, id)
	})
	return out, err
}

func (s *Service) DeactivateFixedPayment(ctx context.Context, a Actor, id int64) (FixedPayment, error) {
	var out FixedPayment
	err := s.inTx(ctx, func(q *store.Queries) error {
		r, err := q.DeactivateFixedPayment(ctx, store.DeactivateFixedPaymentParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		out = toFixedPayment(r)
		return s.afterFixedChange(ctx, q, a, id)
	})
	return out, err
}

// afterIncomeChange / afterFixedChange propagate template edits to generated
// months. Task 9 implements them; until then they are no-ops.
func (s *Service) afterIncomeChange(ctx context.Context, q *store.Queries, a Actor, id int64) error { return nil }
func (s *Service) afterFixedChange(ctx context.Context, q *store.Queries, a Actor, id int64) error  { return nil }
```

Add `"time"` to the imports, because `monthOrNil` uses it.

- [ ] **Step 4: Handlers** `api/internal/httpapi/recurring.go`

```go
package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/service"
)

// listIncomeSources godoc
// @Summary  List recurring income sources
// @Tags     recurring
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.IncomeSource}
// @Router   /income-sources [get]
func (h *handlers) listIncomeSources(c *gin.Context) {
	list, err := h.svc.ListIncomeSources(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createIncomeSource godoc
// @Summary  Create a recurring income source
// @Tags     recurring
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.IncomeSourceInput true "income source"
// @Success  201  {object} service.IncomeSource
// @Router   /income-sources [post]
func (h *handlers) createIncomeSource(c *gin.Context) {
	var in service.IncomeSourceInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateIncomeSource(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateIncomeSource godoc
// @Summary  Replace an income source; pending, unedited rows from the current month on follow the change
// @Tags     recurring
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                       true "income source id"
// @Param    body body     service.IncomeSourceInput true "income source"
// @Success  200  {object} service.IncomeSource
// @Router   /income-sources/{id} [put]
func (h *handlers) updateIncomeSource(c *gin.Context) {
	id, ok := pathID(c)
	var in service.IncomeSourceInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateIncomeSource(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteIncomeSource godoc
// @Summary  Deactivate an income source
// @Tags     recurring
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "income source id"
// @Success  200 {object} service.IncomeSource
// @Router   /income-sources/{id} [delete]
func (h *handlers) deleteIncomeSource(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.svc.DeactivateIncomeSource(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// listFixedPayments godoc
// @Summary  List recurring fixed payments
// @Tags     recurring
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.FixedPayment}
// @Router   /fixed-payments [get]
func (h *handlers) listFixedPayments(c *gin.Context) {
	list, err := h.svc.ListFixedPayments(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createFixedPayment godoc
// @Summary  Create a recurring fixed payment
// @Tags     recurring
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.FixedPaymentInput true "fixed payment"
// @Success  201  {object} service.FixedPayment
// @Router   /fixed-payments [post]
func (h *handlers) createFixedPayment(c *gin.Context) {
	var in service.FixedPaymentInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateFixedPayment(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateFixedPayment godoc
// @Summary  Replace a fixed payment; pending, unedited rows from the current month on follow the change
// @Tags     recurring
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                       true "fixed payment id"
// @Param    body body     service.FixedPaymentInput true "fixed payment"
// @Success  200  {object} service.FixedPayment
// @Router   /fixed-payments/{id} [put]
func (h *handlers) updateFixedPayment(c *gin.Context) {
	id, ok := pathID(c)
	var in service.FixedPaymentInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateFixedPayment(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteFixedPayment godoc
// @Summary  Deactivate a fixed payment
// @Tags     recurring
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "fixed payment id"
// @Success  200 {object} service.FixedPayment
// @Router   /fixed-payments/{id} [delete]
func (h *handlers) deleteFixedPayment(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.svc.DeactivateFixedPayment(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
```

- [ ] **Step 5: Register the routes** (append in `routes`)

```go
	p.GET("/income-sources", h.listIncomeSources)
	p.POST("/income-sources", h.createIncomeSource)
	p.PUT("/income-sources/:id", h.updateIncomeSource)
	p.DELETE("/income-sources/:id", h.deleteIncomeSource)

	p.GET("/fixed-payments", h.listFixedPayments)
	p.POST("/fixed-payments", h.createFixedPayment)
	p.PUT("/fixed-payments/:id", h.updateFixedPayment)
	p.DELETE("/fixed-payments/:id", h.deleteFixedPayment)
```

- [ ] **Step 6: Run the tests.** Run `go test ./internal/...`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api && git commit -m "feat(api): recurring income sources and fixed payment templates"
```

---

### Task 9: Lazy month generation, monthly entries, template propagation

**Files:**
- Create: `api/queries/entries.sql`, `api/internal/service/entries.go`, `api/internal/httpapi/entries.go`, `api/internal/httpapi/entries_test.go`
- Modify: `api/internal/service/recurring.go` (replace the two no-op hooks), `api/internal/httpapi/router.go`

**Interfaces:**
- Produces:
  - `service.Entry{ID, Month datex.Month, Kind, IncomeSourceID, FixedPaymentID, InstallmentPlanID *int64, InstallmentNo *int32, Name, CategoryID, PaymentMethodID *int64, Amount, DueDate datex.Date, Status, SettledOn *datex.Date, Edited}`
  - `service.EntryUpdate{Amount int64; Status string; SettledOn *datex.Date; PaymentMethodID *int64}`
  - `(*Service).MonthEntries(ctx, a, month time.Time) ([]Entry, error)`, `(*Service).UpdateEntry(ctx, a, id, EntryUpdate) (Entry, error)`
  - `(*Service).ensureMonth(ctx, q *store.Queries, a Actor, month time.Time) error`. Task 12 extends it with installments. It returns `apperr.MonthOutOfRange()` for months more than 12 past the actor's current month.
  - `toEntry(store.MonthlyEntry) Entry`

- [ ] **Step 1: Queries** `api/queries/entries.sql`

```sql
-- name: EnsureIncomeEntries :exec
INSERT INTO monthly_entries (user_id, month, kind, income_source_id, name, category_id, amount, due_date)
SELECT s.user_id, @month::date, 'income', s.id, s.name, s.category_id, s.amount,
       @month::date + (LEAST(s.day_of_month, EXTRACT(DAY FROM (@month::date + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1)
FROM income_sources s
WHERE s.user_id = @user_id AND s.active
  AND s.start_month <= @month::date AND (s.end_month IS NULL OR s.end_month >= @month::date)
ON CONFLICT DO NOTHING;

-- name: EnsureFixedEntries :exec
INSERT INTO monthly_entries (user_id, month, kind, fixed_payment_id, name, category_id, payment_method_id, amount, due_date)
SELECT f.user_id, @month::date, 'fixed', f.id, f.name, f.category_id, f.payment_method_id, f.amount,
       @month::date + (LEAST(f.day_of_month, EXTRACT(DAY FROM (@month::date + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1)
FROM fixed_payments f
WHERE f.user_id = @user_id AND f.active
  AND f.start_month <= @month::date AND (f.end_month IS NULL OR f.end_month >= @month::date)
ON CONFLICT DO NOTHING;

-- name: ListMonthEntries :many
SELECT * FROM monthly_entries
WHERE user_id = @user_id AND month = @month
ORDER BY CASE kind WHEN 'income' THEN 0 WHEN 'fixed' THEN 1 ELSE 2 END, due_date, id;

-- name: GetEntry :one
SELECT * FROM monthly_entries WHERE id = @id AND user_id = @user_id;

-- name: UpdateEntry :one
UPDATE monthly_entries SET amount = @amount, status = @status, settled_on = sqlc.narg(settled_on),
    payment_method_id = sqlc.narg(payment_method_id), edited = @edited, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: PropagateIncomeSource :exec
UPDATE monthly_entries m SET name = s.name, amount = s.amount, category_id = s.category_id,
    due_date = m.month + (LEAST(s.day_of_month, EXTRACT(DAY FROM (m.month + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1),
    updated_at = now()
FROM income_sources s
WHERE s.id = @source_id AND m.income_source_id = s.id
  AND m.month >= @from_month::date AND m.status = 'pending' AND NOT m.edited;

-- name: PruneIncomeEntries :exec
DELETE FROM monthly_entries m
USING income_sources s
WHERE s.id = @source_id AND m.income_source_id = s.id
  AND m.status = 'pending' AND NOT m.edited AND m.month >= @from_month::date
  AND ((NOT s.active AND m.month > @from_month::date)
       OR (s.end_month IS NOT NULL AND m.month > s.end_month)
       OR m.month < s.start_month);

-- name: PropagateFixedPayment :exec
UPDATE monthly_entries m SET name = f.name, amount = f.amount, category_id = f.category_id,
    payment_method_id = f.payment_method_id,
    due_date = m.month + (LEAST(f.day_of_month, EXTRACT(DAY FROM (m.month + INTERVAL '1 month' - INTERVAL '1 day'))::int) - 1),
    updated_at = now()
FROM fixed_payments f
WHERE f.id = @source_id AND m.fixed_payment_id = f.id
  AND m.month >= @from_month::date AND m.status = 'pending' AND NOT m.edited;

-- name: PruneFixedEntries :exec
DELETE FROM monthly_entries m
USING fixed_payments f
WHERE f.id = @source_id AND m.fixed_payment_id = f.id
  AND m.status = 'pending' AND NOT m.edited AND m.month >= @from_month::date
  AND ((NOT f.active AND m.month > @from_month::date)
       OR (f.end_month IS NOT NULL AND m.month > f.end_month)
       OR m.month < f.start_month);
```

Run `sqlc generate`.

- [ ] **Step 2: Write the failing tests** `api/internal/httpapi/entries_test.go`

```go
package httpapi_test

import (
	"fmt"
	"sync"
	"testing"
)

type entry struct {
	ID              int64   `json:"id"`
	Month           string  `json:"month"`
	Kind            string  `json:"kind"`
	Name            string  `json:"name"`
	Amount          int64   `json:"amount"`
	DueDate         string  `json:"due_date"`
	Status          string  `json:"status"`
	SettledOn       *string `json:"settled_on"`
	PaymentMethodID *int64  `json:"payment_method_id"`
	InstallmentNo   *int32  `json:"installment_no"`
	Edited          bool    `json:"edited"`
}

func (h *harness) entries(tok, month string) []entry {
	h.t.Helper()
	return expect[list[entry]](h.t, h.do("GET", "/api/v1/months/"+month+"/entries", tok, nil), 200).Items
}

func byKind(es []entry, kind string) []entry {
	var out []entry
	for _, e := range es {
		if e.Kind == kind {
			out = append(out, e)
		}
	}
	return out
}

func TestEnsureMonthGeneratesFromTemplates(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("gen@example.com")
	h.income(tok, 2000000, 15, "2026-01")
	h.fixed(tok, "Renta", 1000000, 1, "2026-03", nil)

	mar := h.entries(tok, "2026-03")
	if len(mar) != 2 || mar[0].Kind != "income" || mar[0].DueDate != "2026-03-15" || mar[1].DueDate != "2026-03-01" || mar[1].Status != "pending" {
		t.Fatalf("march %+v", mar)
	}
	if feb := h.entries(tok, "2026-02"); len(feb) != 1 || feb[0].Kind != "income" {
		t.Fatalf("feb %+v", feb)
	}
	if again := h.entries(tok, "2026-03"); len(again) != 2 {
		t.Fatalf("not idempotent: %d", len(again))
	}
	if r := h.do("GET", "/api/v1/months/2026-3/entries", tok, nil); r.Code != 400 {
		t.Fatalf("bad month: %d", r.Code)
	}
}

func TestEnsureMonthClampsDay31(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("clamp@example.com")
	h.fixed(tok, "Seguro", 50000, 31, "2026-01", nil)
	for month, want := range map[string]string{"2026-02": "2026-02-28", "2026-04": "2026-04-30", "2026-05": "2026-05-31", "2027-03": "2027-03-31"} {
		es := h.entries(tok, month)
		if len(es) != 1 || es[0].DueDate != want {
			t.Errorf("%s: %+v, want due %s", month, es, want)
		}
	}
	if r := h.do("GET", "/api/v1/months/2027-04/entries", tok, nil); r.Code != 422 || errCode(r) != "month_out_of_range" {
		t.Fatalf("13 months ahead: %d %s", r.Code, r.Body)
	}
}

func TestEnsureMonthConcurrent(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("race@example.com")
	h.income(tok, 2000000, 15, "2026-01")
	h.fixed(tok, "Renta", 1000000, 1, "2026-01", nil)
	var wg sync.WaitGroup
	codes := make([]int, 12)
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i] = h.do("GET", "/api/v1/months/2026-06/entries", tok, nil).Code
		}(i)
	}
	wg.Wait()
	for i, c := range codes {
		if c != 200 {
			t.Fatalf("request %d: status %d", i, c)
		}
	}
	if n := len(h.entries(tok, "2026-06")); n != 2 {
		t.Fatalf("rows = %d, want 2", n)
	}
}

func TestUpdateEntry(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("upd@example.com")
	cc := h.creditCard(tok)
	h.income(tok, 2000000, 15, "2026-01")
	h.fixed(tok, "Renta", 1000000, 1, "2026-01", nil)
	es := h.entries(tok, "2026-03")
	inc, rent := byKind(es, "income")[0], byKind(es, "fixed")[0]

	paid := expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), tok, M{"amount": 1000000, "status": "paid"}), 200)
	if paid.SettledOn == nil || *paid.SettledOn != "2026-03-15" || paid.Edited {
		t.Fatalf("paid %+v", paid)
	}
	if r := h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), tok, M{"amount": 1000000, "status": "received"}); r.Code != 422 {
		t.Fatalf("received on fixed: %d", r.Code)
	}
	moved := expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), tok, M{"amount": 1100000, "status": "pending", "payment_method_id": cc}), 200)
	if !moved.Edited || moved.SettledOn != nil || *moved.PaymentMethodID != cc {
		t.Fatalf("moved %+v", moved)
	}
	got := expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", inc.ID), tok, M{"amount": 2000000, "status": "received", "settled_on": "2026-03-14"}), 200)
	if *got.SettledOn != "2026-03-14" {
		t.Fatalf("income %+v", got)
	}
	if r := h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", inc.ID), tok, M{"amount": 2000000, "status": "received", "payment_method_id": cc}); r.Code != 422 {
		t.Fatalf("pm on income: %d", r.Code)
	}
	other := h.signup("upd2@example.com")
	if r := h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), other, M{"amount": 1, "status": "paid"}); r.Code != 404 {
		t.Fatalf("foreign entry: %d", r.Code)
	}
}

func TestTemplateEditPropagation(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("prop@example.com")
	id := h.fixed(tok, "Renta", 1000000, 1, "2026-01", nil)
	for _, m := range []string{"2026-02", "2026-03", "2026-04", "2026-05", "2026-06"} {
		h.entries(tok, m)
	}
	may := byKind(h.entries(tok, "2026-05"), "fixed")[0]
	expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", may.ID), tok, M{"amount": 1200000, "status": "pending"}), 200)

	body := M{"name": "Renta depa", "amount": 1500000, "day_of_month": 5, "start_month": "2026-01", "category_id": h.catID(tok, "Vivienda")}
	expect[fixedPayment](t, h.do("PUT", fmt.Sprintf("/api/v1/fixed-payments/%d", id), tok, body), 200)

	check := func(month string, amount int64, due string) {
		t.Helper()
		e := byKind(h.entries(tok, month), "fixed")
		if len(e) != 1 || e[0].Amount != amount || e[0].DueDate != due {
			t.Errorf("%s: %+v, want %d due %s", month, e, amount, due)
		}
	}
	check("2026-02", 1000000, "2026-02-01") // past: frozen
	check("2026-03", 1500000, "2026-03-05") // current pending: follows
	check("2026-04", 1500000, "2026-04-05")
	check("2026-05", 1200000, "2026-05-01") // edited: kept

	body["end_month"] = "2026-04"
	expect[fixedPayment](t, h.do("PUT", fmt.Sprintf("/api/v1/fixed-payments/%d", id), tok, body), 200)
	if e := byKind(h.entries(tok, "2026-06"), "fixed"); len(e) != 0 {
		t.Fatalf("june not pruned: %+v", e)
	}
	check("2026-05", 1200000, "2026-05-01") // edited rows survive end_month

	expect[fixedPayment](t, h.do("DELETE", fmt.Sprintf("/api/v1/fixed-payments/%d", id), tok, nil), 200)
	check("2026-03", 1500000, "2026-03-05") // current month row stays after deactivation
	if e := byKind(h.entries(tok, "2026-04"), "fixed"); len(e) != 0 {
		t.Fatalf("april not pruned after deactivate: %+v", e)
	}
}
```

Run `go test ./internal/httpapi/ -run 'EnsureMonth|UpdateEntry|Propagation'`. Expected: FAIL.

- [ ] **Step 3: Implement** `api/internal/service/entries.go`

```go
package service

import (
	"context"
	"time"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

const maxMonthsAhead = 12

type Entry struct {
	ID                int64       `json:"id"`
	Month             datex.Month `json:"month"`
	Kind              string      `json:"kind"`
	IncomeSourceID    *int64      `json:"income_source_id"`
	FixedPaymentID    *int64      `json:"fixed_payment_id"`
	InstallmentPlanID *int64      `json:"installment_plan_id"`
	InstallmentNo     *int32      `json:"installment_no"`
	Name              string      `json:"name"`
	CategoryID        *int64      `json:"category_id"`
	PaymentMethodID   *int64      `json:"payment_method_id"`
	Amount            int64       `json:"amount"`
	DueDate           datex.Date  `json:"due_date"`
	Status            string      `json:"status"`
	SettledOn         *datex.Date `json:"settled_on"`
	Edited            bool        `json:"edited"`
}

type EntryUpdate struct {
	Amount          int64       `json:"amount"`
	Status          string      `json:"status"`
	SettledOn       *datex.Date `json:"settled_on"`
	PaymentMethodID *int64      `json:"payment_method_id"`
}

func toEntry(e store.MonthlyEntry) Entry {
	return Entry{
		ID: e.ID, Month: datex.NewMonth(e.Month), Kind: e.Kind, IncomeSourceID: e.IncomeSourceID, FixedPaymentID: e.FixedPaymentID,
		InstallmentPlanID: e.InstallmentPlanID, InstallmentNo: e.InstallmentNo, Name: e.Name, CategoryID: e.CategoryID,
		PaymentMethodID: e.PaymentMethodID, Amount: e.Amount, DueDate: datex.NewDate(e.DueDate), Status: e.Status,
		SettledOn: datex.DatePtr(e.SettledOn), Edited: e.Edited,
	}
}

// ensureMonth materializes the month's income and fixed rows from active
// templates. It is idempotent and safe under concurrency (ON CONFLICT DO NOTHING).
func (s *Service) ensureMonth(ctx context.Context, q *store.Queries, a Actor, month time.Time) error {
	month = datex.MonthStart(month)
	if datex.MonthsBetween(datex.MonthStart(s.today(a)), month) > maxMonthsAhead {
		return apperr.MonthOutOfRange()
	}
	if err := q.EnsureIncomeEntries(ctx, store.EnsureIncomeEntriesParams{UserID: a.UserID, Month: month}); err != nil {
		return err
	}
	return q.EnsureFixedEntries(ctx, store.EnsureFixedEntriesParams{UserID: a.UserID, Month: month})
}

func (s *Service) MonthEntries(ctx context.Context, a Actor, month time.Time) ([]Entry, error) {
	month = datex.MonthStart(month)
	if err := s.ensureMonth(ctx, s.q, a, month); err != nil {
		return nil, err
	}
	rows, err := s.q.ListMonthEntries(ctx, store.ListMonthEntriesParams{UserID: a.UserID, Month: month})
	if err != nil {
		return nil, err
	}
	out := make([]Entry, len(rows))
	for i, r := range rows {
		out[i] = toEntry(r)
	}
	return out, nil
}

func (s *Service) UpdateEntry(ctx context.Context, a Actor, id int64, in EntryUpdate) (Entry, error) {
	var out Entry
	err := s.inTx(ctx, func(q *store.Queries) error {
		e, err := q.GetEntry(ctx, store.GetEntryParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		var v apperr.V
		checkAmount(&v, "amount", in.Amount)
		if e.Kind == "income" {
			v.Check(in.Status == "pending" || in.Status == "received" || in.Status == "skipped", "status", "must be pending, received or skipped")
			v.Check(in.PaymentMethodID == nil, "payment_method_id", "is not allowed on income")
		} else {
			v.Check(in.Status == "pending" || in.Status == "paid" || in.Status == "skipped", "status", "must be pending, paid or skipped")
		}
		if e.Kind == "installment" {
			v.Check(in.Amount == e.Amount, "amount", "installment amounts are set by the plan")
			v.Check(eqPtr(in.PaymentMethodID, e.PaymentMethodID), "payment_method_id", "installments stay on the plan's card")
		}
		if err := v.Err(); err != nil {
			return err
		}
		if _, err := s.checkPaymentMethodRef(ctx, q, a.UserID, in.PaymentMethodID, "payment_method_id", false); err != nil {
			return err
		}
		var settled *time.Time
		if in.Status == "paid" || in.Status == "received" {
			d := s.today(a)
			if in.SettledOn != nil {
				d = in.SettledOn.Time
			}
			settled = &d
		}
		edited := e.Edited || in.Amount != e.Amount || !eqPtr(in.PaymentMethodID, e.PaymentMethodID)
		u, err := q.UpdateEntry(ctx, store.UpdateEntryParams{
			ID: id, UserID: a.UserID, Amount: in.Amount, Status: in.Status, SettledOn: settled,
			PaymentMethodID: in.PaymentMethodID, Edited: edited,
		})
		if err != nil {
			return err
		}
		out = toEntry(u)
		return nil
	})
	return out, err
}
```

- [ ] **Step 4: Replace the no-op hooks** in `recurring.go`

```go
// afterIncomeChange pushes template edits into this and future months' pending,
// unedited rows and drops rows that fall outside the template's range.
func (s *Service) afterIncomeChange(ctx context.Context, q *store.Queries, a Actor, id int64) error {
	from := datex.MonthStart(s.today(a))
	if err := q.PropagateIncomeSource(ctx, store.PropagateIncomeSourceParams{SourceID: id, FromMonth: from}); err != nil {
		return err
	}
	return q.PruneIncomeEntries(ctx, store.PruneIncomeEntriesParams{SourceID: id, FromMonth: from})
}

func (s *Service) afterFixedChange(ctx context.Context, q *store.Queries, a Actor, id int64) error {
	from := datex.MonthStart(s.today(a))
	if err := q.PropagateFixedPayment(ctx, store.PropagateFixedPaymentParams{SourceID: id, FromMonth: from}); err != nil {
		return err
	}
	return q.PruneFixedEntries(ctx, store.PruneFixedEntriesParams{SourceID: id, FromMonth: from})
}
```

- [ ] **Step 5: Handlers** `api/internal/httpapi/entries.go`

```go
package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/service"
)

// monthEntries godoc
// @Summary  Income, fixed and installment rows for a month (generated on first read)
// @Tags     months
// @Produce  json
// @Security BearerAuth
// @Param    month path string true "YYYY-MM"
// @Success  200 {object} object{items=[]service.Entry}
// @Failure  422 {object} ErrorResponse
// @Router   /months/{month}/entries [get]
func (h *handlers) monthEntries(c *gin.Context) {
	m, err := datex.ParseMonth(c.Param("month"))
	if err != nil {
		fail(c, apperr.BadRequest(err.Error()))
		return
	}
	list, err := h.svc.MonthEntries(c.Request.Context(), actorOf(c), m)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// updateEntry godoc
// @Summary  Update one month's row (amount, status, settled_on, payment method)
// @Tags     months
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                 true "entry id"
// @Param    body body     service.EntryUpdate true "changes"
// @Success  200  {object} service.Entry
// @Router   /entries/{id} [put]
func (h *handlers) updateEntry(c *gin.Context) {
	id, ok := pathID(c)
	var in service.EntryUpdate
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateEntry(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
```

- [ ] **Step 6: Register the routes** (append in `routes`)

```go
	p.GET("/months/:month/entries", h.monthEntries)
	p.PUT("/entries/:id", h.updateEntry)
```

- [ ] **Step 7: Run the tests.** Run `go test ./internal/...`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api && git commit -m "feat(api): lazy idempotent month generation, entry updates, template propagation"
```

---

### Task 10: Expenses

**Files:**
- Create: `api/queries/expenses.sql`, `api/internal/service/expenses.go`, `api/internal/httpapi/expenses.go`, `api/internal/httpapi/expenses_test.go`
- Modify: `api/internal/httpapi/router.go`

**Interfaces:**
- Produces:
  - `service.Expense{ID, CategoryID, PaymentMethodID *int64, Amount, Description, SpentOn datex.Date, CreatedAt time.Time}`, `service.ExpenseInput{CategoryID, PaymentMethodID, Amount, Description, SpentOn}`
  - `service.ExpenseFilter{From, To *time.Time; CategoryID, PaymentMethodID *int64; Q, Cursor string; Limit int}`, `service.ExpensePage{Items []Expense; NextCursor *string}`
  - `ListExpenses`, `CreateExpense`, `UpdateExpense`, `DeleteExpense`

- [ ] **Step 1: Queries** `api/queries/expenses.sql`

```sql
-- name: CreateExpense :one
INSERT INTO expenses (user_id, category_id, payment_method_id, amount, description, spent_on)
VALUES (@user_id, @category_id, sqlc.narg(payment_method_id), @amount, @description, @spent_on)
RETURNING *;

-- name: UpdateExpense :one
UPDATE expenses SET category_id = @category_id, payment_method_id = sqlc.narg(payment_method_id), amount = @amount,
    description = @description, spent_on = @spent_on, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: DeleteExpense :execrows
DELETE FROM expenses WHERE id = @id AND user_id = @user_id;

-- name: ListExpenses :many
SELECT * FROM expenses
WHERE user_id = @user_id
  AND (sqlc.narg(from_date)::date IS NULL OR spent_on >= sqlc.narg(from_date)::date)
  AND (sqlc.narg(to_date)::date IS NULL OR spent_on <= sqlc.narg(to_date)::date)
  AND (sqlc.narg(category_id)::bigint IS NULL OR category_id = sqlc.narg(category_id)::bigint)
  AND (sqlc.narg(payment_method_id)::bigint IS NULL OR payment_method_id = sqlc.narg(payment_method_id)::bigint)
  AND (sqlc.narg(q)::text IS NULL OR description ILIKE '%' || sqlc.narg(q)::text || '%')
  AND (sqlc.narg(cursor_date)::date IS NULL OR (spent_on, id) < (sqlc.narg(cursor_date)::date, sqlc.narg(cursor_id)::bigint))
ORDER BY spent_on DESC, id DESC
LIMIT @lim;
```

Run `sqlc generate`. The `Lim` param type is `int32`.

- [ ] **Step 2: Write the failing tests** `api/internal/httpapi/expenses_test.go`

```go
package httpapi_test

import (
	"fmt"
	"net/url"
	"testing"
)

type expense struct {
	ID              int64  `json:"id"`
	CategoryID      int64  `json:"category_id"`
	PaymentMethodID *int64 `json:"payment_method_id"`
	Amount          int64  `json:"amount"`
	Description     string `json:"description"`
	SpentOn         string `json:"spent_on"`
}

type expensePage struct {
	Items      []expense `json:"items"`
	NextCursor *string   `json:"next_cursor"`
}

func (h *harness) expense(tok, cat string, amount int64, on, desc string, pm *int64) int64 {
	h.t.Helper()
	return expect[expense](h.t, h.do("POST", "/api/v1/expenses", tok, M{
		"category_id": h.catID(tok, cat), "amount": amount, "spent_on": on, "description": desc, "payment_method_id": pm,
	}), 201).ID
}

func TestExpensesCRUDAndFilters(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("exp@example.com")
	cc := h.creditCard(tok)
	h.expense(tok, "Comida", 15000, "2026-03-01", "Tacos", nil)
	h.expense(tok, "Comida", 25000, "2026-03-02", "Súper 100% orgánico", &cc)
	id := h.expense(tok, "Transporte", 5000, "2026-03-02", "Uber", &cc)
	h.expense(tok, "Salud", 90000, "2026-02-20", "Dentista", nil)
	h.expense(tok, "Comida", 12000, "2026-03-10", "tacos al pastor", nil)

	page := func(q string) expensePage {
		t.Helper()
		return expect[expensePage](t, h.do("GET", "/api/v1/expenses?"+q, tok, nil), 200)
	}
	if p := page("from=2026-03-01&to=2026-03-31"); len(p.Items) != 4 || p.Items[0].SpentOn != "2026-03-10" {
		t.Fatalf("march %+v", p.Items)
	}
	if p := page(fmt.Sprintf("payment_method_id=%d", cc)); len(p.Items) != 2 {
		t.Fatalf("by card %d", len(p.Items))
	}
	if p := page("q=TACOS"); len(p.Items) != 2 {
		t.Fatalf("search %d", len(p.Items))
	}
	if p := page("q=" + url.QueryEscape("100%")); len(p.Items) != 1 {
		t.Fatalf("literal percent %d", len(p.Items))
	}

	var seen []int64
	cursor := ""
	for i := 0; i < 5; i++ {
		p := page("limit=2" + cursor)
		for _, e := range p.Items {
			seen = append(seen, e.ID)
		}
		if p.NextCursor == nil {
			break
		}
		cursor = "&cursor=" + url.QueryEscape(*p.NextCursor)
	}
	if len(seen) != 5 {
		t.Fatalf("paging saw %d, want 5 (%v)", len(seen), seen)
	}
	if r := h.do("GET", "/api/v1/expenses?cursor=bm9wZQ", tok, nil); r.Code != 400 {
		t.Fatalf("bad cursor: %d", r.Code)
	}

	up := expect[expense](t, h.do("PUT", fmt.Sprintf("/api/v1/expenses/%d", id), tok, M{
		"category_id": h.catID(tok, "Transporte"), "amount": 7000, "spent_on": "2026-03-03", "description": "Uber", "payment_method_id": nil,
	}), 200)
	if up.Amount != 7000 || up.PaymentMethodID != nil {
		t.Fatalf("update %+v", up)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/expenses/%d", id), tok, nil); r.Code != 204 {
		t.Fatalf("delete %d", r.Code)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/expenses/%d", id), tok, nil); r.Code != 404 {
		t.Fatalf("delete twice %d", r.Code)
	}
}

func TestExpenseValidation(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("expv@example.com")
	bad := []M{
		{"category_id": h.catID(tok, "Comida"), "amount": 0, "spent_on": "2026-03-01"},
		{"category_id": h.catID(tok, "Comida"), "amount": 100},
		{"category_id": h.catID(tok, "Salario"), "amount": 100, "spent_on": "2026-03-01"},
	}
	for i, b := range bad {
		if r := h.do("POST", "/api/v1/expenses", tok, b); r.Code != 422 {
			t.Errorf("bad[%d]: %d %s", i, r.Code, r.Body)
		}
	}
}

func TestExpenseRejectsForeignReferences(t *testing.T) {
	h := newHarness(t)
	a := h.signup("owner@example.com")
	b := h.signup("intruder@example.com")
	aCard := h.creditCard(a)
	aFood := h.catID(a, "Comida")

	r := h.do("POST", "/api/v1/expenses", b, M{"category_id": aFood, "amount": 100, "spent_on": "2026-03-01"})
	if r.Code != 422 || errCode(r) != "invalid_reference" || errFields(r)["category_id"] == "" {
		t.Fatalf("foreign category: %d %s", r.Code, r.Body)
	}
	r = h.do("POST", "/api/v1/expenses", b, M{"category_id": h.catID(b, "Comida"), "amount": 100, "spent_on": "2026-03-01", "payment_method_id": aCard})
	if r.Code != 422 || errCode(r) != "invalid_reference" || errFields(r)["payment_method_id"] == "" {
		t.Fatalf("foreign card: %d %s", r.Code, r.Body)
	}
	id := h.expense(a, "Comida", 100, "2026-03-01", "", nil)
	if r := h.do("PUT", fmt.Sprintf("/api/v1/expenses/%d", id), b, M{"category_id": h.catID(b, "Comida"), "amount": 1, "spent_on": "2026-03-01"}); r.Code != 404 {
		t.Fatalf("foreign update: %d", r.Code)
	}
}
```

Run `go test ./internal/httpapi/ -run Expense`. Expected: FAIL.

- [ ] **Step 3: Implement** `api/internal/service/expenses.go`

```go
package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

type Expense struct {
	ID              int64      `json:"id"`
	CategoryID      int64      `json:"category_id"`
	PaymentMethodID *int64     `json:"payment_method_id"`
	Amount          int64      `json:"amount"`
	Description     string     `json:"description"`
	SpentOn         datex.Date `json:"spent_on"`
	CreatedAt       time.Time  `json:"created_at"`
}

type ExpenseInput struct {
	CategoryID      int64      `json:"category_id"`
	PaymentMethodID *int64     `json:"payment_method_id"`
	Amount          int64      `json:"amount"`
	Description     string     `json:"description"`
	SpentOn         datex.Date `json:"spent_on"`
}

type ExpenseFilter struct {
	From, To                    *time.Time
	CategoryID, PaymentMethodID *int64
	Q, Cursor                   string
	Limit                       int
}

type ExpensePage struct {
	Items      []Expense `json:"items"`
	NextCursor *string   `json:"next_cursor"`
}

func toExpense(e store.Expense) Expense {
	return Expense{ID: e.ID, CategoryID: e.CategoryID, PaymentMethodID: e.PaymentMethodID, Amount: e.Amount,
		Description: e.Description, SpentOn: datex.NewDate(e.SpentOn), CreatedAt: e.CreatedAt}
}

func (s *Service) validateExpense(ctx context.Context, q *store.Queries, a Actor, in *ExpenseInput) error {
	in.Description = strings.TrimSpace(in.Description)
	var v apperr.V
	checkAmount(&v, "amount", in.Amount)
	v.Check(utf8.RuneCountInString(in.Description) <= 200, "description", "must be at most 200 characters")
	v.Check(!in.SpentOn.IsZero(), "spent_on", "is required")
	v.Check(in.CategoryID > 0, "category_id", "is required")
	if err := v.Err(); err != nil {
		return err
	}
	if err := s.checkCategoryRef(ctx, q, a.UserID, in.CategoryID, "expense", "category_id"); err != nil {
		return err
	}
	_, err := s.checkPaymentMethodRef(ctx, q, a.UserID, in.PaymentMethodID, "payment_method_id", false)
	return err
}

func (s *Service) CreateExpense(ctx context.Context, a Actor, in ExpenseInput) (Expense, error) {
	if err := s.validateExpense(ctx, s.q, a, &in); err != nil {
		return Expense{}, err
	}
	e, err := s.q.CreateExpense(ctx, store.CreateExpenseParams{UserID: a.UserID, CategoryID: in.CategoryID,
		PaymentMethodID: in.PaymentMethodID, Amount: in.Amount, Description: in.Description, SpentOn: in.SpentOn.Time})
	if err != nil {
		return Expense{}, err
	}
	return toExpense(e), nil
}

func (s *Service) UpdateExpense(ctx context.Context, a Actor, id int64, in ExpenseInput) (Expense, error) {
	if err := s.validateExpense(ctx, s.q, a, &in); err != nil {
		return Expense{}, err
	}
	e, err := s.q.UpdateExpense(ctx, store.UpdateExpenseParams{ID: id, UserID: a.UserID, CategoryID: in.CategoryID,
		PaymentMethodID: in.PaymentMethodID, Amount: in.Amount, Description: in.Description, SpentOn: in.SpentOn.Time})
	if err != nil {
		return Expense{}, notFound(err)
	}
	return toExpense(e), nil
}

func (s *Service) DeleteExpense(ctx context.Context, a Actor, id int64) error {
	n, err := s.q.DeleteExpense(ctx, store.DeleteExpenseParams{ID: id, UserID: a.UserID})
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound()
	}
	return nil
}

func encodeCursor(e store.Expense) string {
	return base64.RawURLEncoding.EncodeToString([]byte(e.SpentOn.Format(time.DateOnly) + "|" + strconv.FormatInt(e.ID, 10)))
}

func decodeCursor(c string) (*time.Time, *int64, error) {
	b, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return nil, nil, err
	}
	date, idStr, ok := strings.Cut(string(b), "|")
	if !ok {
		return nil, nil, fmt.Errorf("bad cursor")
	}
	d, err := datex.ParseDate(date)
	if err != nil {
		return nil, nil, err
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return nil, nil, err
	}
	return &d, &id, nil
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func (s *Service) ListExpenses(ctx context.Context, a Actor, f ExpenseFilter) (ExpensePage, error) {
	if f.Limit <= 0 {
		f.Limit = 50
	}
	f.Limit = min(f.Limit, 200)
	p := store.ListExpensesParams{UserID: a.UserID, FromDate: f.From, ToDate: f.To, CategoryID: f.CategoryID,
		PaymentMethodID: f.PaymentMethodID, Lim: int32(f.Limit + 1)}
	if q := strings.TrimSpace(f.Q); q != "" {
		esc := likeEscaper.Replace(q)
		p.Q = &esc
	}
	if f.Cursor != "" {
		d, id, err := decodeCursor(f.Cursor)
		if err != nil {
			return ExpensePage{}, apperr.BadRequest("invalid cursor")
		}
		p.CursorDate, p.CursorID = d, id
	}
	rows, err := s.q.ListExpenses(ctx, p)
	if err != nil {
		return ExpensePage{}, err
	}
	page := ExpensePage{Items: []Expense{}}
	for i, r := range rows {
		if i == f.Limit {
			c := encodeCursor(rows[i-1])
			page.NextCursor = &c
			break
		}
		page.Items = append(page.Items, toExpense(r))
	}
	return page, nil
}
```

- [ ] **Step 4: Handlers** `api/internal/httpapi/expenses.go`

```go
package httpapi

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/service"
)

// listExpenses godoc
// @Summary  List expenses, newest first, cursor-paginated
// @Tags     expenses
// @Produce  json
// @Security BearerAuth
// @Param    from              query string false "YYYY-MM-DD"
// @Param    to                query string false "YYYY-MM-DD"
// @Param    category_id       query int    false "category"
// @Param    payment_method_id query int    false "payment method"
// @Param    q                 query string false "search in description"
// @Param    cursor            query string false "next_cursor from the previous page"
// @Param    limit             query int    false "1-200, default 50"
// @Success  200 {object} service.ExpensePage
// @Router   /expenses [get]
func (h *handlers) listExpenses(c *gin.Context) {
	var f service.ExpenseFilter
	var ok bool
	if f.From, ok = queryDate(c, "from"); !ok {
		return
	}
	if f.To, ok = queryDate(c, "to"); !ok {
		return
	}
	if f.CategoryID, ok = queryInt64(c, "category_id"); !ok {
		return
	}
	if f.PaymentMethodID, ok = queryInt64(c, "payment_method_id"); !ok {
		return
	}
	f.Q, f.Cursor = c.Query("q"), c.Query("cursor")
	if l := c.Query("limit"); l != "" {
		n, err := strconv.Atoi(l)
		if err != nil {
			fail(c, apperr.BadRequest("limit: must be an integer"))
			return
		}
		f.Limit = n
	}
	page, err := h.svc.ListExpenses(c.Request.Context(), actorOf(c), f)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, page)
}

// createExpense godoc
// @Summary  Record an expense
// @Tags     expenses
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.ExpenseInput true "expense"
// @Success  201  {object} service.Expense
// @Failure  422  {object} ErrorResponse
// @Router   /expenses [post]
func (h *handlers) createExpense(c *gin.Context) {
	var in service.ExpenseInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateExpense(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateExpense godoc
// @Summary  Replace an expense
// @Tags     expenses
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                  true "expense id"
// @Param    body body     service.ExpenseInput true "expense"
// @Success  200  {object} service.Expense
// @Router   /expenses/{id} [put]
func (h *handlers) updateExpense(c *gin.Context) {
	id, ok := pathID(c)
	var in service.ExpenseInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateExpense(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteExpense godoc
// @Summary  Delete an expense
// @Tags     expenses
// @Security BearerAuth
// @Param    id path int true "expense id"
// @Success  204
// @Router   /expenses/{id} [delete]
func (h *handlers) deleteExpense(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteExpense(c.Request.Context(), actorOf(c), id); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 5: Register the routes** (append in `routes`)

```go
	p.GET("/expenses", h.listExpenses)
	p.POST("/expenses", h.createExpense)
	p.PUT("/expenses/:id", h.updateExpense)
	p.DELETE("/expenses/:id", h.deleteExpense)
```

- [ ] **Step 6: Run the tests.** Run `go test ./internal/...`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api && git commit -m "feat(api): expenses with filters, search and cursor pagination"
```

---
### Task 11: `cards` package (statement cycles, due dates, MSI, balances)

**Files:**
- Create: `api/internal/cards/cards.go`, `api/internal/cards/cards_test.go`

**Interfaces:**
- Consumes: `datex.Clamp`, `datex.MonthStart`, `datex.AddMonths`, `datex.MonthsBetween`
- Produces (all pure; dates are UTC-midnight `time.Time`; `cycle` is the first day of the cycle's month):
  - `CycleClose(cycle time.Time, statementDay int) time.Time`, `CycleOpen(cycle, statementDay) time.Time`, `CycleFor(d time.Time, statementDay int) time.Time`
  - `DueDate(closeDate time.Time, dueDay int) time.Time`, `RelevantCycle(today time.Time, statementDay, dueDay int) time.Time`
  - `Installments(total int64, n int) []int64`
  - `type Plan struct{ ID int64; Total int64; N int; PurchasedOn time.Time; CancelledOn *time.Time }`
  - `InstallmentCycle(p Plan, statementDay, k int) time.Time`, `InstallmentIn(p Plan, statementDay int, cycle time.Time) int`, `Billed(p Plan, statementDay int, asOf time.Time) (count int, amount int64)`, `Debt(p Plan, statementDay int) int64`
  - `type Movement struct{ Date time.Time; Amount int64 }`, `type Card struct{ StatementDay, DueDay int; OpeningBalance int64; OpeningDate time.Time }`
  - `type Result struct{ Cycle, Opens, Closes, Due time.Time; BilledBalance, AmountDue, CurrentBalance int64 }`
  - `Compute(c Card, charges, payments []Movement, plans []Plan, cycle time.Time) Result`

**Rules (from spec §5.4–5.5):**
- A cycle closes on `statementDay`, clamped to the month's length. The close day belongs to the closing cycle.
- The due date is the first `dueDay` (clamped) strictly after the close date.
- Installment 1 of a plan is billed in the cycle containing `purchased_on`.
- Charges and payments dated before `OpeningDate` are ignored. Plans always count; users set `opening_balance` excluding MSI plans they register.
- `CurrentBalance = opening + all charges + Σ Debt(plan) − all payments`.
- `BilledBalance = opening + charges ≤ close + Σ billed installments ≤ close − payments ≤ close`.
- `AmountDue = max(0, BilledBalance − payments in (close, due])`.

- [ ] **Step 1: Write the failing tests** `api/internal/cards/cards_test.go`

```go
package cards

import (
	"slices"
	"testing"
	"time"

	"financego/internal/datex"
)

func d(s string) time.Time {
	t, err := datex.ParseDate(s)
	if err != nil {
		panic(err)
	}
	return t
}

func ds(t time.Time) string { return t.Format(time.DateOnly) }

func TestCycles(t *testing.T) {
	if got := CycleClose(d("2026-02-01"), 31); ds(got) != "2026-02-28" {
		t.Errorf("close feb/31 = %s", ds(got))
	}
	if got := CycleOpen(d("2026-03-01"), 31); ds(got) != "2026-03-01" {
		t.Errorf("open mar/31 = %s", ds(got))
	}
	if got := CycleOpen(d("2026-03-01"), 15); ds(got) != "2026-02-16" {
		t.Errorf("open mar/15 = %s", ds(got))
	}
	if got := CycleFor(d("2026-12-20"), 15); ds(got) != "2027-01-01" {
		t.Errorf("cycle for dec 20 = %s", ds(got))
	}
}

func TestInstallmentCycleOnStatementDay(t *testing.T) {
	if got := CycleFor(d("2026-03-15"), 15); ds(got) != "2026-03-01" {
		t.Fatalf("purchase on close day → cycle %s, want March", ds(got))
	}
	if got := CycleFor(d("2026-03-16"), 15); ds(got) != "2026-04-01" {
		t.Fatalf("purchase day after close → cycle %s, want April", ds(got))
	}
	p := Plan{Total: 900, N: 3, PurchasedOn: d("2026-03-15")}
	if InstallmentIn(p, 15, d("2026-03-01")) != 1 || InstallmentIn(p, 15, d("2026-05-01")) != 3 || InstallmentIn(p, 15, d("2026-06-01")) != 0 {
		t.Fatal("installment numbering wrong for purchase on close day")
	}
}

func TestDueDateAndRelevantCycle(t *testing.T) {
	cases := [][3]string{
		{"2026-03-15", "5", "2026-04-05"},
		{"2026-03-15", "25", "2026-03-25"},
		{"2026-01-31", "30", "2026-02-28"},
		{"2026-03-15", "15", "2026-04-15"},
	}
	for _, c := range cases {
		day := map[string]int{"5": 5, "25": 25, "30": 30, "15": 15}[c[1]]
		if got := DueDate(d(c[0]), day); ds(got) != c[2] {
			t.Errorf("DueDate(%s,%s)=%s want %s", c[0], c[1], ds(got), c[2])
		}
	}
	if got := RelevantCycle(d("2026-03-20"), 15, 5); ds(got) != "2026-03-01" {
		t.Errorf("between close and due → last closed cycle, got %s", ds(got))
	}
	if got := RelevantCycle(d("2026-04-06"), 15, 5); ds(got) != "2026-04-01" {
		t.Errorf("after due → current cycle, got %s", ds(got))
	}
	if got := RelevantCycle(d("2026-03-15"), 15, 5); ds(got) != "2026-03-01" {
		t.Errorf("on close day → that cycle, got %s", ds(got))
	}
}

func TestInstallmentsSplit(t *testing.T) {
	if got := Installments(1000, 3); !slices.Equal(got, []int64{333, 333, 334}) {
		t.Fatalf("split %v", got)
	}
	var sum int64
	for _, x := range Installments(100001, 12) {
		sum += x
	}
	if sum != 100001 {
		t.Fatalf("sum %d", sum)
	}
}

func TestPlansAcrossYearAndCancellation(t *testing.T) {
	p := Plan{Total: 900, N: 3, PurchasedOn: d("2026-11-20")}
	if got := InstallmentCycle(p, 15, 3); ds(got) != "2027-02-01" {
		t.Fatalf("3rd installment cycle %s", ds(got))
	}
	q := Plan{Total: 900, N: 3, PurchasedOn: d("2026-03-10")}
	if n, amt := Billed(q, 15, d("2026-04-15")); n != 2 || amt != 600 {
		t.Fatalf("billed %d %d", n, amt)
	}
	if n, _ := Billed(q, 15, d("2026-03-14")); n != 0 {
		t.Fatalf("billed before first close %d", n)
	}
	if Debt(q, 15) != 900 {
		t.Fatal("active plan debt should be the total")
	}
	cancel := d("2026-04-01")
	q.CancelledOn = &cancel
	if Debt(q, 15) != 300 {
		t.Fatalf("cancelled debt %d, want 300", Debt(q, 15))
	}
	if InstallmentIn(q, 15, d("2026-04-01")) != 0 {
		t.Fatal("installment after cancellation still billed")
	}
}

func TestCompute(t *testing.T) {
	c := Card{StatementDay: 15, DueDay: 5, OpeningBalance: 1000, OpeningDate: d("2026-01-01")}
	charges := []Movement{
		{d("2025-12-31"), 9999}, // before opening: ignored
		{d("2026-02-20"), 500},
		{d("2026-03-10"), 200},
		{d("2026-03-20"), 300}, // next cycle
	}
	payments := []Movement{{d("2026-03-01"), 400}, {d("2026-04-01"), 700}}
	plans := []Plan{{Total: 900, N: 3, PurchasedOn: d("2026-03-10")}}
	r := Compute(c, charges, payments, plans, d("2026-03-01"))
	if ds(r.Opens) != "2026-02-16" || ds(r.Closes) != "2026-03-15" || ds(r.Due) != "2026-04-05" {
		t.Fatalf("dates %s %s %s", ds(r.Opens), ds(r.Closes), ds(r.Due))
	}
	// 1000 + 500 + 200 + 300 (installment 1) - 400
	if r.BilledBalance != 1600 {
		t.Fatalf("billed %d", r.BilledBalance)
	}
	if r.AmountDue != 900 { // 1600 - 700 paid before due
		t.Fatalf("due %d", r.AmountDue)
	}
	// 1000 + 1000 charges + 900 plan - 1100 payments
	if r.CurrentBalance != 1800 {
		t.Fatalf("current %d", r.CurrentBalance)
	}
	over := Compute(c, charges, append(payments, Movement{d("2026-04-02"), 5000}), plans, d("2026-03-01"))
	if over.AmountDue != 0 {
		t.Fatalf("overpaid amount due %d", over.AmountDue)
	}
}
```

Run `go test ./internal/cards/`. Expected: FAIL.

- [ ] **Step 2: Implement** `api/internal/cards/cards.go`

```go
// Package cards computes credit-card statement cycles, MSI installment
// billing and balances. It is pure: no I/O, UTC-midnight dates only.
package cards

import (
	"time"

	"financego/internal/datex"
)

type Movement struct {
	Date   time.Time
	Amount int64
}

type Plan struct {
	ID          int64
	Total       int64
	N           int
	PurchasedOn time.Time
	CancelledOn *time.Time
}

type Card struct {
	StatementDay   int
	DueDay         int
	OpeningBalance int64
	OpeningDate    time.Time
}

type Result struct {
	Cycle, Opens, Closes, Due time.Time
	BilledBalance             int64
	AmountDue                 int64
	CurrentBalance            int64
}

// CycleClose is the statement (cut-off) date of the cycle whose month is `cycle`.
func CycleClose(cycle time.Time, statementDay int) time.Time { return datex.Clamp(cycle, statementDay) }

// CycleOpen is the day after the previous cycle's close.
func CycleOpen(cycle time.Time, statementDay int) time.Time {
	return CycleClose(datex.AddMonths(datex.MonthStart(cycle), -1), statementDay).AddDate(0, 0, 1)
}

// CycleFor returns the cycle containing d; the close day belongs to its cycle.
func CycleFor(d time.Time, statementDay int) time.Time {
	m := datex.MonthStart(d)
	if d.After(CycleClose(m, statementDay)) {
		return datex.AddMonths(m, 1)
	}
	return m
}

// DueDate is the first occurrence of dueDay strictly after closeDate.
func DueDate(closeDate time.Time, dueDay int) time.Time {
	due := datex.Clamp(closeDate, dueDay)
	if !due.After(closeDate) {
		due = datex.Clamp(datex.AddMonths(datex.MonthStart(closeDate), 1), dueDay)
	}
	return due
}

// RelevantCycle is the statement the user should be paying now: the last closed
// cycle while its due date has not passed, otherwise the open cycle.
func RelevantCycle(today time.Time, statementDay, dueDay int) time.Time {
	cur := CycleFor(today, statementDay)
	prev := datex.AddMonths(cur, -1)
	if !DueDate(CycleClose(prev, statementDay), dueDay).Before(today) {
		return prev
	}
	return cur
}

// Installments splits total into n parts; the last absorbs the remainder.
func Installments(total int64, n int) []int64 {
	base := total / int64(n)
	out := make([]int64, n)
	for i := range out {
		out[i] = base
	}
	out[n-1] += total - base*int64(n)
	return out
}

// InstallmentCycle is the cycle in which installment k (1-based) is billed.
func InstallmentCycle(p Plan, statementDay, k int) time.Time {
	return datex.AddMonths(CycleFor(p.PurchasedOn, statementDay), k-1)
}

// InstallmentIn returns the installment number billed in cycle, or 0.
func InstallmentIn(p Plan, statementDay int, cycle time.Time) int {
	k := datex.MonthsBetween(CycleFor(p.PurchasedOn, statementDay), cycle) + 1
	if k < 1 || k > p.N {
		return 0
	}
	if p.CancelledOn != nil && CycleClose(cycle, statementDay).After(*p.CancelledOn) {
		return 0
	}
	return k
}

// Billed counts and sums installments whose cycle closed on or before asOf
// (and not after the plan was cancelled).
func Billed(p Plan, statementDay int, asOf time.Time) (count int, amount int64) {
	amts := Installments(p.Total, p.N)
	for k := 1; k <= p.N; k++ {
		closeDate := CycleClose(InstallmentCycle(p, statementDay, k), statementDay)
		if closeDate.After(asOf) || (p.CancelledOn != nil && closeDate.After(*p.CancelledOn)) {
			break
		}
		count++
		amount += amts[k-1]
	}
	return count, amount
}

// Debt is what the plan adds to the card balance: the full total while active,
// only the installments billed up to cancellation otherwise.
func Debt(p Plan, statementDay int) int64 {
	if p.CancelledOn == nil {
		return p.Total
	}
	_, amt := Billed(p, statementDay, *p.CancelledOn)
	return amt
}

func Compute(c Card, charges, payments []Movement, plans []Plan, cycle time.Time) Result {
	cycle = datex.MonthStart(cycle)
	r := Result{Cycle: cycle, Opens: CycleOpen(cycle, c.StatementDay), Closes: CycleClose(cycle, c.StatementDay)}
	r.Due = DueDate(r.Closes, c.DueDay)
	r.BilledBalance, r.CurrentBalance = c.OpeningBalance, c.OpeningBalance
	var paidAfterClose int64
	for _, m := range charges {
		if m.Date.Before(c.OpeningDate) {
			continue
		}
		r.CurrentBalance += m.Amount
		if !m.Date.After(r.Closes) {
			r.BilledBalance += m.Amount
		}
	}
	for _, m := range payments {
		if m.Date.Before(c.OpeningDate) {
			continue
		}
		r.CurrentBalance -= m.Amount
		switch {
		case !m.Date.After(r.Closes):
			r.BilledBalance -= m.Amount
		case !m.Date.After(r.Due):
			paidAfterClose += m.Amount
		}
	}
	for _, p := range plans {
		r.CurrentBalance += Debt(p, c.StatementDay)
		_, amt := Billed(p, c.StatementDay, r.Closes)
		r.BilledBalance += amt
	}
	r.AmountDue = max(0, r.BilledBalance-paidAfterClose)
	return r
}
```

- [ ] **Step 3: Run the tests.** Run `go test ./internal/cards/`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api && git commit -m "feat(api): pure credit-card cycle, MSI installment and balance maths"
```

---

### Task 12: Card payments, MSI installment plans, statements, installment rows

**Files:**
- Create: `api/queries/cards.sql`, `api/internal/service/cards.go`, `api/internal/httpapi/cards.go`, `api/internal/httpapi/cards_test.go`
- Modify: `api/queries/entries.sql` (installment queries), `api/internal/service/entries.go` (`ensureMonth` calls `ensureInstallments`), `api/internal/httpapi/router.go`, `api/internal/httpapi/harness_test.go` (adds `login`)

**Interfaces:**
- Consumes: `cards.*`, `ensureMonth`, `checkPaymentMethodRef(..., creditOnly=true)`, `toPaymentMethod`
- Produces:
  - `service.CardPayment{ID, PaymentMethodID, Amount, PaidOn datex.Date, Note}`, `service.CardPaymentInput`
  - `ListCardPayments(ctx, a, pmID *int64, from, to *time.Time)`, `CreateCardPayment`, `DeleteCardPayment`
  - `service.InstallmentPlan{ID, PaymentMethodID, CategoryID, Description, TotalAmount, Installments int32, PurchasedOn datex.Date, CancelledOn *datex.Date, InstallmentAmount, BilledCount int32, RemainingAmount int64, FirstCycle datex.Month}`, `service.InstallmentPlanInput{PaymentMethodID, CategoryID, Description, TotalAmount, Installments, PurchasedOn}`
  - `ListInstallmentPlans(ctx, a, pmID *int64, activeOnly bool)`, `CreateInstallmentPlan`, `UpdateInstallmentPlan`, `CancelInstallmentPlan`
  - `service.Statement{...}` and `(*Service).CardStatement(ctx, a, pmID int64, cycle *time.Time) (Statement, error)`
  - internal `(*Service).loadCard(ctx, q, userID int64, pm store.PaymentMethod) (cardState, error)` and `(cardState).compute(cycle time.Time) cards.Result`, both reused by Task 14
  - error code `not_a_credit_card` (422)
  - harness `(*harness).login(email string) string`

- [ ] **Step 1: Queries.** Append to `api/queries/entries.sql`:

```sql
-- name: ListPlansForEnsure :many
SELECT p.id, p.description, p.total_amount, p.installments, p.purchased_on, p.cancelled_on,
       p.category_id, p.payment_method_id, pm.statement_day, pm.payment_due_day
FROM installment_plans p
JOIN payment_methods pm ON pm.id = p.payment_method_id
WHERE p.user_id = @user_id;

-- name: InsertInstallmentEntry :exec
INSERT INTO monthly_entries (user_id, month, kind, installment_plan_id, installment_no, name, category_id,
    payment_method_id, amount, due_date)
VALUES (@user_id, @month::date, 'installment', @installment_plan_id::bigint, @installment_no::int, @name,
    @category_id::bigint, @payment_method_id::bigint, @amount, @due_date::date)
ON CONFLICT DO NOTHING;

-- name: DeletePendingInstallmentEntries :exec
DELETE FROM monthly_entries
WHERE installment_plan_id = @plan_id::bigint AND status = 'pending' AND installment_no >= @from_no::int;

-- name: RelabelInstallmentEntries :exec
UPDATE monthly_entries
SET name = @description::text || ' ' || installment_no::text || '/' || @installments::int::text,
    category_id = @category_id::bigint, updated_at = now()
WHERE installment_plan_id = @plan_id::bigint;
```

Create `api/queries/cards.sql`:

```sql
-- name: CreateCardPayment :one
INSERT INTO card_payments (user_id, payment_method_id, amount, paid_on, note)
VALUES (@user_id, @payment_method_id, @amount, @paid_on, @note)
RETURNING *;

-- name: ListCardPayments :many
SELECT * FROM card_payments
WHERE user_id = @user_id
  AND (sqlc.narg(payment_method_id)::bigint IS NULL OR payment_method_id = sqlc.narg(payment_method_id)::bigint)
  AND (sqlc.narg(from_date)::date IS NULL OR paid_on >= sqlc.narg(from_date)::date)
  AND (sqlc.narg(to_date)::date IS NULL OR paid_on <= sqlc.narg(to_date)::date)
ORDER BY paid_on DESC, id DESC;

-- name: CardPaymentsFor :many
SELECT * FROM card_payments WHERE user_id = @user_id AND payment_method_id = @payment_method_id ORDER BY paid_on, id;

-- name: DeleteCardPayment :execrows
DELETE FROM card_payments WHERE id = @id AND user_id = @user_id;

-- name: CardCharges :many
SELECT e.spent_on AS charged_on, e.amount, e.description, 'expense'::text AS source
FROM expenses e
WHERE e.user_id = @user_id AND e.payment_method_id = @payment_method_id
UNION ALL
SELECT COALESCE(m.settled_on, m.due_date) AS charged_on, m.amount, m.name AS description, 'fixed'::text AS source
FROM monthly_entries m
WHERE m.user_id = @user_id AND m.payment_method_id = @payment_method_id AND m.kind = 'fixed' AND m.status = 'paid'
ORDER BY charged_on;

-- name: CreateInstallmentPlan :one
INSERT INTO installment_plans (user_id, payment_method_id, category_id, description, total_amount, installments, purchased_on)
VALUES (@user_id, @payment_method_id, @category_id, @description, @total_amount, @installments, @purchased_on)
RETURNING *;

-- name: ListInstallmentPlans :many
SELECT * FROM installment_plans
WHERE user_id = @user_id
  AND (sqlc.narg(payment_method_id)::bigint IS NULL OR payment_method_id = sqlc.narg(payment_method_id)::bigint)
  AND (NOT @active_only::bool OR cancelled_on IS NULL)
ORDER BY purchased_on DESC, id DESC;

-- name: PlansForCard :many
SELECT * FROM installment_plans WHERE user_id = @user_id AND payment_method_id = @payment_method_id ORDER BY purchased_on, id;

-- name: GetInstallmentPlan :one
SELECT * FROM installment_plans WHERE id = @id AND user_id = @user_id;

-- name: UpdateInstallmentPlan :one
UPDATE installment_plans SET payment_method_id = @payment_method_id, category_id = @category_id, description = @description,
    total_amount = @total_amount, installments = @installments, purchased_on = @purchased_on, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;

-- name: CancelInstallmentPlan :one
UPDATE installment_plans SET cancelled_on = @cancelled_on, updated_at = now()
WHERE id = @id AND user_id = @user_id
RETURNING *;
```

Run `sqlc generate`. If sqlc rejects the `UNION ALL ... ORDER BY charged_on`, drop the `ORDER BY`; the service sorts in Go anyway.

- [ ] **Step 2: Add `login` to the harness** (append to `harness_test.go`)

```go
// login returns a fresh access token (use after setNow moves the clock).
func (h *harness) login(email string) string {
	h.t.Helper()
	r := h.do("POST", "/api/v1/auth/login", "", M{"email": email, "password": "password123"})
	return expect[struct {
		AccessToken string `json:"access_token"`
	}](h.t, r, 200).AccessToken
}
```

- [ ] **Step 3: Write the failing tests** `api/internal/httpapi/cards_test.go`

```go
package httpapi_test

import (
	"fmt"
	"testing"
	"time"
)

type plan struct {
	ID                int64   `json:"id"`
	Description       string  `json:"description"`
	TotalAmount       int64   `json:"total_amount"`
	Installments      int32   `json:"installments"`
	CancelledOn       *string `json:"cancelled_on"`
	InstallmentAmount int64   `json:"installment_amount"`
	BilledCount       int32   `json:"billed_count"`
	RemainingAmount   int64   `json:"remaining_amount"`
	FirstCycle        string  `json:"first_cycle"`
}

type statement struct {
	Cycle          string   `json:"cycle"`
	OpensOn        string   `json:"opens_on"`
	ClosesOn       string   `json:"closes_on"`
	DueOn          string   `json:"due_on"`
	BilledBalance  int64    `json:"billed_balance"`
	AmountDue      int64    `json:"amount_due"`
	CurrentBalance int64    `json:"current_balance"`
	CreditLimit    *int64   `json:"credit_limit"`
	Utilization    *float64 `json:"utilization"`
	Charges        []struct {
		Date   string `json:"date"`
		Amount int64  `json:"amount"`
		Source string `json:"source"`
	} `json:"charges"`
	Installments []struct {
		No     int32 `json:"no"`
		Of     int32 `json:"of"`
		Amount int64 `json:"amount"`
	} `json:"installments"`
	Payments []struct {
		Amount int64 `json:"amount"`
	} `json:"payments"`
}

func (h *harness) msi(tok string, card int64, total int64, n int, on string) plan {
	h.t.Helper()
	return expect[plan](h.t, h.do("POST", "/api/v1/installment-plans", tok, M{
		"payment_method_id": card, "category_id": h.catID(tok, "Entretenimiento"), "description": "TV",
		"total_amount": total, "installments": n, "purchased_on": on,
	}), 201)
}

func TestCardPayments(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("pay@example.com")
	cc := h.creditCard(tok)
	deb := expect[paymentMethod](t, h.do("POST", "/api/v1/payment-methods", tok, M{"nickname": "Débito", "type": "debit"}), 201).ID

	p := expect[M](t, h.do("POST", "/api/v1/card-payments", tok, M{"payment_method_id": cc, "amount": 50000, "paid_on": "2026-03-01", "note": "abono"}), 201)
	if r := h.do("POST", "/api/v1/card-payments", tok, M{"payment_method_id": deb, "amount": 1, "paid_on": "2026-03-01"}); r.Code != 422 {
		t.Fatalf("payment to debit card: %d", r.Code)
	}
	l := expect[list[M]](t, h.do("GET", fmt.Sprintf("/api/v1/card-payments?payment_method_id=%d", cc), tok, nil), 200)
	if len(l.Items) != 1 {
		t.Fatalf("list %v", l.Items)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/card-payments/%v", p["id"]), tok, nil); r.Code != 204 {
		t.Fatalf("delete %d", r.Code)
	}
}

func TestInstallmentPlanEntriesAndStatement(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("msi@example.com")
	cc := h.creditCard(tok) // closes 15th, due 5th, opening balance 0 from 2026-01-01
	pl := h.msi(tok, cc, 100000, 3, "2026-03-10")
	// Today (03-15) is the March cut-off day, so installment 1 already counts as billed.
	if pl.InstallmentAmount != 33333 || pl.FirstCycle != "2026-03" || pl.BilledCount != 1 || pl.RemainingAmount != 66667 {
		t.Fatalf("plan %+v", pl)
	}

	ins := byKind(h.entries(tok, "2026-03"), "installment")
	if len(ins) != 1 || ins[0].Name != "TV 1/3" || ins[0].Amount != 33333 || ins[0].DueDate != "2026-04-05" {
		t.Fatalf("march installment %+v", ins)
	}
	if may := byKind(h.entries(tok, "2026-05"), "installment"); len(may) != 1 || may[0].Amount != 33334 {
		t.Fatalf("last installment takes remainder: %+v", may)
	}
	if jun := byKind(h.entries(tok, "2026-06"), "installment"); len(jun) != 0 {
		t.Fatalf("june has installment: %+v", jun)
	}

	h.expense(tok, "Comida", 20000, "2026-03-01", "súper", &cc)
	h.expense(tok, "Comida", 5000, "2026-03-16", "café", &cc) // next cycle
	rent := h.fixed(tok, "Netflix", 30000, 10, "2026-03", &cc)
	_ = rent
	nf := byKind(h.entries(tok, "2026-03"), "fixed")[0]
	expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", nf.ID), tok, M{"amount": 30000, "status": "paid", "settled_on": "2026-03-10", "payment_method_id": cc}), 200)
	expect[M](t, h.do("POST", "/api/v1/card-payments", tok, M{"payment_method_id": cc, "amount": 10000, "paid_on": "2026-03-05"}), 201)

	st := expect[statement](t, h.do("GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement?cycle=2026-03", cc), tok, nil), 200)
	// billed: 20000 + 30000 (Netflix paid) + 33333 (1/3) - 10000
	if st.OpensOn != "2026-02-16" || st.ClosesOn != "2026-03-15" || st.DueOn != "2026-04-05" || st.BilledBalance != 73333 || st.AmountDue != 73333 {
		t.Fatalf("statement %+v", st)
	}
	// current: 20000 + 5000 + 30000 + 100000 (whole plan) - 10000
	if st.CurrentBalance != 145000 || st.Utilization == nil || *st.Utilization != 2.9 {
		t.Fatalf("current %d util %v", st.CurrentBalance, st.Utilization)
	}
	if len(st.Charges) != 2 || len(st.Installments) != 1 || st.Installments[0].No != 1 || st.Installments[0].Of != 3 || len(st.Payments) != 1 {
		t.Fatalf("lines %+v", st)
	}
	def := expect[statement](t, h.do("GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement", cc), tok, nil), 200)
	if def.Cycle != "2026-03" {
		t.Fatalf("default cycle %s", def.Cycle)
	}
	deb := expect[paymentMethod](t, h.do("POST", "/api/v1/payment-methods", tok, M{"nickname": "Débito", "type": "debit"}), 201).ID
	if r := h.do("GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement", deb), tok, nil); r.Code != 422 || errCode(r) != "not_a_credit_card" {
		t.Fatalf("debit statement: %d %s", r.Code, r.Body)
	}
}

func TestInstallmentPlanLockAndCancel(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("lock@example.com")
	cc := h.creditCard(tok)
	pl := h.msi(tok, cc, 90000, 3, "2026-03-16") // after the March cut-off: first cycle is April
	h.entries(tok, "2026-05")                    // materialize 2/3

	// Before any cycle closes the plan is fully editable.
	body := M{"payment_method_id": cc, "category_id": h.catID(tok, "Entretenimiento"), "description": "TV 55",
		"total_amount": 120000, "installments": 4, "purchased_on": "2026-03-16"}
	up := expect[plan](t, h.do("PUT", fmt.Sprintf("/api/v1/installment-plans/%d", pl.ID), tok, body), 200)
	if up.InstallmentAmount != 30000 || up.Installments != 4 {
		t.Fatalf("edit %+v", up)
	}
	if may := byKind(h.entries(tok, "2026-05"), "installment"); len(may) != 1 || may[0].Name != "TV 55 2/4" || may[0].Amount != 30000 {
		t.Fatalf("regenerated may %+v", may)
	}

	h.setNow(time.Date(2026, 4, 20, 18, 0, 0, 0, time.UTC)) // April cycle has closed
	tok = h.login("lock@example.com")
	body["total_amount"] = 130000
	if r := h.do("PUT", fmt.Sprintf("/api/v1/installment-plans/%d", pl.ID), tok, body); r.Code != 409 || errCode(r) != "plan_locked" {
		t.Fatalf("locked edit: %d %s", r.Code, r.Body)
	}
	body["total_amount"] = 120000
	body["description"] = "Pantalla"
	expect[plan](t, h.do("PUT", fmt.Sprintf("/api/v1/installment-plans/%d", pl.ID), tok, body), 200)
	if may := byKind(h.entries(tok, "2026-05"), "installment"); may[0].Name != "Pantalla 2/4" {
		t.Fatalf("relabel %+v", may)
	}

	c := expect[plan](t, h.do("DELETE", fmt.Sprintf("/api/v1/installment-plans/%d", pl.ID), tok, nil), 200)
	if c.CancelledOn == nil || *c.CancelledOn != "2026-04-20" || c.RemainingAmount != 0 || c.BilledCount != 1 {
		t.Fatalf("cancel %+v", c)
	}
	if may := byKind(h.entries(tok, "2026-05"), "installment"); len(may) != 0 {
		t.Fatalf("may installment kept after cancel: %+v", may)
	}
	if apr := byKind(h.entries(tok, "2026-04"), "installment"); len(apr) != 1 {
		t.Fatalf("billed april installment removed: %+v", apr)
	}
	st := expect[statement](t, h.do("GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement?cycle=2026-04", cc), tok, nil), 200)
	if st.CurrentBalance != 30000 {
		t.Fatalf("current after cancel %d, want 30000", st.CurrentBalance)
	}
	active := expect[list[plan]](t, h.do("GET", "/api/v1/installment-plans?active_only=true", tok, nil), 200)
	if len(active.Items) != 0 {
		t.Fatalf("active plans %+v", active.Items)
	}
}
```

Run `go test ./internal/httpapi/ -run 'CardPayments|InstallmentPlan'`. Expected: FAIL.

- [ ] **Step 4: Extend `ensureMonth`** in `entries.go`. Replace its last line with:

```go
	if err := q.EnsureFixedEntries(ctx, store.EnsureFixedEntriesParams{UserID: a.UserID, Month: month}); err != nil {
		return err
	}
	return s.ensureInstallments(ctx, q, a.UserID, month)
```

- [ ] **Step 5: Implement** `api/internal/service/cards.go`

```go
package service

import (
	"context"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"financego/internal/apperr"
	"financego/internal/cards"
	"financego/internal/datex"
	"financego/internal/store"
)

func notCreditCard() error {
	return &apperr.Error{Status: 422, Code: "not_a_credit_card", Message: "statements exist only for credit cards"}
}

// ---- installment rows -------------------------------------------------------

func (s *Service) ensureInstallments(ctx context.Context, q *store.Queries, userID int64, month time.Time) error {
	rows, err := q.ListPlansForEnsure(ctx, userID)
	if err != nil {
		return err
	}
	for _, r := range rows {
		if r.StatementDay == nil || r.PaymentDueDay == nil {
			continue // not a credit card (cannot happen: plans require credit cards)
		}
		sd, dd := int(*r.StatementDay), int(*r.PaymentDueDay)
		p := cards.Plan{ID: r.ID, Total: r.TotalAmount, N: int(r.Installments), PurchasedOn: r.PurchasedOn, CancelledOn: r.CancelledOn}
		k := cards.InstallmentIn(p, sd, month)
		if k == 0 {
			continue
		}
		err := q.InsertInstallmentEntry(ctx, store.InsertInstallmentEntryParams{
			UserID: userID, Month: month, InstallmentPlanID: r.ID, InstallmentNo: int32(k),
			Name:       fmt.Sprintf("%s %d/%d", r.Description, k, p.N),
			CategoryID: r.CategoryID, PaymentMethodID: r.PaymentMethodID,
			Amount: cards.Installments(p.Total, p.N)[k-1], DueDate: cards.DueDate(cards.CycleClose(month, sd), dd),
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// ---- card payments ----------------------------------------------------------

type CardPayment struct {
	ID              int64      `json:"id"`
	PaymentMethodID int64      `json:"payment_method_id"`
	Amount          int64      `json:"amount"`
	PaidOn          datex.Date `json:"paid_on"`
	Note            string     `json:"note"`
}

type CardPaymentInput struct {
	PaymentMethodID int64      `json:"payment_method_id"`
	Amount          int64      `json:"amount"`
	PaidOn          datex.Date `json:"paid_on"`
	Note            string     `json:"note"`
}

func toCardPayment(c store.CardPayment) CardPayment {
	return CardPayment{ID: c.ID, PaymentMethodID: c.PaymentMethodID, Amount: c.Amount, PaidOn: datex.NewDate(c.PaidOn), Note: c.Note}
}

func (s *Service) ListCardPayments(ctx context.Context, a Actor, pmID *int64, from, to *time.Time) ([]CardPayment, error) {
	rows, err := s.q.ListCardPayments(ctx, store.ListCardPaymentsParams{UserID: a.UserID, PaymentMethodID: pmID, FromDate: from, ToDate: to})
	if err != nil {
		return nil, err
	}
	out := make([]CardPayment, len(rows))
	for i, r := range rows {
		out[i] = toCardPayment(r)
	}
	return out, nil
}

func (s *Service) CreateCardPayment(ctx context.Context, a Actor, in CardPaymentInput) (CardPayment, error) {
	in.Note = strings.TrimSpace(in.Note)
	var v apperr.V
	checkAmount(&v, "amount", in.Amount)
	v.Check(!in.PaidOn.IsZero(), "paid_on", "is required")
	v.Check(utf8.RuneCountInString(in.Note) <= 200, "note", "must be at most 200 characters")
	if err := v.Err(); err != nil {
		return CardPayment{}, err
	}
	if _, err := s.checkPaymentMethodRef(ctx, s.q, a.UserID, &in.PaymentMethodID, "payment_method_id", true); err != nil {
		return CardPayment{}, err
	}
	c, err := s.q.CreateCardPayment(ctx, store.CreateCardPaymentParams{UserID: a.UserID, PaymentMethodID: in.PaymentMethodID,
		Amount: in.Amount, PaidOn: in.PaidOn.Time, Note: in.Note})
	if err != nil {
		return CardPayment{}, err
	}
	return toCardPayment(c), nil
}

func (s *Service) DeleteCardPayment(ctx context.Context, a Actor, id int64) error {
	n, err := s.q.DeleteCardPayment(ctx, store.DeleteCardPaymentParams{ID: id, UserID: a.UserID})
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound()
	}
	return nil
}

// ---- installment plans ------------------------------------------------------

type InstallmentPlan struct {
	ID                int64       `json:"id"`
	PaymentMethodID   int64       `json:"payment_method_id"`
	CategoryID        int64       `json:"category_id"`
	Description       string      `json:"description"`
	TotalAmount       int64       `json:"total_amount"`
	Installments      int32       `json:"installments"`
	PurchasedOn       datex.Date  `json:"purchased_on"`
	CancelledOn       *datex.Date `json:"cancelled_on"`
	InstallmentAmount int64       `json:"installment_amount"`
	BilledCount       int32       `json:"billed_count"`
	RemainingAmount   int64       `json:"remaining_amount"`
	FirstCycle        datex.Month `json:"first_cycle"`
}

type InstallmentPlanInput struct {
	PaymentMethodID int64      `json:"payment_method_id"`
	CategoryID      int64      `json:"category_id"`
	Description     string     `json:"description"`
	TotalAmount     int64      `json:"total_amount"`
	Installments    int32      `json:"installments"`
	PurchasedOn     datex.Date `json:"purchased_on"`
}

func planOf(p store.InstallmentPlan) cards.Plan {
	return cards.Plan{ID: p.ID, Total: p.TotalAmount, N: int(p.Installments), PurchasedOn: p.PurchasedOn, CancelledOn: p.CancelledOn}
}

func toInstallmentPlan(p store.InstallmentPlan, statementDay int, today time.Time) InstallmentPlan {
	cp := planOf(p)
	billed, billedAmt := cards.Billed(cp, statementDay, today)
	return InstallmentPlan{
		ID: p.ID, PaymentMethodID: p.PaymentMethodID, CategoryID: p.CategoryID, Description: p.Description,
		TotalAmount: p.TotalAmount, Installments: p.Installments, PurchasedOn: datex.NewDate(p.PurchasedOn),
		CancelledOn: datex.DatePtr(p.CancelledOn), InstallmentAmount: cards.Installments(p.TotalAmount, int(p.Installments))[0],
		BilledCount: int32(billed), RemainingAmount: cards.Debt(cp, statementDay) - billedAmt,
		FirstCycle: datex.NewMonth(cards.CycleFor(p.PurchasedOn, statementDay)),
	}
}

func (s *Service) validatePlan(ctx context.Context, q *store.Queries, a Actor, in *InstallmentPlanInput) (*store.PaymentMethod, error) {
	in.Description = strings.TrimSpace(in.Description)
	var v apperr.V
	n := utf8.RuneCountInString(in.Description)
	v.Check(n >= 1 && n <= 120, "description", "must be 1-120 characters")
	checkAmount(&v, "total_amount", in.TotalAmount)
	v.Check(in.Installments >= 2 && in.Installments <= 48, "installments", "must be between 2 and 48")
	v.Check(in.TotalAmount >= int64(in.Installments), "total_amount", "must be at least one cent per installment")
	v.Check(!in.PurchasedOn.IsZero(), "purchased_on", "is required")
	v.Check(in.CategoryID > 0, "category_id", "is required")
	if err := v.Err(); err != nil {
		return nil, err
	}
	if err := s.checkCategoryRef(ctx, q, a.UserID, in.CategoryID, "expense", "category_id"); err != nil {
		return nil, err
	}
	return s.checkPaymentMethodRef(ctx, q, a.UserID, &in.PaymentMethodID, "payment_method_id", true)
}

func (s *Service) statementDayOf(ctx context.Context, q *store.Queries, userID, pmID int64) (int, error) {
	pm, err := q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: pmID, UserID: userID})
	if err != nil {
		return 0, err
	}
	if pm.StatementDay == nil {
		return 0, notCreditCard()
	}
	return int(*pm.StatementDay), nil
}

func (s *Service) ListInstallmentPlans(ctx context.Context, a Actor, pmID *int64, activeOnly bool) ([]InstallmentPlan, error) {
	rows, err := s.q.ListInstallmentPlans(ctx, store.ListInstallmentPlansParams{UserID: a.UserID, PaymentMethodID: pmID, ActiveOnly: activeOnly})
	if err != nil {
		return nil, err
	}
	today := s.today(a)
	out := make([]InstallmentPlan, 0, len(rows))
	days := map[int64]int{}
	for _, r := range rows {
		sd, ok := days[r.PaymentMethodID]
		if !ok {
			if sd, err = s.statementDayOf(ctx, s.q, a.UserID, r.PaymentMethodID); err != nil {
				return nil, err
			}
			days[r.PaymentMethodID] = sd
		}
		out = append(out, toInstallmentPlan(r, sd, today))
	}
	return out, nil
}

func (s *Service) CreateInstallmentPlan(ctx context.Context, a Actor, in InstallmentPlanInput) (InstallmentPlan, error) {
	pm, err := s.validatePlan(ctx, s.q, a, &in)
	if err != nil {
		return InstallmentPlan{}, err
	}
	p, err := s.q.CreateInstallmentPlan(ctx, store.CreateInstallmentPlanParams{UserID: a.UserID, PaymentMethodID: in.PaymentMethodID,
		CategoryID: in.CategoryID, Description: in.Description, TotalAmount: in.TotalAmount, Installments: in.Installments,
		PurchasedOn: in.PurchasedOn.Time})
	if err != nil {
		return InstallmentPlan{}, err
	}
	return toInstallmentPlan(p, int(*pm.StatementDay), s.today(a)), nil
}

// UpdateInstallmentPlan edits a plan. Once an installment has been billed in a
// closed cycle only description and category may change (409 plan_locked otherwise).
func (s *Service) UpdateInstallmentPlan(ctx context.Context, a Actor, id int64, in InstallmentPlanInput) (InstallmentPlan, error) {
	var out InstallmentPlan
	err := s.inTx(ctx, func(q *store.Queries) error {
		cur, err := q.GetInstallmentPlan(ctx, store.GetInstallmentPlanParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		pm, err := s.validatePlan(ctx, q, a, &in)
		if err != nil {
			return err
		}
		curSD, err := s.statementDayOf(ctx, q, a.UserID, cur.PaymentMethodID)
		if err != nil {
			return err
		}
		today := s.today(a)
		billed, _ := cards.Billed(planOf(cur), curSD, today)
		structural := in.PaymentMethodID != cur.PaymentMethodID || in.TotalAmount != cur.TotalAmount ||
			in.Installments != cur.Installments || !in.PurchasedOn.Equal(cur.PurchasedOn)
		if cur.CancelledOn != nil || (billed > 0 && structural) {
			return apperr.Conflict("plan_locked", "installments already billed; only description and category can change")
		}
		p, err := q.UpdateInstallmentPlan(ctx, store.UpdateInstallmentPlanParams{ID: id, UserID: a.UserID,
			PaymentMethodID: in.PaymentMethodID, CategoryID: in.CategoryID, Description: in.Description,
			TotalAmount: in.TotalAmount, Installments: in.Installments, PurchasedOn: in.PurchasedOn.Time})
		if err != nil {
			return err
		}
		if structural { // nothing billed yet: drop rows, they regenerate lazily
			if err := q.DeletePendingInstallmentEntries(ctx, store.DeletePendingInstallmentEntriesParams{PlanID: id, FromNo: 1}); err != nil {
				return err
			}
		}
		if err := q.RelabelInstallmentEntries(ctx, store.RelabelInstallmentEntriesParams{PlanID: id, Description: p.Description,
			Installments: p.Installments, CategoryID: p.CategoryID}); err != nil {
			return err
		}
		out = toInstallmentPlan(p, int(*pm.StatementDay), today)
		return nil
	})
	return out, err
}

// CancelInstallmentPlan stops a plan today: unbilled installments leave the
// debt and their pending month rows are deleted. Cancelling twice is a no-op.
func (s *Service) CancelInstallmentPlan(ctx context.Context, a Actor, id int64) (InstallmentPlan, error) {
	var out InstallmentPlan
	err := s.inTx(ctx, func(q *store.Queries) error {
		cur, err := q.GetInstallmentPlan(ctx, store.GetInstallmentPlanParams{ID: id, UserID: a.UserID})
		if err != nil {
			return notFound(err)
		}
		sd, err := s.statementDayOf(ctx, q, a.UserID, cur.PaymentMethodID)
		if err != nil {
			return err
		}
		today := s.today(a)
		if cur.CancelledOn == nil {
			if cur, err = q.CancelInstallmentPlan(ctx, store.CancelInstallmentPlanParams{ID: id, UserID: a.UserID, CancelledOn: &today}); err != nil {
				return err
			}
			billed, _ := cards.Billed(planOf(cur), sd, today)
			if err := q.DeletePendingInstallmentEntries(ctx, store.DeletePendingInstallmentEntriesParams{PlanID: id, FromNo: int32(billed + 1)}); err != nil {
				return err
			}
		}
		out = toInstallmentPlan(cur, sd, today)
		return nil
	})
	return out, err
}

// ---- statements -------------------------------------------------------------

type StatementCharge struct {
	Date        datex.Date `json:"date"`
	Description string     `json:"description"`
	Amount      int64      `json:"amount"`
	Source      string     `json:"source"`
}

type StatementInstallment struct {
	PlanID      int64  `json:"plan_id"`
	Description string `json:"description"`
	No          int32  `json:"no"`
	Of          int32  `json:"of"`
	Amount      int64  `json:"amount"`
}

type Statement struct {
	PaymentMethodID int64                  `json:"payment_method_id"`
	Cycle           datex.Month            `json:"cycle"`
	OpensOn         datex.Date             `json:"opens_on"`
	ClosesOn        datex.Date             `json:"closes_on"`
	DueOn           datex.Date             `json:"due_on"`
	BilledBalance   int64                  `json:"billed_balance"`
	AmountDue       int64                  `json:"amount_due"`
	CurrentBalance  int64                  `json:"current_balance"`
	CreditLimit     *int64                 `json:"credit_limit"`
	AvailableCredit *int64                 `json:"available_credit"`
	Utilization     *float64               `json:"utilization"`
	Charges         []StatementCharge      `json:"charges"`
	Installments    []StatementInstallment `json:"installments"`
	Payments        []CardPayment          `json:"payments"`
}

type cardState struct {
	pm       store.PaymentMethod
	card     cards.Card
	charges  []store.CardChargesRow
	payments []store.CardPayment
	plans    []store.InstallmentPlan
}

func (s *Service) loadCard(ctx context.Context, q *store.Queries, userID int64, pm store.PaymentMethod) (cardState, error) {
	if pm.Type != "credit" || pm.StatementDay == nil || pm.PaymentDueDay == nil || pm.OpeningBalanceDate == nil {
		return cardState{}, notCreditCard()
	}
	st := cardState{pm: pm, card: cards.Card{StatementDay: int(*pm.StatementDay), DueDay: int(*pm.PaymentDueDay),
		OpeningBalance: pm.OpeningBalance, OpeningDate: *pm.OpeningBalanceDate}}
	var err error
	if st.charges, err = q.CardCharges(ctx, store.CardChargesParams{UserID: userID, PaymentMethodID: &pm.ID}); err != nil {
		return st, err
	}
	slices.SortStableFunc(st.charges, func(a, b store.CardChargesRow) int { return a.ChargedOn.Compare(b.ChargedOn) })
	if st.payments, err = q.CardPaymentsFor(ctx, store.CardPaymentsForParams{UserID: userID, PaymentMethodID: pm.ID}); err != nil {
		return st, err
	}
	st.plans, err = q.PlansForCard(ctx, store.PlansForCardParams{UserID: userID, PaymentMethodID: pm.ID})
	return st, err
}

func (st cardState) compute(cycle time.Time) cards.Result {
	charges := make([]cards.Movement, len(st.charges))
	for i, c := range st.charges {
		charges[i] = cards.Movement{Date: c.ChargedOn, Amount: c.Amount}
	}
	payments := make([]cards.Movement, len(st.payments))
	for i, p := range st.payments {
		payments[i] = cards.Movement{Date: p.PaidOn, Amount: p.Amount}
	}
	plans := make([]cards.Plan, len(st.plans))
	for i, p := range st.plans {
		plans[i] = planOf(p)
	}
	return cards.Compute(st.card, charges, payments, plans, cycle)
}

// utilization returns current/limit as a percentage with one decimal, and available credit.
func utilization(current int64, limit *int64) (*float64, *int64) {
	if limit == nil || *limit <= 0 {
		return nil, nil
	}
	u := math.Round(float64(current)*1000/float64(*limit)) / 10
	avail := *limit - current
	return &u, &avail
}

func (s *Service) CardStatement(ctx context.Context, a Actor, pmID int64, cycle *time.Time) (Statement, error) {
	pm, err := s.q.GetPaymentMethod(ctx, store.GetPaymentMethodParams{ID: pmID, UserID: a.UserID})
	if err != nil {
		return Statement{}, notFound(err)
	}
	st, err := s.loadCard(ctx, s.q, a.UserID, pm)
	if err != nil {
		return Statement{}, err
	}
	c := cards.RelevantCycle(s.today(a), st.card.StatementDay, st.card.DueDay)
	if cycle != nil {
		c = datex.MonthStart(*cycle)
	}
	r := st.compute(c)
	util, avail := utilization(r.CurrentBalance, pm.CreditLimit)
	out := Statement{
		PaymentMethodID: pmID, Cycle: datex.NewMonth(r.Cycle), OpensOn: datex.NewDate(r.Opens), ClosesOn: datex.NewDate(r.Closes),
		DueOn: datex.NewDate(r.Due), BilledBalance: r.BilledBalance, AmountDue: r.AmountDue, CurrentBalance: r.CurrentBalance,
		CreditLimit: pm.CreditLimit, AvailableCredit: avail, Utilization: util,
		Charges: []StatementCharge{}, Installments: []StatementInstallment{}, Payments: []CardPayment{},
	}
	inCycle := func(d time.Time) bool { return !d.Before(r.Opens) && !d.After(r.Closes) }
	for _, ch := range st.charges {
		if inCycle(ch.ChargedOn) && !ch.ChargedOn.Before(st.card.OpeningDate) {
			out.Charges = append(out.Charges, StatementCharge{Date: datex.NewDate(ch.ChargedOn), Description: ch.Description, Amount: ch.Amount, Source: ch.Source})
		}
	}
	for _, p := range st.plans {
		cp := planOf(p)
		if k := cards.InstallmentIn(cp, st.card.StatementDay, r.Cycle); k > 0 {
			out.Installments = append(out.Installments, StatementInstallment{PlanID: p.ID, Description: p.Description,
				No: int32(k), Of: p.Installments, Amount: cards.Installments(cp.Total, cp.N)[k-1]})
		}
	}
	for _, p := range st.payments {
		if inCycle(p.PaidOn) {
			out.Payments = append(out.Payments, toCardPayment(p))
		}
	}
	return out, nil
}
```

> **sqlc typing note:** `CardCharges` filters `payment_method_id` on nullable columns, so its param may be generated as `*int64` (as written above) or `int64`. Match whatever `store.CardChargesParams` declares. The `CardChargesRow` fields are `ChargedOn time.Time, Amount int64, Description string, Source string`.

- [ ] **Step 6: Handlers** `api/internal/httpapi/cards.go`

```go
package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/service"
)

// listCardPayments godoc
// @Summary  List payments made to credit cards
// @Tags     cards
// @Produce  json
// @Security BearerAuth
// @Param    payment_method_id query int    false "card"
// @Param    from              query string false "YYYY-MM-DD"
// @Param    to                query string false "YYYY-MM-DD"
// @Success  200 {object} object{items=[]service.CardPayment}
// @Router   /card-payments [get]
func (h *handlers) listCardPayments(c *gin.Context) {
	pm, ok := queryInt64(c, "payment_method_id")
	if !ok {
		return
	}
	from, ok := queryDate(c, "from")
	if !ok {
		return
	}
	to, ok := queryDate(c, "to")
	if !ok {
		return
	}
	list, err := h.svc.ListCardPayments(c.Request.Context(), actorOf(c), pm, from, to)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createCardPayment godoc
// @Summary  Record a payment to a credit card (a transfer, not spending)
// @Tags     cards
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.CardPaymentInput true "payment"
// @Success  201  {object} service.CardPayment
// @Router   /card-payments [post]
func (h *handlers) createCardPayment(c *gin.Context) {
	var in service.CardPaymentInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateCardPayment(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// deleteCardPayment godoc
// @Summary  Delete a card payment
// @Tags     cards
// @Security BearerAuth
// @Param    id path int true "card payment id"
// @Success  204
// @Router   /card-payments/{id} [delete]
func (h *handlers) deleteCardPayment(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteCardPayment(c.Request.Context(), actorOf(c), id); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// listInstallmentPlans godoc
// @Summary  List MSI (meses sin intereses) plans
// @Tags     cards
// @Produce  json
// @Security BearerAuth
// @Param    payment_method_id query int  false "card"
// @Param    active_only       query bool false "exclude cancelled plans"
// @Success  200 {object} object{items=[]service.InstallmentPlan}
// @Router   /installment-plans [get]
func (h *handlers) listInstallmentPlans(c *gin.Context) {
	pm, ok := queryInt64(c, "payment_method_id")
	if !ok {
		return
	}
	list, err := h.svc.ListInstallmentPlans(c.Request.Context(), actorOf(c), pm, c.Query("active_only") == "true")
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// createInstallmentPlan godoc
// @Summary  Create an MSI plan on a credit card
// @Tags     cards
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    body body     service.InstallmentPlanInput true "plan"
// @Success  201  {object} service.InstallmentPlan
// @Router   /installment-plans [post]
func (h *handlers) createInstallmentPlan(c *gin.Context) {
	var in service.InstallmentPlanInput
	if !bind(c, &in) {
		return
	}
	out, err := h.svc.CreateInstallmentPlan(c.Request.Context(), actorOf(c), in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

// updateInstallmentPlan godoc
// @Summary  Replace an MSI plan (only description/category once billing started)
// @Tags     cards
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int                          true "plan id"
// @Param    body body     service.InstallmentPlanInput true "plan"
// @Success  200  {object} service.InstallmentPlan
// @Failure  409  {object} ErrorResponse
// @Router   /installment-plans/{id} [put]
func (h *handlers) updateInstallmentPlan(c *gin.Context) {
	id, ok := pathID(c)
	var in service.InstallmentPlanInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.UpdateInstallmentPlan(c.Request.Context(), actorOf(c), id, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// cancelInstallmentPlan godoc
// @Summary  Cancel an MSI plan (refund/cancellation); unbilled installments leave the debt
// @Tags     cards
// @Produce  json
// @Security BearerAuth
// @Param    id path int true "plan id"
// @Success  200 {object} service.InstallmentPlan
// @Router   /installment-plans/{id} [delete]
func (h *handlers) cancelInstallmentPlan(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.svc.CancelInstallmentPlan(c.Request.Context(), actorOf(c), id)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// cardStatement godoc
// @Summary  Credit-card statement for a cycle (default: the one currently due)
// @Tags     cards
// @Produce  json
// @Security BearerAuth
// @Param    id    path  int    true  "card id"
// @Param    cycle query string false "YYYY-MM"
// @Success  200 {object} service.Statement
// @Failure  422 {object} ErrorResponse
// @Router   /payment-methods/{id}/statement [get]
func (h *handlers) cardStatement(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var cycle *time.Time
	if v := c.Query("cycle"); v != "" {
		m, err := datex.ParseMonth(v)
		if err != nil {
			fail(c, apperr.BadRequest("cycle: "+err.Error()))
			return
		}
		cycle = &m
	}
	out, err := h.svc.CardStatement(c.Request.Context(), actorOf(c), id, cycle)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}
```

Add `"time"` to the imports of this file.

- [ ] **Step 7: Register the routes** (append in `routes`)

```go
	p.GET("/payment-methods/:id/statement", h.cardStatement)
	p.GET("/card-payments", h.listCardPayments)
	p.POST("/card-payments", h.createCardPayment)
	p.DELETE("/card-payments/:id", h.deleteCardPayment)
	p.GET("/installment-plans", h.listInstallmentPlans)
	p.POST("/installment-plans", h.createInstallmentPlan)
	p.PUT("/installment-plans/:id", h.updateInstallmentPlan)
	p.DELETE("/installment-plans/:id", h.cancelInstallmentPlan)
```

- [ ] **Step 8: Run the tests.** Run `go test ./internal/...`. Expected: PASS. The utilization check expects `145000 / 5000000 = 2.9%`.

- [ ] **Step 9: Commit**

```bash
git add api && git commit -m "feat(api): card payments, MSI installment plans, statements, installment month rows"
```

---

### Task 13: Dashboard summary (Available, safe-to-spend) and category budgets

**Files:**
- Create: `api/queries/dashboard.sql`, `api/internal/service/dashboard.go`, `api/internal/service/dashboard_test.go`, `api/internal/httpapi/dashboard.go`, `api/internal/httpapi/dashboard_test.go`
- Modify: `api/internal/httpapi/router.go`

**Interfaces:**
- Produces:
  - `service.SafeToSpend(available int64, today, month time.Time) (perDay int64, daysLeft int, ok bool)`
  - `service.BudgetStatus{CategoryID, Name, Color, Limit, Spent int64, Pct int32}`
  - `service.Summary{Month datex.Month, Currency string, Income, FixedCommitted, FixedPaid, Installments, Spent, Available int64, SafeToSpendPerDay *int64, DaysRemaining *int32, Budgets []BudgetStatus}`
  - `(*Service).Summary(ctx, a, month *time.Time) (Summary, error)`
  - `service.CategoryBudget{CategoryID, MonthlyLimit int64}`
  - `ListCategoryBudgets`, `PutCategoryBudget(ctx, a, categoryID, limit int64)`, `DeleteCategoryBudget(ctx, a, categoryID)`
  - httpapi `queryMonth(c, key) (*time.Time, bool)`, added to `respond.go`

- [ ] **Step 1: Queries** `api/queries/dashboard.sql`

```sql
-- name: MonthTotals :one
SELECT
    COALESCE(SUM(amount) FILTER (WHERE kind = 'income' AND status <> 'skipped'), 0)::bigint AS income,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'fixed' AND status <> 'skipped'), 0)::bigint AS fixed_committed,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'fixed' AND status = 'paid'), 0)::bigint AS fixed_paid,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'installment' AND status <> 'skipped'), 0)::bigint AS installments
FROM monthly_entries
WHERE user_id = @user_id AND month = @month;

-- name: SpentBetween :one
SELECT COALESCE(SUM(amount), 0)::bigint AS spent
FROM expenses
WHERE user_id = @user_id AND spent_on BETWEEN @from_date::date AND @to_date::date;

-- name: BudgetStatus :many
SELECT b.category_id, c.name, c.color, b.monthly_limit,
    (COALESCE((SELECT SUM(e.amount) FROM expenses e
               WHERE e.user_id = b.user_id AND e.category_id = b.category_id
                 AND e.spent_on >= @month::date AND e.spent_on < (@month::date + INTERVAL '1 month')), 0)
   + COALESCE((SELECT SUM(m.amount) FROM monthly_entries m
               WHERE m.user_id = b.user_id AND m.category_id = b.category_id AND m.month = @month::date
                 AND m.kind IN ('fixed', 'installment') AND m.status <> 'skipped'), 0))::bigint AS spent
FROM category_budgets b
JOIN categories c ON c.id = b.category_id
WHERE b.user_id = @user_id
ORDER BY c.name;

-- name: UpsertCategoryBudget :one
INSERT INTO category_budgets (user_id, category_id, monthly_limit)
VALUES (@user_id, @category_id, @monthly_limit)
ON CONFLICT (user_id, category_id) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit, updated_at = now()
RETURNING *;

-- name: ListCategoryBudgets :many
SELECT * FROM category_budgets WHERE user_id = @user_id ORDER BY category_id;

-- name: DeleteCategoryBudget :execrows
DELETE FROM category_budgets WHERE user_id = @user_id AND category_id = @category_id;
```

Run `sqlc generate`.

- [ ] **Step 2: Write the failing unit test** `api/internal/service/dashboard_test.go`

```go
package service

import (
	"testing"
	"time"
)

func TestSafeToSpend(t *testing.T) {
	mar := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	per, days, ok := SafeToSpend(1_900_000, time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC), mar)
	if !ok || days != 17 || per != 111764 {
		t.Fatalf("mid-month: %d %d %v", per, days, ok)
	}
	per, days, ok = SafeToSpend(-500, time.Date(2026, 3, 31, 0, 0, 0, 0, time.UTC), mar)
	if !ok || days != 1 || per != 0 {
		t.Fatalf("negative: %d %d %v", per, days, ok)
	}
	if _, _, ok := SafeToSpend(100, time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC), mar); ok {
		t.Fatal("past month should not report safe-to-spend")
	}
}
```

- [ ] **Step 3: Write the failing integration tests** `api/internal/httpapi/dashboard_test.go`

```go
package httpapi_test

import (
	"fmt"
	"testing"
	"time"
)

type summary struct {
	Month             string `json:"month"`
	Currency          string `json:"currency"`
	Income            int64  `json:"income"`
	FixedCommitted    int64  `json:"fixed_committed"`
	FixedPaid         int64  `json:"fixed_paid"`
	Installments      int64  `json:"installments"`
	Spent             int64  `json:"spent"`
	Available         int64  `json:"available"`
	SafeToSpendPerDay *int64 `json:"safe_to_spend_per_day"`
	DaysRemaining     *int32 `json:"days_remaining"`
	Budgets           []struct {
		CategoryID int64 `json:"category_id"`
		Limit      int64 `json:"limit"`
		Spent      int64 `json:"spent"`
		Pct        int32 `json:"pct"`
	} `json:"budgets"`
}

func TestSummary(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("sum@example.com")
	cc := h.creditCard(tok)
	h.income(tok, 3000000, 1, "2026-01")
	h.fixed(tok, "Renta", 1000000, 5, "2026-01", nil)
	h.msi(tok, cc, 90000, 3, "2026-03-01")
	h.expense(tok, "Comida", 50000, "2026-03-10", "", &cc)
	h.expense(tok, "Transporte", 20000, "2026-03-15", "", nil)
	h.expense(tok, "Comida", 99999, "2026-02-28", "", nil)
	rent := byKind(h.entries(tok, "2026-03"), "fixed")[0]
	expect[entry](t, h.do("PUT", fmt.Sprintf("/api/v1/entries/%d", rent.ID), tok, M{"amount": 1000000, "status": "paid"}), 200)

	food := h.catID(tok, "Comida")
	expect[M](t, h.do("PUT", fmt.Sprintf("/api/v1/category-budgets/%d", food), tok, M{"monthly_limit": 100000}), 200)
	if r := h.do("PUT", fmt.Sprintf("/api/v1/category-budgets/%d", h.catID(tok, "Salario")), tok, M{"monthly_limit": 1}); r.Code != 422 {
		t.Fatalf("budget on income category: %d", r.Code)
	}

	s := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-03", tok, nil), 200)
	if s.Income != 3000000 || s.FixedCommitted != 1000000 || s.FixedPaid != 1000000 || s.Installments != 30000 || s.Spent != 70000 {
		t.Fatalf("totals %+v", s)
	}
	if s.Available != 1900000 || s.SafeToSpendPerDay == nil || *s.SafeToSpendPerDay != 111764 || *s.DaysRemaining != 17 || s.Currency != "MXN" {
		t.Fatalf("available %+v", s)
	}
	if len(s.Budgets) != 1 || s.Budgets[0].Spent != 50000 || s.Budgets[0].Pct != 50 {
		t.Fatalf("budgets %+v", s.Budgets)
	}
	feb := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-02", tok, nil), 200)
	if feb.SafeToSpendPerDay != nil || feb.Spent != 99999 {
		t.Fatalf("february %+v", feb)
	}
	if r := h.do("DELETE", fmt.Sprintf("/api/v1/category-budgets/%d", food), tok, nil); r.Code != 204 {
		t.Fatalf("delete budget %d", r.Code)
	}
}

func TestSummarySafeToSpendUsesLocalDate(t *testing.T) {
	h := newHarness(t)
	h.setNow(time.Date(2026, 4, 1, 3, 0, 0, 0, time.UTC)) // 2026-03-31 20:00 in Tijuana
	tok := h.signup("tz@example.com")
	expect[M](t, h.do("PUT", "/api/v1/me", tok, M{"name": "Tz", "currency": "MXN", "locale": "es", "timezone": "America/Tijuana"}), 200)
	h.income(tok, 310000, 1, "2026-01")
	s := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary", tok, nil), 200)
	if s.Month != "2026-03" || s.DaysRemaining == nil || *s.DaysRemaining != 1 || *s.SafeToSpendPerDay != 310000 {
		t.Fatalf("local-date summary %+v", s)
	}
}
```

Run `go test ./internal/service/ ./internal/httpapi/ -run 'SafeToSpend|Summary'`. Expected: FAIL.

- [ ] **Step 4: Implement** `api/internal/service/dashboard.go`

```go
package service

import (
	"context"
	"time"

	"financego/internal/apperr"
	"financego/internal/datex"
	"financego/internal/store"
)

type BudgetStatus struct {
	CategoryID int64  `json:"category_id"`
	Name       string `json:"name"`
	Color      string `json:"color"`
	Limit      int64  `json:"limit"`
	Spent      int64  `json:"spent"`
	Pct        int32  `json:"pct"`
}

type Summary struct {
	Month             datex.Month    `json:"month"`
	Currency          string         `json:"currency"`
	Income            int64          `json:"income"`
	FixedCommitted    int64          `json:"fixed_committed"`
	FixedPaid         int64          `json:"fixed_paid"`
	Installments      int64          `json:"installments"`
	Spent             int64          `json:"spent"`
	Available         int64          `json:"available"`
	SafeToSpendPerDay *int64         `json:"safe_to_spend_per_day"`
	DaysRemaining     *int32         `json:"days_remaining"`
	Budgets           []BudgetStatus `json:"budgets"`
}

// SafeToSpend spreads what is left of the month over the remaining days
// (today included). It is only meaningful for the month containing today.
func SafeToSpend(available int64, today, month time.Time) (perDay int64, daysLeft int, ok bool) {
	if !datex.MonthStart(today).Equal(datex.MonthStart(month)) {
		return 0, 0, false
	}
	daysLeft = datex.DaysIn(month) - today.Day() + 1
	return max(0, available) / int64(daysLeft), daysLeft, true
}

func (s *Service) Summary(ctx context.Context, a Actor, month *time.Time) (Summary, error) {
	today := s.today(a)
	m := datex.MonthStart(today)
	if month != nil {
		m = datex.MonthStart(*month)
	}
	if err := s.ensureMonth(ctx, s.q, a, m); err != nil {
		return Summary{}, err
	}
	u, err := s.q.GetUser(ctx, a.UserID)
	if err != nil {
		return Summary{}, err
	}
	t, err := s.q.MonthTotals(ctx, store.MonthTotalsParams{UserID: a.UserID, Month: m})
	if err != nil {
		return Summary{}, err
	}
	end := datex.AddMonths(m, 1).AddDate(0, 0, -1)
	spent, err := s.q.SpentBetween(ctx, store.SpentBetweenParams{UserID: a.UserID, FromDate: m, ToDate: end})
	if err != nil {
		return Summary{}, err
	}
	out := Summary{
		Month: datex.NewMonth(m), Currency: u.Currency, Income: t.Income, FixedCommitted: t.FixedCommitted,
		FixedPaid: t.FixedPaid, Installments: t.Installments, Spent: spent, Budgets: []BudgetStatus{},
	}
	out.Available = out.Income - out.FixedCommitted - out.Installments - out.Spent
	if per, days, ok := SafeToSpend(out.Available, today, m); ok {
		d := int32(days)
		out.SafeToSpendPerDay, out.DaysRemaining = &per, &d
	}
	rows, err := s.q.BudgetStatus(ctx, store.BudgetStatusParams{UserID: a.UserID, Month: m})
	if err != nil {
		return Summary{}, err
	}
	for _, r := range rows {
		out.Budgets = append(out.Budgets, BudgetStatus{CategoryID: r.CategoryID, Name: r.Name, Color: r.Color,
			Limit: r.MonthlyLimit, Spent: r.Spent, Pct: int32(r.Spent * 100 / r.MonthlyLimit)})
	}
	return out, nil
}

type CategoryBudget struct {
	CategoryID   int64 `json:"category_id"`
	MonthlyLimit int64 `json:"monthly_limit"`
}

func (s *Service) ListCategoryBudgets(ctx context.Context, a Actor) ([]CategoryBudget, error) {
	rows, err := s.q.ListCategoryBudgets(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	out := make([]CategoryBudget, len(rows))
	for i, r := range rows {
		out[i] = CategoryBudget{CategoryID: r.CategoryID, MonthlyLimit: r.MonthlyLimit}
	}
	return out, nil
}

func (s *Service) PutCategoryBudget(ctx context.Context, a Actor, categoryID, limit int64) (CategoryBudget, error) {
	var v apperr.V
	checkAmount(&v, "monthly_limit", limit)
	if err := v.Err(); err != nil {
		return CategoryBudget{}, err
	}
	if err := s.checkCategoryRef(ctx, s.q, a.UserID, categoryID, "expense", "category_id"); err != nil {
		return CategoryBudget{}, err
	}
	r, err := s.q.UpsertCategoryBudget(ctx, store.UpsertCategoryBudgetParams{UserID: a.UserID, CategoryID: categoryID, MonthlyLimit: limit})
	if err != nil {
		return CategoryBudget{}, err
	}
	return CategoryBudget{CategoryID: r.CategoryID, MonthlyLimit: r.MonthlyLimit}, nil
}

func (s *Service) DeleteCategoryBudget(ctx context.Context, a Actor, categoryID int64) error {
	n, err := s.q.DeleteCategoryBudget(ctx, store.DeleteCategoryBudgetParams{UserID: a.UserID, CategoryID: categoryID})
	if err != nil {
		return err
	}
	if n == 0 {
		return apperr.NotFound()
	}
	return nil
}
```

- [ ] **Step 5: Add `queryMonth` to `respond.go`**

```go
func queryMonth(c *gin.Context, key string) (*time.Time, bool) {
	v := c.Query(key)
	if v == "" {
		return nil, true
	}
	t, err := datex.ParseMonth(v)
	if err != nil {
		fail(c, apperr.BadRequest(key+": "+err.Error()))
		return nil, false
	}
	return &t, true
}
```

- [ ] **Step 6: Handlers** `api/internal/httpapi/dashboard.go`

```go
package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type budgetInput struct {
	MonthlyLimit int64 `json:"monthly_limit"`
}

// dashboardSummary godoc
// @Summary  Month summary: income, fixed, installments, spent, available, safe-to-spend, budgets
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Param    month query string false "YYYY-MM (default: current month in the user's timezone)"
// @Success  200 {object} service.Summary
// @Router   /dashboard/summary [get]
func (h *handlers) dashboardSummary(c *gin.Context) {
	m, ok := queryMonth(c, "month")
	if !ok {
		return
	}
	out, err := h.svc.Summary(c.Request.Context(), actorOf(c), m)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// listCategoryBudgets godoc
// @Summary  List monthly category limits
// @Tags     budgets
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.CategoryBudget}
// @Router   /category-budgets [get]
func (h *handlers) listCategoryBudgets(c *gin.Context) {
	list, err := h.svc.ListCategoryBudgets(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// putCategoryBudget godoc
// @Summary  Set (create or replace) a category's monthly limit
// @Tags     budgets
// @Accept   json
// @Produce  json
// @Security BearerAuth
// @Param    id   path     int         true "expense category id"
// @Param    body body     budgetInput true "limit in cents"
// @Success  200  {object} service.CategoryBudget
// @Router   /category-budgets/{id} [put]
func (h *handlers) putCategoryBudget(c *gin.Context) {
	id, ok := pathID(c)
	var in budgetInput
	if !ok || !bind(c, &in) {
		return
	}
	out, err := h.svc.PutCategoryBudget(c.Request.Context(), actorOf(c), id, in.MonthlyLimit)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteCategoryBudget godoc
// @Summary  Remove a category's monthly limit
// @Tags     budgets
// @Security BearerAuth
// @Param    id path int true "category id"
// @Success  204
// @Router   /category-budgets/{id} [delete]
func (h *handlers) deleteCategoryBudget(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteCategoryBudget(c.Request.Context(), actorOf(c), id); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 7: Register the routes** (append in `routes`)

```go
	p.GET("/dashboard/summary", h.dashboardSummary)
	p.GET("/category-budgets", h.listCategoryBudgets)
	p.PUT("/category-budgets/:id", h.putCategoryBudget)
	p.DELETE("/category-budgets/:id", h.deleteCategoryBudget)
```

- [ ] **Step 8: Run the tests.** Run `go test ./internal/...`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add api && git commit -m "feat(api): dashboard month summary with safe-to-spend and category budgets"
```

---

### Task 14: Dashboard series, breakdown, card overview, upcoming dues

**Files:**
- Modify: `api/queries/dashboard.sql`, `api/internal/service/dashboard.go`, `api/internal/httpapi/dashboard.go`, `api/internal/httpapi/router.go`
- Create: `api/internal/httpapi/dashboard2_test.go`

**Interfaces:**
- Consumes: `ensureMonth`, `loadCard`, `(cardState).compute`, `utilization`, `cards.RelevantCycle`
- Produces:
  - `service.SeriesPoint{Start datex.Date; Expenses, Committed int64}` and `(*Service).Series(ctx, a, period string, from, to time.Time) ([]SeriesPoint, error)`
  - `service.BreakdownItem{ID *int64; Name, Color string; Amount int64}` and `(*Service).Breakdown(ctx, a, by string, from, to time.Time)`
  - `service.CardSummary{PaymentMethodID, Nickname, Color, Last4 *string, CurrentBalance, CreditLimit *int64, AvailableCredit *int64, Utilization *float64, Cycle datex.Month, AmountDue, DueOn datex.Date}` and `(*Service).CardsOverview(ctx, a)`
  - `service.UpcomingItem{Type string; Date datex.Date; Name string; Amount int64; EntryID, PaymentMethodID *int64; Overdue bool}` and `(*Service).Upcoming(ctx, a, days int)`
  - internal `(*Service).ensureRange(ctx, a, from, to time.Time) error`

- [ ] **Step 1: Queries.** Append to `api/queries/dashboard.sql`:

```sql
-- name: SpendingSeries :many
WITH buckets AS (
    SELECT gs::date AS start
    FROM generate_series(date_trunc(@period::text, @from_date::date::timestamp),
                         date_trunc(@period::text, @to_date::date::timestamp),
                         ('1 ' || @period::text)::interval) AS gs
),
ex AS (
    SELECT date_trunc(@period::text, e.spent_on::timestamp)::date AS start, SUM(e.amount) AS total
    FROM expenses e
    WHERE e.user_id = @user_id AND e.spent_on BETWEEN @from_date::date AND @to_date::date
    GROUP BY 1
),
fx AS (
    SELECT date_trunc(@period::text, m.due_date::timestamp)::date AS start, SUM(m.amount) AS total
    FROM monthly_entries m
    WHERE m.user_id = @user_id AND m.kind IN ('fixed', 'installment') AND m.status <> 'skipped'
      AND m.due_date BETWEEN @from_date::date AND @to_date::date
    GROUP BY 1
)
SELECT b.start::date AS start, COALESCE(ex.total, 0)::bigint AS expenses, COALESCE(fx.total, 0)::bigint AS committed
FROM buckets b
LEFT JOIN ex ON ex.start = b.start
LEFT JOIN fx ON fx.start = b.start
ORDER BY b.start;

-- name: BreakdownByCategory :many
SELECT c.id, c.name, c.color, SUM(x.amount)::bigint AS amount
FROM (
    SELECT e.category_id, e.amount FROM expenses e
    WHERE e.user_id = @user_id AND e.spent_on BETWEEN @from_date::date AND @to_date::date
    UNION ALL
    SELECT m.category_id, m.amount FROM monthly_entries m
    WHERE m.user_id = @user_id AND m.kind IN ('fixed', 'installment') AND m.status <> 'skipped'
      AND m.due_date BETWEEN @from_date::date AND @to_date::date
) x
JOIN categories c ON c.id = x.category_id
GROUP BY c.id, c.name, c.color
ORDER BY amount DESC, c.name;

-- name: BreakdownByPaymentMethod :many
SELECT pm.id, pm.nickname, pm.color, SUM(x.amount)::bigint AS amount
FROM (
    SELECT e.payment_method_id, e.amount FROM expenses e
    WHERE e.user_id = @user_id AND e.spent_on BETWEEN @from_date::date AND @to_date::date
    UNION ALL
    SELECT m.payment_method_id, m.amount FROM monthly_entries m
    WHERE m.user_id = @user_id AND m.kind IN ('fixed', 'installment') AND m.status <> 'skipped'
      AND m.due_date BETWEEN @from_date::date AND @to_date::date
) x
LEFT JOIN payment_methods pm ON pm.id = x.payment_method_id
GROUP BY pm.id, pm.nickname, pm.color
ORDER BY amount DESC;

-- name: UpcomingFixedEntries :many
SELECT * FROM monthly_entries
WHERE user_id = @user_id AND kind = 'fixed' AND status = 'pending'
  AND due_date BETWEEN @from_date::date AND @to_date::date
ORDER BY due_date, id;
```

Run `sqlc generate`. In `BreakdownByPaymentMethod` the `pm.*` columns come from a LEFT JOIN, so they are pointers (`ID *int64`, `Nickname *string`, `Color *string`). If sqlc emits non-pointer types, wrap them with `COALESCE`/`NULLIF` accordingly. The test below pins the "no method" row's `id` to `null`.

- [ ] **Step 2: Write the failing tests** `api/internal/httpapi/dashboard2_test.go`

```go
package httpapi_test

import (
	"fmt"
	"testing"
)

type point struct {
	Start     string `json:"start"`
	Expenses  int64  `json:"expenses"`
	Committed int64  `json:"committed"`
}

type breakdown struct {
	ID     *int64 `json:"id"`
	Name   string `json:"name"`
	Amount int64  `json:"amount"`
}

func TestSeries(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("series@example.com")
	h.expense(tok, "Comida", 100, "2026-03-01", "", nil)
	h.expense(tok, "Comida", 200, "2026-03-03", "", nil)
	h.fixed(tok, "Renta", 1000, 5, "2026-01", nil)

	day := expect[list[point]](t, h.do("GET", "/api/v1/dashboard/series?period=day&from=2026-03-01&to=2026-03-05", tok, nil), 200).Items
	if len(day) != 5 || day[0].Expenses != 100 || day[1].Expenses != 0 || day[2].Expenses != 200 || day[4].Committed != 1000 {
		t.Fatalf("day %+v", day)
	}
	week := expect[list[point]](t, h.do("GET", "/api/v1/dashboard/series?period=week&from=2026-03-01&to=2026-03-15", tok, nil), 200).Items
	if len(week) != 3 || week[0].Start != "2026-02-23" || week[0].Expenses != 100 || week[1].Expenses != 200 || week[1].Committed != 1000 {
		t.Fatalf("week %+v", week)
	}
	month := expect[list[point]](t, h.do("GET", "/api/v1/dashboard/series?period=month&from=2026-01-01&to=2026-03-31", tok, nil), 200).Items
	if len(month) != 3 || month[0].Committed != 1000 || month[2].Expenses != 300 {
		t.Fatalf("month %+v", month)
	}
	for _, q := range []string{"period=year&from=2026-01-01&to=2026-01-02", "period=day&from=2026-03-02&to=2026-03-01", "period=day&from=2025-01-01&to=2026-03-01"} {
		if r := h.do("GET", "/api/v1/dashboard/series?"+q, tok, nil); r.Code != 422 {
			t.Errorf("%s: %d", q, r.Code)
		}
	}
}

func TestBreakdown(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("brk@example.com")
	cc := h.creditCard(tok)
	h.expense(tok, "Comida", 400, "2026-03-01", "", &cc)
	h.expense(tok, "Comida", 200, "2026-03-02", "", nil)
	h.expense(tok, "Transporte", 100, "2026-03-02", "", nil)

	cat := expect[list[breakdown]](t, h.do("GET", "/api/v1/dashboard/breakdown?by=category&from=2026-03-01&to=2026-03-31", tok, nil), 200).Items
	if len(cat) != 2 || cat[0].Name != "Comida" || cat[0].Amount != 600 {
		t.Fatalf("by category %+v", cat)
	}
	pm := expect[list[breakdown]](t, h.do("GET", "/api/v1/dashboard/breakdown?by=payment_method&from=2026-03-01&to=2026-03-31", tok, nil), 200).Items
	if len(pm) != 2 || pm[0].ID == nil || *pm[0].ID != cc || pm[0].Amount != 400 || pm[1].ID != nil || pm[1].Amount != 300 {
		t.Fatalf("by payment method %+v", pm)
	}
	if r := h.do("GET", "/api/v1/dashboard/breakdown?by=color&from=2026-03-01&to=2026-03-31", tok, nil); r.Code != 422 {
		t.Fatalf("bad by: %d", r.Code)
	}
}

func TestCardsOverviewAndUpcoming(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("up@example.com")
	cc := h.creditCard(tok) // closes 15, due 5
	h.expense(tok, "Comida", 40000, "2026-03-10", "", &cc)
	h.fixed(tok, "Luz", 50000, 10, "2026-03", nil)     // due 03-10, pending → overdue
	h.fixed(tok, "Internet", 60000, 20, "2026-03", nil) // due 03-20

	cards := expect[list[M]](t, h.do("GET", "/api/v1/dashboard/cards", tok, nil), 200).Items
	if len(cards) != 1 || cards[0]["amount_due"].(float64) != 40000 || cards[0]["due_on"] != "2026-04-05" || cards[0]["current_balance"].(float64) != 40000 {
		t.Fatalf("cards %+v", cards)
	}

	// Window 03-15..04-14 (+30 days back for overdue): Luz 03-10 (overdue), Internet 03-20,
	// card due 04-05, Luz 04-10.
	up := expect[list[M]](t, h.do("GET", "/api/v1/dashboard/upcoming?days=30", tok, nil), 200).Items
	if len(up) != 4 {
		t.Fatalf("upcoming %+v", up)
	}
	if up[0]["name"] != "Luz" || up[0]["overdue"] != true || up[1]["name"] != "Internet" || up[2]["type"] != "card" ||
		up[2]["date"] != "2026-04-05" || up[3]["date"] != "2026-04-10" || up[3]["overdue"] != false {
		t.Fatalf("order/flags %+v", up)
	}
	if short := expect[list[M]](t, h.do("GET", "/api/v1/dashboard/upcoming?days=7", tok, nil), 200).Items; len(short) != 2 {
		t.Fatalf("7-day window %+v", short)
	}
	if r := h.do("GET", "/api/v1/dashboard/upcoming?days=90", tok, nil); r.Code != 422 {
		t.Fatalf("days=90: %d", r.Code)
	}
	_ = fmt.Sprint(cc)
}
```

Run `go test ./internal/httpapi/ -run 'Series|Breakdown|CardsOverview'`. Expected: FAIL.

- [ ] **Step 3: Implement.** Append to `api/internal/service/dashboard.go` and add the imports `"cmp"`, `"slices"`, `"financego/internal/cards"`:

```go
type SeriesPoint struct {
	Start     datex.Date `json:"start"`
	Expenses  int64      `json:"expenses"`
	Committed int64      `json:"committed"`
}

type BreakdownItem struct {
	ID     *int64 `json:"id"`
	Name   string `json:"name"`
	Color  string `json:"color"`
	Amount int64  `json:"amount"`
}

type CardSummary struct {
	PaymentMethodID int64       `json:"payment_method_id"`
	Nickname        string      `json:"nickname"`
	Color           string      `json:"color"`
	Last4           *string     `json:"last4"`
	CurrentBalance  int64       `json:"current_balance"`
	CreditLimit     *int64      `json:"credit_limit"`
	AvailableCredit *int64      `json:"available_credit"`
	Utilization     *float64    `json:"utilization"`
	Cycle           datex.Month `json:"cycle"`
	AmountDue       int64       `json:"amount_due"`
	DueOn           datex.Date  `json:"due_on"`
}

type UpcomingItem struct {
	Type            string     `json:"type"`
	Date            datex.Date `json:"date"`
	Name            string     `json:"name"`
	Amount          int64      `json:"amount"`
	EntryID         *int64     `json:"entry_id"`
	PaymentMethodID *int64     `json:"payment_method_id"`
	Overdue         bool       `json:"overdue"`
}

func checkRange(from, to time.Time, maxDays int) error {
	var v apperr.V
	v.Check(!to.Before(from), "to", "must not be before from")
	v.Check(int(to.Sub(from).Hours()/24) < maxDays, "from", "range is too long")
	return v.Err()
}

// ensureRange materializes every month touched by [from, to], up to the
// 12-month generation horizon.
func (s *Service) ensureRange(ctx context.Context, a Actor, from, to time.Time) error {
	horizon := datex.AddMonths(datex.MonthStart(s.today(a)), maxMonthsAhead)
	for m := datex.MonthStart(from); !m.After(to) && !m.After(horizon); m = datex.AddMonths(m, 1) {
		if err := s.ensureMonth(ctx, s.q, a, m); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) Series(ctx context.Context, a Actor, period string, from, to time.Time) ([]SeriesPoint, error) {
	maxDays := 5*366 + 1
	switch period {
	case "day":
		maxDays = 367
	case "week", "month":
	default:
		return nil, apperr.Validation(map[string]string{"period": "must be day, week or month"})
	}
	if err := checkRange(from, to, maxDays); err != nil {
		return nil, err
	}
	if err := s.ensureRange(ctx, a, from, to); err != nil {
		return nil, err
	}
	rows, err := s.q.SpendingSeries(ctx, store.SpendingSeriesParams{UserID: a.UserID, Period: period, FromDate: from, ToDate: to})
	if err != nil {
		return nil, err
	}
	out := make([]SeriesPoint, len(rows))
	for i, r := range rows {
		out[i] = SeriesPoint{Start: datex.NewDate(r.Start), Expenses: r.Expenses, Committed: r.Committed}
	}
	return out, nil
}

func (s *Service) Breakdown(ctx context.Context, a Actor, by string, from, to time.Time) ([]BreakdownItem, error) {
	if by != "category" && by != "payment_method" {
		return nil, apperr.Validation(map[string]string{"by": "must be category or payment_method"})
	}
	if err := checkRange(from, to, 5*366+1); err != nil {
		return nil, err
	}
	if err := s.ensureRange(ctx, a, from, to); err != nil {
		return nil, err
	}
	out := []BreakdownItem{}
	if by == "category" {
		rows, err := s.q.BreakdownByCategory(ctx, store.BreakdownByCategoryParams{UserID: a.UserID, FromDate: from, ToDate: to})
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			id := r.ID
			out = append(out, BreakdownItem{ID: &id, Name: r.Name, Color: r.Color, Amount: r.Amount})
		}
		return out, nil
	}
	rows, err := s.q.BreakdownByPaymentMethod(ctx, store.BreakdownByPaymentMethodParams{UserID: a.UserID, FromDate: from, ToDate: to})
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		item := BreakdownItem{ID: r.ID, Amount: r.Amount, Color: "#94a3b8"}
		if r.Nickname != nil {
			item.Name = *r.Nickname
		}
		if r.Color != nil {
			item.Color = *r.Color
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *Service) CardsOverview(ctx context.Context, a Actor) ([]CardSummary, error) {
	pms, err := s.q.ListCreditCards(ctx, a.UserID)
	if err != nil {
		return nil, err
	}
	today := s.today(a)
	out := []CardSummary{}
	for _, pm := range pms {
		st, err := s.loadCard(ctx, s.q, a.UserID, pm)
		if err != nil {
			return nil, err
		}
		r := st.compute(cards.RelevantCycle(today, st.card.StatementDay, st.card.DueDay))
		util, avail := utilization(r.CurrentBalance, pm.CreditLimit)
		out = append(out, CardSummary{PaymentMethodID: pm.ID, Nickname: pm.Nickname, Color: pm.Color, Last4: pm.Last4,
			CurrentBalance: r.CurrentBalance, CreditLimit: pm.CreditLimit, AvailableCredit: avail, Utilization: util,
			Cycle: datex.NewMonth(r.Cycle), AmountDue: r.AmountDue, DueOn: datex.NewDate(r.Due)})
	}
	return out, nil
}

// Upcoming lists pending fixed payments due within `days` (plus overdue ones
// from the last 30 days) and credit-card payments due in the window. MSI
// installments are inside each card's amount due, so they are not listed alone.
func (s *Service) Upcoming(ctx context.Context, a Actor, days int) ([]UpcomingItem, error) {
	if days < 7 || days > 60 {
		return nil, apperr.Validation(map[string]string{"days": "must be between 7 and 60"})
	}
	today := s.today(a)
	until := today.AddDate(0, 0, days)
	if err := s.ensureRange(ctx, a, today.AddDate(0, 0, -30), until); err != nil {
		return nil, err
	}
	rows, err := s.q.UpcomingFixedEntries(ctx, store.UpcomingFixedEntriesParams{UserID: a.UserID, FromDate: today.AddDate(0, 0, -30), ToDate: until})
	if err != nil {
		return nil, err
	}
	out := []UpcomingItem{}
	for _, e := range rows {
		id := e.ID
		out = append(out, UpcomingItem{Type: "fixed", Date: datex.NewDate(e.DueDate), Name: e.Name, Amount: e.Amount,
			EntryID: &id, PaymentMethodID: e.PaymentMethodID, Overdue: e.DueDate.Before(today)})
	}
	cardsDue, err := s.CardsOverview(ctx, a)
	if err != nil {
		return nil, err
	}
	for _, c := range cardsDue {
		if c.AmountDue > 0 && !c.DueOn.Before(today) && !c.DueOn.After(until) {
			id := c.PaymentMethodID
			out = append(out, UpcomingItem{Type: "card", Date: c.DueOn, Name: c.Nickname, Amount: c.AmountDue, PaymentMethodID: &id})
		}
	}
	slices.SortStableFunc(out, func(x, y UpcomingItem) int { return cmp.Compare(x.Date.Unix(), y.Date.Unix()) })
	return out, nil
}
```

- [ ] **Step 4: Handlers.** Append to `api/internal/httpapi/dashboard.go` and add the imports `"strconv"`, `"time"`, `"financego/internal/apperr"`:

```go
func requiredRange(c *gin.Context) (time.Time, time.Time, bool) {
	from, ok := queryDate(c, "from")
	if !ok {
		return time.Time{}, time.Time{}, false
	}
	to, ok := queryDate(c, "to")
	if !ok {
		return time.Time{}, time.Time{}, false
	}
	if from == nil || to == nil {
		fail(c, apperr.BadRequest("from and to are required (YYYY-MM-DD)"))
		return time.Time{}, time.Time{}, false
	}
	return *from, *to, true
}

// dashboardSeries godoc
// @Summary  Spending per day, ISO week or month (empty buckets are 0)
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Param    period query string true "day, week or month"
// @Param    from   query string true "YYYY-MM-DD"
// @Param    to     query string true "YYYY-MM-DD"
// @Success  200 {object} object{items=[]service.SeriesPoint}
// @Router   /dashboard/series [get]
func (h *handlers) dashboardSeries(c *gin.Context) {
	from, to, ok := requiredRange(c)
	if !ok {
		return
	}
	list, err := h.svc.Series(c.Request.Context(), actorOf(c), c.Query("period"), from, to)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// dashboardBreakdown godoc
// @Summary  Spending grouped by category or payment method
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Param    by   query string true "category or payment_method"
// @Param    from query string true "YYYY-MM-DD"
// @Param    to   query string true "YYYY-MM-DD"
// @Success  200 {object} object{items=[]service.BreakdownItem}
// @Router   /dashboard/breakdown [get]
func (h *handlers) dashboardBreakdown(c *gin.Context) {
	from, to, ok := requiredRange(c)
	if !ok {
		return
	}
	list, err := h.svc.Breakdown(c.Request.Context(), actorOf(c), c.Query("by"), from, to)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// dashboardCards godoc
// @Summary  Debt summary per active credit card
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Success  200 {object} object{items=[]service.CardSummary}
// @Router   /dashboard/cards [get]
func (h *handlers) dashboardCards(c *gin.Context) {
	list, err := h.svc.CardsOverview(c.Request.Context(), actorOf(c))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}

// dashboardUpcoming godoc
// @Summary  Upcoming fixed payments and card payment due dates
// @Tags     dashboard
// @Produce  json
// @Security BearerAuth
// @Param    days query int false "7-60, default 7"
// @Success  200 {object} object{items=[]service.UpcomingItem}
// @Router   /dashboard/upcoming [get]
func (h *handlers) dashboardUpcoming(c *gin.Context) {
	days := 7
	if v := c.Query("days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			fail(c, apperr.BadRequest("days: must be an integer"))
			return
		}
		days = n
	}
	list, err := h.svc.Upcoming(c.Request.Context(), actorOf(c), days)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, items(list))
}
```

- [ ] **Step 5: Register the routes** (append in `routes`)

```go
	p.GET("/dashboard/series", h.dashboardSeries)
	p.GET("/dashboard/breakdown", h.dashboardBreakdown)
	p.GET("/dashboard/cards", h.dashboardCards)
	p.GET("/dashboard/upcoming", h.dashboardUpcoming)
```

- [ ] **Step 6: Run the tests.** Run `go test ./internal/...`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api && git commit -m "feat(api): dashboard series, breakdowns, card overview and upcoming dues"
```

---
### Task 15: CSV export and account deletion

**Files:**
- Modify: `api/queries/dashboard.sql` (export queries), `api/internal/httpapi/router.go`, `api/internal/httpapi/auth.go` (delete-account handler)
- Create: `api/internal/service/export.go`, `api/internal/service/export_test.go`, `api/internal/httpapi/export.go`, `api/internal/httpapi/export_test.go`

**Interfaces:**
- Produces:
  - `service.FormatCents(c int64) string` (for example `"-12.34"`)
  - `(*Service).ExportExpensesCSV(ctx, a, from, to time.Time, w io.Writer) error`, `(*Service).ExportEntriesCSV(ctx, a, from, to time.Time, w io.Writer) error`
  - `(*Service).DeleteAccount(ctx, a, password string) error`, which returns 422 `validation_failed` with the field `password` when the password is wrong

- [ ] **Step 1: Queries.** Append to `api/queries/dashboard.sql`:

```sql
-- name: ExportExpenses :many
SELECT e.spent_on, c.name AS category, pm.nickname AS payment_method, e.description, e.amount
FROM expenses e
JOIN categories c ON c.id = e.category_id
LEFT JOIN payment_methods pm ON pm.id = e.payment_method_id
WHERE e.user_id = @user_id AND e.spent_on BETWEEN @from_date::date AND @to_date::date
ORDER BY e.spent_on, e.id;

-- name: ExportEntries :many
SELECT m.month, m.kind, m.name, c.name AS category, pm.nickname AS payment_method, m.due_date, m.status, m.amount
FROM monthly_entries m
LEFT JOIN categories c ON c.id = m.category_id
LEFT JOIN payment_methods pm ON pm.id = m.payment_method_id
WHERE m.user_id = @user_id AND m.due_date BETWEEN @from_date::date AND @to_date::date
ORDER BY m.due_date, m.id;
```

Run `sqlc generate`.

- [ ] **Step 2: Write the failing unit test** `api/internal/service/export_test.go`

```go
package service

import "testing"

func TestFormatCents(t *testing.T) {
	for in, want := range map[int64]string{0: "0.00", 5: "0.05", 1234: "12.34", -1234: "-12.34", 100000000: "1000000.00"} {
		if got := FormatCents(in); got != want {
			t.Errorf("FormatCents(%d)=%q want %q", in, got, want)
		}
	}
}
```

- [ ] **Step 3: Write the failing integration tests** `api/internal/httpapi/export_test.go`

```go
package httpapi_test

import (
	"context"
	"strings"
	"testing"
)

func TestExportExpensesCSV(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("csv@example.com")
	cc := h.creditCard(tok)
	h.expense(tok, "Comida", 12345, "2026-03-02", `Tacos "El Güero", centro`, &cc)
	h.expense(tok, "Salud", 500, "2026-03-01", "", nil)
	h.expense(tok, "Salud", 999, "2026-04-01", "fuera de rango", nil)

	r := h.do("GET", "/api/v1/export/expenses.csv?from=2026-03-01&to=2026-03-31", tok, nil)
	if r.Code != 200 || !strings.HasPrefix(r.Header.Get("Content-Type"), "text/csv") ||
		!strings.Contains(r.Header.Get("Content-Disposition"), `filename="expenses_2026-03-01_2026-03-31.csv"`) {
		t.Fatalf("headers %d %v", r.Code, r.Header)
	}
	want := "\ufeffdate,category,payment_method,description,amount\n" +
		"2026-03-01,Salud,,,5.00\n" +
		"2026-03-02,Comida,BBVA Oro,\"Tacos \"\"El Güero\"\", centro\",123.45\n"
	if string(r.Body) != want {
		t.Fatalf("csv:\n%q\nwant:\n%q", r.Body, want)
	}
	if r := h.do("GET", "/api/v1/export/expenses.csv", tok, nil); r.Code != 400 {
		t.Fatalf("missing range: %d", r.Code)
	}
}

func TestExportEntriesCSV(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("csv2@example.com")
	h.fixed(tok, "Renta", 1000000, 1, "2026-03", nil)
	h.entries(tok, "2026-03")
	r := h.do("GET", "/api/v1/export/entries.csv?from=2026-03-01&to=2026-03-31", tok, nil)
	want := "\ufeffmonth,kind,name,category,payment_method,due_date,status,amount\n" +
		"2026-03,fixed,Renta,Vivienda,,2026-03-01,pending,10000.00\n"
	if r.Code != 200 || string(r.Body) != want {
		t.Fatalf("entries csv %d:\n%q", r.Code, r.Body)
	}
}

func TestDeleteAccount(t *testing.T) {
	h := newHarness(t)
	tok := h.signup("bye@example.com")
	if r := h.do("DELETE", "/api/v1/me", tok, M{"password": "nope-nope"}); r.Code != 422 || errFields(r)["password"] == "" {
		t.Fatalf("wrong password: %d %s", r.Code, r.Body)
	}
	if r := h.do("DELETE", "/api/v1/me", tok, M{"password": "password123"}); r.Code != 204 {
		t.Fatalf("delete: %d %s", r.Code, r.Body)
	}
	if r := h.do("GET", "/api/v1/me", tok, nil); r.Code != 401 {
		t.Fatalf("token still works: %d", r.Code)
	}
	var n int
	_ = h.pool.QueryRow(context.Background(), "SELECT count(*) FROM categories").Scan(&n)
	if n != 0 {
		t.Fatalf("categories left behind: %d", n)
	}
}
```

Run `go test ./internal/service/ ./internal/httpapi/ -run 'FormatCents|Export|DeleteAccount'`. Expected: FAIL.

- [ ] **Step 4: Implement** `api/internal/service/export.go`

```go
package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"time"

	"financego/internal/apperr"
	"financego/internal/auth"
	"financego/internal/store"
)

// FormatCents renders cents as a plain decimal ("1234.50"), the format spreadsheets import cleanly.
func FormatCents(c int64) string {
	sign := ""
	if c < 0 {
		sign, c = "-", -c
	}
	return fmt.Sprintf("%s%d.%02d", sign, c/100, c%100)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func checkExportRange(from, to time.Time) error {
	return checkRange(from, to, 5*366+1)
}

// newCSV writes a UTF-8 BOM (so Excel detects the encoding) and returns a writer.
func newCSV(w io.Writer, header ...string) (*csv.Writer, error) {
	if _, err := io.WriteString(w, "\ufeff"); err != nil {
		return nil, err
	}
	cw := csv.NewWriter(w)
	return cw, cw.Write(header)
}

func (s *Service) ExportExpensesCSV(ctx context.Context, a Actor, from, to time.Time, w io.Writer) error {
	if err := checkExportRange(from, to); err != nil {
		return err
	}
	rows, err := s.q.ExportExpenses(ctx, store.ExportExpensesParams{UserID: a.UserID, FromDate: from, ToDate: to})
	if err != nil {
		return err
	}
	cw, err := newCSV(w, "date", "category", "payment_method", "description", "amount")
	if err != nil {
		return err
	}
	for _, r := range rows {
		if err := cw.Write([]string{r.SpentOn.Format(time.DateOnly), r.Category, deref(r.PaymentMethod), r.Description, FormatCents(r.Amount)}); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

func (s *Service) ExportEntriesCSV(ctx context.Context, a Actor, from, to time.Time, w io.Writer) error {
	if err := checkExportRange(from, to); err != nil {
		return err
	}
	rows, err := s.q.ExportEntries(ctx, store.ExportEntriesParams{UserID: a.UserID, FromDate: from, ToDate: to})
	if err != nil {
		return err
	}
	cw, err := newCSV(w, "month", "kind", "name", "category", "payment_method", "due_date", "status", "amount")
	if err != nil {
		return err
	}
	for _, r := range rows {
		if err := cw.Write([]string{r.Month.Format("2006-01"), r.Kind, r.Name, deref(r.Category), deref(r.PaymentMethod),
			r.DueDate.Format(time.DateOnly), r.Status, FormatCents(r.Amount)}); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

// DeleteAccount permanently removes the user and, by cascade, all their data.
func (s *Service) DeleteAccount(ctx context.Context, a Actor, password string) error {
	u, err := s.q.GetUser(ctx, a.UserID)
	if err != nil {
		return notFound(err)
	}
	ok, err := auth.VerifyPassword(u.PasswordHash, password)
	if err != nil {
		return err
	}
	if !ok {
		return apperr.Validation(map[string]string{"password": "is incorrect"})
	}
	_, err = s.q.DeleteUser(ctx, a.UserID)
	return err
}
```

`csv.Writer` uses `\n` line endings by default, which is what the test expects. The `ExportExpensesRow.Category` column comes from an inner JOIN, so it is a `string`. The `Category` in `ExportEntriesRow` and every `PaymentMethod` column come from LEFT JOINs, so they are `*string`. If sqlc infers them differently, adjust the `deref` calls to match.

- [ ] **Step 5: Handlers** `api/internal/httpapi/export.go`

```go
package httpapi

import (
	"bytes"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (h *handlers) sendCSV(c *gin.Context, name string, write func(from, to time.Time, buf *bytes.Buffer) error) {
	from, to, ok := requiredRange(c)
	if !ok {
		return
	}
	var buf bytes.Buffer
	if err := write(from, to, &buf); err != nil {
		fail(c, err)
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s_%s_%s.csv"`, name, from.Format(time.DateOnly), to.Format(time.DateOnly)))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}

// exportExpenses godoc
// @Summary  Download expenses as CSV
// @Tags     export
// @Produce  text/csv
// @Security BearerAuth
// @Param    from query string true "YYYY-MM-DD"
// @Param    to   query string true "YYYY-MM-DD"
// @Success  200 {file} file
// @Router   /export/expenses.csv [get]
func (h *handlers) exportExpenses(c *gin.Context) {
	h.sendCSV(c, "expenses", func(from, to time.Time, buf *bytes.Buffer) error {
		return h.svc.ExportExpensesCSV(c.Request.Context(), actorOf(c), from, to, buf)
	})
}

// exportEntries godoc
// @Summary  Download income, fixed and installment rows as CSV
// @Tags     export
// @Produce  text/csv
// @Security BearerAuth
// @Param    from query string true "YYYY-MM-DD"
// @Param    to   query string true "YYYY-MM-DD"
// @Success  200 {file} file
// @Router   /export/entries.csv [get]
func (h *handlers) exportEntries(c *gin.Context) {
	h.sendCSV(c, "entries", func(from, to time.Time, buf *bytes.Buffer) error {
		return h.svc.ExportEntriesCSV(c.Request.Context(), actorOf(c), from, to, buf)
	})
}
```

Append to `api/internal/httpapi/auth.go`:

```go
type deleteAccountInput struct {
	Password string `json:"password"`
}

// deleteMe godoc
// @Summary  Permanently delete the account and all its data
// @Tags     me
// @Accept   json
// @Security BearerAuth
// @Param    body body deleteAccountInput true "current password"
// @Success  204
// @Failure  422 {object} ErrorResponse
// @Router   /me [delete]
func (h *handlers) deleteMe(c *gin.Context) {
	var in deleteAccountInput
	if !bind(c, &in) {
		return
	}
	if err := h.svc.DeleteAccount(c.Request.Context(), actorOf(c), in.Password); err != nil {
		fail(c, err)
		return
	}
	h.setRefreshCookie(c, "", -1)
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 6: Register the routes** (append in `routes`)

```go
	p.DELETE("/me", h.deleteMe)
	p.GET("/export/expenses.csv", h.exportExpenses)
	p.GET("/export/entries.csv", h.exportEntries)
```

- [ ] **Step 7: Run the tests.** Run `go test ./internal/...`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api && git commit -m "feat(api): CSV export of expenses and entries, account deletion"
```

---

### Task 16: Cross-tenant isolation matrix

**Files:**
- Create: `api/internal/httpapi/tenancy_test.go`

**Interfaces:**
- Consumes: every endpoint and every harness helper from Tasks 6–15

- [ ] **Step 1: Write the matrix test**

```go
package httpapi_test

import (
	"fmt"
	"testing"
)

// TestCrossTenantMatrix: user B must never read, change or reference user A's data.
func TestCrossTenantMatrix(t *testing.T) {
	h := newHarness(t)
	a := h.signup("alice@example.com")
	b := h.signup("bob@example.com")

	aCard := h.creditCard(a)
	aCat := h.catID(a, "Comida")
	aInc := h.income(a, 100000, 1, "2026-01")
	aFix := h.fixed(a, "Renta", 50000, 1, "2026-01", &aCard)
	aEntry := h.entries(a, "2026-03")[0].ID
	aExp := h.expense(a, "Comida", 1000, "2026-03-01", "", &aCard)
	aPay := int64(expect[M](t, h.do("POST", "/api/v1/card-payments", a, M{"payment_method_id": aCard, "amount": 100, "paid_on": "2026-03-01"}), 201)["id"].(float64))
	aPlan := h.msi(a, aCard, 3000, 3, "2026-03-01").ID
	expect[M](t, h.do("PUT", fmt.Sprintf("/api/v1/category-budgets/%d", aCat), a, M{"monthly_limit": 100}), 200)

	bCat := h.catID(b, "Comida")
	bHome := h.catID(b, "Vivienda")
	bEnt := h.catID(b, "Entretenimiento")
	bCard := h.creditCard(b)

	notFound := []struct{ method, path string; body any }{
		{"PUT", fmt.Sprintf("/api/v1/categories/%d", aCat), M{"name": "x", "kind": "expense"}},
		{"DELETE", fmt.Sprintf("/api/v1/categories/%d", aCat), nil},
		{"GET", fmt.Sprintf("/api/v1/payment-methods/%d", aCard), nil},
		{"PUT", fmt.Sprintf("/api/v1/payment-methods/%d", aCard), M{"nickname": "x", "type": "credit", "statement_day": 1, "payment_due_day": 2}},
		{"DELETE", fmt.Sprintf("/api/v1/payment-methods/%d", aCard), nil},
		{"GET", fmt.Sprintf("/api/v1/payment-methods/%d/statement", aCard), nil},
		{"PUT", fmt.Sprintf("/api/v1/income-sources/%d", aInc), M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01"}},
		{"DELETE", fmt.Sprintf("/api/v1/income-sources/%d", aInc), nil},
		{"PUT", fmt.Sprintf("/api/v1/fixed-payments/%d", aFix), M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": bHome}},
		{"DELETE", fmt.Sprintf("/api/v1/fixed-payments/%d", aFix), nil},
		{"PUT", fmt.Sprintf("/api/v1/entries/%d", aEntry), M{"amount": 1, "status": "skipped"}},
		{"PUT", fmt.Sprintf("/api/v1/expenses/%d", aExp), M{"category_id": bCat, "amount": 1, "spent_on": "2026-03-01"}},
		{"DELETE", fmt.Sprintf("/api/v1/expenses/%d", aExp), nil},
		{"DELETE", fmt.Sprintf("/api/v1/card-payments/%d", aPay), nil},
		{"PUT", fmt.Sprintf("/api/v1/installment-plans/%d", aPlan), M{"payment_method_id": bCard, "category_id": bEnt, "description": "x", "total_amount": 300, "installments": 3, "purchased_on": "2026-03-01"}},
		{"DELETE", fmt.Sprintf("/api/v1/installment-plans/%d", aPlan), nil},
		{"DELETE", fmt.Sprintf("/api/v1/category-budgets/%d", aCat), nil},
	}
	for _, c := range notFound {
		if r := h.do(c.method, c.path, b, c.body); r.Code != 404 {
			t.Errorf("%s %s: %d %s (want 404)", c.method, c.path, r.Code, r.Body)
		}
	}

	badRef := []struct{ method, path string; body any }{
		{"POST", "/api/v1/expenses", M{"category_id": aCat, "amount": 1, "spent_on": "2026-03-01"}},
		{"POST", "/api/v1/expenses", M{"category_id": bCat, "amount": 1, "spent_on": "2026-03-01", "payment_method_id": aCard}},
		{"POST", "/api/v1/fixed-payments", M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": bHome, "payment_method_id": aCard}},
		{"POST", "/api/v1/income-sources", M{"name": "x", "amount": 1, "day_of_month": 1, "start_month": "2026-01", "category_id": aCat}},
		{"POST", "/api/v1/card-payments", M{"payment_method_id": aCard, "amount": 1, "paid_on": "2026-03-01"}},
		{"POST", "/api/v1/installment-plans", M{"payment_method_id": aCard, "category_id": bEnt, "description": "x", "total_amount": 300, "installments": 3, "purchased_on": "2026-03-01"}},
		{"PUT", fmt.Sprintf("/api/v1/category-budgets/%d", aCat), M{"monthly_limit": 100}},
		{"DELETE", fmt.Sprintf("/api/v1/categories/%d?reassign_to=%d", bCat, aCat), nil},
	}
	for _, c := range badRef {
		if r := h.do(c.method, c.path, b, c.body); r.Code != 422 || errCode(r) != "invalid_reference" {
			t.Errorf("%s %s: %d %s (want 422 invalid_reference)", c.method, c.path, r.Code, r.Body)
		}
	}

	// B's lists and dashboards contain nothing of A's.
	for _, path := range []string{"/api/v1/expenses", "/api/v1/income-sources", "/api/v1/fixed-payments", "/api/v1/card-payments",
		"/api/v1/installment-plans", "/api/v1/category-budgets", fmt.Sprintf("/api/v1/expenses?category_id=%d", aCat)} {
		if l := expect[list[M]](t, h.do("GET", path, b, nil), 200); len(l.Items) != 0 {
			t.Errorf("%s leaked %d items", path, len(l.Items))
		}
	}
	if s := expect[summary](t, h.do("GET", "/api/v1/dashboard/summary?month=2026-03", b, nil), 200); s.Income != 0 || s.Spent != 0 {
		t.Errorf("summary leaked %+v", s)
	}
	if es := h.entries(b, "2026-03"); len(es) != 0 {
		t.Errorf("entries leaked %+v", es)
	}
}
```

The body for `PUT /income-sources/{aInc}` has no `category_id`, so validation passes and the 404 lookup fires. For `DELETE /categories/{bCat}?reassign_to={aCat}`, the reassign target is checked for ownership, which gives 422 `invalid_reference`.

- [ ] **Step 2: Run the test.** Run `go test ./internal/httpapi/ -run CrossTenant -v`. Expected: PASS. If any row fails, fix the service method so that it looks up by `(id, user_id)` **before** validating the body. Do not loosen the test.

- [ ] **Step 3: Commit**

```bash
git add api && git commit -m "test(api): cross-tenant isolation matrix over every endpoint"
```

---

### Task 17: OpenAPI docs, Docker image, compose stack, lint, CI

**Files:**
- Create: `api/.swaggo`, `api/docs/*` (generated), `api/Dockerfile`, `api/.dockerignore`, `api/.air.toml`, `api/.golangci.yml`, `api/internal/httpapi/docs_test.go`, `docker-compose.override.yml`, `.github/workflows/ci.yml`, `README.md`
- Modify: `api/internal/httpapi/router.go`, `docker-compose.yml`, `.gitignore`

**Interfaces:**
- Produces: `GET /api/v1/docs/index.html` (Swagger UI) and `/api/v1/docs/doc.json` (OpenAPI 2 JSON; Plan 2 generates its TypeScript types from it); the image `financego-api`; the CI job `api`

- [ ] **Step 1: Map the datex types for swag and generate the docs**

`api/.swaggo`:

```
replace financego/internal/datex.Date string
replace financego/internal/datex.Month string
```

```bash
cd /c/dev/financego/api
go get github.com/swaggo/gin-swagger@latest github.com/swaggo/files@latest github.com/swaggo/swag@v1.16.4
swag init -g cmd/api/main.go -o docs --parseInternal
```

Expected: `docs/docs.go`, `docs/swagger.json` and `docs/swagger.yaml` are created. Check that `grep -c '"/expenses"' docs/swagger.json` prints `1` and that `grep '"spent_on"' -A2 docs/swagger.json` shows `"type": "string"`.

- [ ] **Step 2: Write the failing docs test** `api/internal/httpapi/docs_test.go`

```go
package httpapi_test

import (
	"strings"
	"testing"
)

func TestSwaggerServed(t *testing.T) {
	h := newHarness(t)
	r := h.do("GET", "/api/v1/docs/doc.json", "", nil)
	if r.Code != 200 || !strings.Contains(string(r.Body), `"/dashboard/summary"`) {
		t.Fatalf("docs: %d %.200s", r.Code, r.Body)
	}
}
```

Run it. Expected: FAIL (404).

- [ ] **Step 3: Serve the docs.** In `router.go`, add the imports `ginSwagger "github.com/swaggo/gin-swagger"`, `swaggerFiles "github.com/swaggo/files"` and `_ "financego/docs"`. Then add this before `h.routes(...)`:

```go
	r.GET("/api/v1/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
```

Run `go test ./internal/httpapi/ -run Swagger`. Expected: PASS.

- [ ] **Step 4: Container image** `api/Dockerfile`

```dockerfile
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/api"]
```

`api/.dockerignore`:

```
tmp
*.exe
.air.toml
**/*_test.go
```

- [ ] **Step 5: Add the api service to the compose stack.** Append this under `services:` in `docker-compose.yml`:

```yaml
  api:
    build: ./api
    image: financego-api
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-fin}:${POSTGRES_PASSWORD:-fin}@db:5432/${POSTGRES_DB:-finance}?sslmode=disable
      JWT_SECRET: ${JWT_SECRET:?set JWT_SECRET in .env}
      WEB_ORIGIN: ${WEB_ORIGIN:-http://localhost:3000}
      COOKIE_SECURE: ${COOKIE_SECURE:-false}
      AUTH_RATE_PER_MIN: ${AUTH_RATE_PER_MIN:-10}
    depends_on:
      db:
        condition: service_healthy
    ports: ["8080:8080"]
    restart: unless-stopped
```

`docker-compose.override.yml` (picked up automatically by `docker compose up`; for production use `docker compose -f docker-compose.yml up`):

```yaml
services:
  api:
    build: !reset null
    image: golang:1.26-alpine
    working_dir: /src
    command: sh -c "go install github.com/air-verse/air@latest && air -c .air.toml"
    volumes:
      - ./api:/src
      - gomod:/go/pkg/mod
volumes:
  gomod:
```

`api/.air.toml`:

```toml
root = "."
tmp_dir = "tmp"

[build]
cmd = "go build -o ./tmp/api ./cmd/api"
bin = "./tmp/api"
include_ext = ["go", "sql"]
exclude_dir = ["tmp", "docs"]
poll = true
```

Add `api/tmp/` to `.gitignore`.

- [ ] **Step 6: Lint config** `api/.golangci.yml`

```yaml
version: "2"
linters:
  default: standard
  enable:
    - errorlint
    - bodyclose
    - misspell
    - unconvert
  exclusions:
    paths:
      - internal/store
      - docs
```

- [ ] **Step 7: CI** `.github/workflows/ci.yml`

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  api:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: api/go.mod
          cache-dependency-path: api/go.sum
      - name: gofmt
        run: test -z "$(gofmt -l . | grep -v '^internal/store/' | grep -v '^docs/')"
      - run: go vet ./...
      - uses: golangci/golangci-lint-action@v8
        with:
          working-directory: api
          version: latest
      - name: tests (integration via testcontainers)
        run: go test ./...
      - name: generated code is current
        run: |
          go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.29.0
          go install github.com/swaggo/swag/cmd/swag@v1.16.4
          sqlc generate
          swag init -g cmd/api/main.go -o docs --parseInternal
          git diff --exit-code -- internal/store docs

  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t financego-api ./api
```

- [ ] **Step 8: README (API section)** `README.md`

````markdown
# FinanceGo

Multi-user personal finance app: expenses, recurring income and fixed payments, credit cards with MSI (meses sin intereses), and a daily/weekly/monthly dashboard.

- `api/`: Go (Gin, pgx, sqlc, goose), OpenAPI at `/api/v1/docs/index.html`
- `web/`: Next.js client (see Plan 2)
- Spec: `docs/superpowers/specs/2026-09-30-finance-app-design.md`

## Run

```bash
cp .env.example .env                           # set JWT_SECRET to a long random string
docker compose -f docker-compose.yml up --build  # production-like
docker compose up                                # dev: hot reload via air
```

API on http://localhost:8080 (`/healthz`, `/readyz`, `/api/v1/...`).

## Develop the API

```bash
cd api
go test -short ./...    # unit tests only
go test ./...           # + integration tests (Docker must be running)
sqlc generate           # after editing queries/*.sql
swag init -g cmd/api/main.go -o docs --parseInternal   # after changing handler annotations
```

Amounts are integer cents everywhere. Card data is reference-only: never store full card numbers.
````

- [ ] **Step 9: Verify the whole stack**

```bash
cd /c/dev/financego
gofmt -l api | grep -v internal/store | grep -v api/docs   # expect no output
(cd api && go vet ./... && go test ./...)
docker build -t financego-api ./api
cp -n .env.example .env
docker compose -f docker-compose.yml up -d --build db api
curl -s localhost:8080/readyz                    # {"status":"ok"}
curl -s -X POST localhost:8080/api/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"password123","name":"Demo","currency":"MXN","locale":"es","timezone":"America/Tijuana"}' | head -c 200
docker compose -f docker-compose.yml down
```

Expected: vet and the tests pass, the image builds, `readyz` returns ok, and the register call returns an `access_token`.

- [ ] **Step 10: Commit**

```bash
git add -A api docker-compose.yml docker-compose.override.yml .github README.md .gitignore
git commit -m "chore(api): OpenAPI docs, Docker image, compose stack, lint config, CI"
```

---

## Self-Review Notes (for the executor)

- **Spec coverage:** auth (§7) → Tasks 4 and 6; data model (§4) → Task 2; month generation and balance (§5.1–5.2) → Tasks 9 and 13; card debt and MSI (§5.4–5.5) → Tasks 11 and 12; upcoming (§5.6) → Task 14; API table (§6) → Tasks 6–15; export and deletion → Task 15; tenancy (§7) → Task 16; Docker and CI (§10) → Task 17. The web client, E2E tests and the web CI job are in Plan 2.
- **Generated code:** whenever `sqlc` names a param or row field differently from what this plan shows (for example `*int64` vs `int64` on a nullable column), follow the generated code and keep the behavior. Each such spot is flagged in a task note.
- **Clock:** the integration tests assume the harness clock starts at 2026-03-15 18:00 UTC. Tests that call `setNow` must get a new token (`h.login` / `h.signup`) afterwards.
