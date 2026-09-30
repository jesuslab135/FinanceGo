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

App on http://localhost:3000. The API is also published on http://localhost:8080 for local development (`/healthz`, `/readyz`, `/api/v1/...`).

### Topology

```
browser ──► edge (Caddy, host :3000) ──┬─ /api/*  ──► api (Go, :8080)
                                       └─ else    ──► web (Next.js, :3000, not published)
```

All services share the `app` compose network (172.28.0.0/24). `edge` has the fixed address 172.28.0.10; its config is `deploy/Caddyfile`.

- Browser API calls go from the edge straight to the API, so the API rate-limits each client by its own address (`AUTH_RATE_PER_MIN`). Routed through the Next server instead, every user would share the web container's single bucket.
- Caddy trusts no upstream proxy by default, so it replaces any client-supplied `X-Forwarded-For` with the real peer address; it also drops `X-Real-IP`.
- The API runs with `TRUSTED_PROXIES=172.28.0.10`: only the edge may report a client IP. The subnet is deliberately not trusted, because requests to published ports (e.g. `curl localhost:8080`) arrive from the network gateway 172.28.0.1 and could otherwise spoof `X-Forwarded-For`.
- The Next rewrite of `/api` to the API stays for `pnpm dev`; in the compose stack the edge answers `/api` before Next sees it.
- Production TLS and public hosting go in front of the edge or replace it. With another proxy in front, add it to Caddy's `trusted_proxies` so the real client address survives; if you replace the edge, route `/api/*` to the API directly and set `TRUSTED_PROXIES` to your proxy's address.

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | (required) | Postgres DSN |
| `JWT_SECRET` | (required) | at least 32 bytes; the `change-me` placeholder from `.env.example` is rejected at startup |
| `WEB_ORIGIN` | (required) | CORS origin of the web client |
| `API_PORT` | `8080` | |
| `COOKIE_SECURE` | `true` | set `false` only for plain-HTTP local dev |
| `AUTH_RATE_PER_MIN` | `10` | per-IP limit on `/auth/*` and `DELETE /me` |
| `TRUSTED_PROXIES` | empty (trust none) | comma-separated IPs/CIDRs of reverse proxies whose `X-Forwarded-For` is honored for the client IP (rate limiting). Set it to your proxy's address when running behind one, otherwise every client shares the proxy's bucket. `docker-compose.yml` sets it to the edge (172.28.0.10) and ignores `.env` |

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

## Web app

```bash
cd web
pnpm install
pnpm gen:api     # after API handler changes (regenerates src/lib/api/schema.d.ts from api/docs/swagger.json)
pnpm dev         # http://localhost:3000 (proxies /api to http://localhost:8080; override with API_URL)
pnpm test        # unit/component tests
pnpm e2e         # Playwright against a running stack (docker compose -f docker-compose.yml up -d --build)
```

Installable as a PWA (manifest + icons). Spanish at `/es`, English at `/en`.
