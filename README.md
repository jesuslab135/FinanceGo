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
