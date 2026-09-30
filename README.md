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

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | (required) | Postgres DSN |
| `JWT_SECRET` | (required) | at least 32 bytes; the `change-me` placeholder from `.env.example` is rejected at startup |
| `WEB_ORIGIN` | (required) | CORS origin of the web client |
| `API_PORT` | `8080` | |
| `COOKIE_SECURE` | `true` | set `false` only for plain-HTTP local dev |
| `AUTH_RATE_PER_MIN` | `10` | per-IP limit on `/auth/*` and `DELETE /me` |
| `TRUSTED_PROXIES` | empty (trust none) | comma-separated IPs/CIDRs of reverse proxies whose `X-Forwarded-For` is honored for the client IP (rate limiting). Set it to your proxy's address when running behind one, otherwise every client shares the proxy's bucket |

The compose file publishes Postgres on `127.0.0.1:5432` only.

## Develop the API

```bash
cd api
go test -short ./...    # unit tests only
go test ./...           # + integration tests (Docker must be running)
sqlc generate           # after editing queries/*.sql
swag init -g cmd/api/main.go -o docs --parseInternal   # after changing handler annotations
```

Amounts are integer cents everywhere. Card data is reference-only: never store full card numbers.
