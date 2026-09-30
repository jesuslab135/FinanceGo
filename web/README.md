# FinanceGo web

Next.js 16 client for the FinanceGo API: next-intl (`/es`, `/en`), TanStack Query, openapi-fetch with types generated from `../api/docs/swagger.json`, shadcn/ui (Radix), Recharts. Installable as a PWA.

See the [root README](../README.md) for running the whole stack (edge proxy, API, database) and for configuration.

```bash
pnpm install
pnpm dev         # http://localhost:3000; /api is proxied to API_URL (default http://localhost:8080)
pnpm test        # Vitest unit and component tests
pnpm typecheck
pnpm lint
pnpm build       # standalone output, used by the Dockerfile
pnpm gen:api     # regenerate src/lib/api/schema.d.ts after API changes
pnpm e2e         # Playwright against a running stack on :3000 (E2E_BASE_URL to override)
```

Conventions:

- Every user-visible string lives in `messages/es.json` and `messages/en.json` (same keys in both; a test enforces it). API errors are shown through `src/lib/api/error-messages.ts`, never the server's English text.
- Money is integer cents; use `parseMoney` / `formatMoney` from `src/lib/money.ts`.
- The access token lives only in memory; a reload restores the session from the HttpOnly refresh cookie.
