# Finance App — Web Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the responsive Next.js client for the FinanceGo API: auth, expenses, month view, recurring templates, cards with MSI and statements, categories and budgets, settings with export and account deletion, and a day/week/month dashboard. Ship it with Docker, CI and Playwright E2E.

**Architecture:** A Next.js App Router app in `web/`. It is client-rendered for data: pages are client components using TanStack Query over a typed `openapi-fetch` client generated from the API's OpenAPI spec. The browser only ever talks to its own origin. `next.config` rewrites `/api/*` to the Go API, so the refresh cookie (Path `/api/v1/auth`) is first-party. The access token lives in memory; a single-flight refresh restores the session on load and on 401. next-intl provides `/es` and `/en` routes.

**Tech Stack:** Next.js (latest, App Router, TypeScript strict, `output: "standalone"`), pnpm, Tailwind CSS v4, shadcn/ui, TanStack Query v5, openapi-fetch + openapi-typescript (+ swagger2openapi), react-hook-form + zod, next-intl, next-themes, Recharts, date-fns, lucide-react, sonner, Vitest + Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-finance-app-design.md` §8 (frontend), §5 (the rules the UI displays), §10 (Docker/CI). **Depends on Plan 1** (`2026-09-30-finance-api.md`), which must be complete. The API contract is `api/docs/swagger.json`.

## Global Constraints

- **App location:** all web code lives in `web/`. The package manager is **pnpm**. TypeScript `strict: true`. The path alias is `@/*` → `web/src/*`.
- **Money:** held as **integer cents** in state, forms and API calls. User input is converted with `parseMoney` (string maths, never `parseFloat`). Display uses `formatMoney(cents, currency, locale)`, i.e. `Intl.NumberFormat` with the user's currency.
- **Dates:** `"YYYY-MM-DD"` strings and months `"YYYY-MM"` strings, exactly as the API sends them. Use `date-fns` for arithmetic. Never convert a date string with `new Date("YYYY-MM-DD")` (that parses as UTC midnight and shifts the day); use `parseISODate` from `@/lib/dates`.
- **API access:** only through `api` (openapi-fetch) with `authFetch` in `@/lib/api`. Base URL is `<origin>/api/v1`. Every request sends `credentials: "include"`.
- **Auth:**
  - the access token is in memory only (`tokenStore`)
  - refresh is single-flight (`refreshSession()`)
  - on a 401 from any non-auth endpoint the client refreshes once and retries once
  - the session-hint cookie `fin_session=1` (Path `/`, SameSite=Lax, 30 days, not HttpOnly) is set on successful login/refresh and cleared on logout or a failed refresh. `src/proxy.ts` (or `src/middleware.ts` on Next < 16) redirects app routes to `/<locale>/login` when the hint is missing.
- **Routes:**
  - `/[locale]/(auth)/login` and `/[locale]/(auth)/register`
  - `/[locale]/(app)/dashboard`, `expenses`, `month/[month]`, `recurring`, `cards`, `cards/[id]`, `categories`, `settings`
  - locales are `es` (default) and `en`
- **Responsive:**
  - mobile-first
  - below `md` (768px): a bottom tab bar (Dashboard, Expenses, **+** quick add, Cards, More), lists rendered as cards, dialogs rendered as bottom sheets
  - `md` and up: a left sidebar and tables
  - no horizontal page scroll at 360px width
- **Theme:** light/dark via `next-themes` (`class` strategy). Surfaces are `--background` light `#fcfcfb` / dark `#1a1a19`.
- **Chart colors** (validated with the dataviz validator, both modes pass):
  - series-1 (expenses): light `#2a78d6`, dark `#3987e5`
  - series-2 (committed: fixed + MSI): light `#eb6834`, dark `#d95926`
- **Status colors:** good `#0ca30c`, warning `#fab219`, critical `#d03b3b`. Always paired with an icon and label, never color alone.
- **Text in the UI:** every user-visible string comes from `messages/es.json` / `messages/en.json` via `useTranslations`. No hard-coded copy in components; aria-labels included.
- **Card data:** forms offer only nickname, type, bank, network, last 4 digits and the credit fields. The last-4 input accepts exactly 4 digits. Never add a full-number field.
- **Errors:** API errors become `ApiError { status, code, message, fields }`. Forms map `fields` onto inputs with `setError`; everything else shows a `sonner` toast with the message.
- **Build location:** work in the git worktree `C:\dev\financego` (outside OneDrive). The API must be runnable (`docker compose -f docker-compose.yml up -d db api`) for type generation and E2E.

## Review Focus

Five inputs or conditions no page's happy path exercises but a real person will hit. Each is pinned in the named task:

1. **Money typed the Mexican/European way:** `"1,234.50"`, `"1234,5"`, `"$ 99"` and `"0.1"` must become 123450, 123450, 9900 and 10 cents. `"1.2.3"` or `"abc"` is rejected with a field error, never sent as `NaN`. Pinned in Task W1 (`money.test.ts`).
2. **Two requests hit 401 at once** (dashboard fires about 6 queries on load after the token expired): exactly one refresh call is made, and both requests retry with the new token. Pinned in Task W2 (`fetcher.test.ts` "single-flight").
3. **A date near midnight in a UTC−8 browser:** `parseISODate("2026-03-01")` must display as March 1, not February 28. Pinned in Task W1 (`dates.test.ts`).
4. **A server validation error on a field** (for example `category_id: invalid_reference`) shows under that field, not just as a toast. Pinned in Task W5 (`expense-form.test.tsx`).
5. **Available below zero:** the KPI shows the negative amount in critical red *with* the warning icon and label ("Sobregirado"/"Overspent"), not color alone. Pinned in Task W10 (`kpi-cards.test.tsx`).

## File Structure

```
web/
  package.json, tsconfig.json, next.config.ts, postcss.config.mjs, components.json,
  vitest.config.ts, vitest.setup.ts, playwright.config.ts, Dockerfile, .dockerignore
  messages/es.json, messages/en.json
  public/manifest.webmanifest, public/icons/icon-192.png, icon-512.png, maskable-512.png
  e2e/happy-path.spec.ts
  src/
    proxy.ts                      locale + session-hint redirect (middleware.ts on Next < 16)
    i18n/routing.ts, request.ts, navigation.ts
    app/globals.css               Tailwind v4 + theme tokens
    app/[locale]/layout.tsx       html/body, providers
    app/[locale]/page.tsx         redirect → dashboard
    app/[locale]/(auth)/layout.tsx, login/page.tsx, register/page.tsx
    app/[locale]/(app)/layout.tsx  auth gate + AppShell
    app/[locale]/(app)/{dashboard,expenses,recurring,cards,categories,settings}/page.tsx
    app/[locale]/(app)/month/[month]/page.tsx, cards/[id]/page.tsx
    lib/money.ts, lib/dates.ts, lib/utils.ts (shadcn cn)
    lib/api/schema.d.ts (generated), openapi.json (generated), types.ts, errors.ts,
        token-store.ts, fetcher.ts, client.ts
    lib/auth/session-hint.ts, auth-provider.tsx
    lib/query/keys.ts, lib/query/hooks.ts (all TanStack hooks)
    components/providers.tsx
    components/ui/*               shadcn primitives (generated)
    components/shell/app-shell.tsx, sidebar.tsx, bottom-nav.tsx, nav-items.ts, user-menu.tsx
    components/common/money-input.tsx, money.tsx, responsive-dialog.tsx, confirm-button.tsx,
        empty-state.tsx, field-error.tsx, category-select.tsx, payment-method-select.tsx, month-nav.tsx
    components/expenses/expense-form.tsx, expense-list.tsx, quick-add.tsx
    components/month/entry-row.tsx
    components/recurring/income-form.tsx, fixed-form.tsx
    components/cards/payment-method-form.tsx, card-payment-form.tsx, plan-form.tsx, statement-view.tsx
    components/categories/category-form.tsx
    components/dashboard/period-controls.tsx, kpi-cards.tsx, spending-chart.tsx,
        breakdown-bars.tsx, budget-meters.tsx, upcoming-list.tsx, cards-debt.tsx
```

---

### Task W1: Scaffold Next.js, tooling, money and date utilities

**Files:**
- Create: the `web/` app (via create-next-app), `web/vitest.config.ts`, `web/vitest.setup.ts`, `web/src/lib/money.ts`, `web/src/lib/money.test.ts`, `web/src/lib/dates.ts`, `web/src/lib/dates.test.ts`
- Modify: `web/package.json` (scripts), `web/next.config.ts`, `.gitignore`

**Interfaces:**
- Produces:
  - `parseMoney(raw: string): number | null`
  - `formatMoney(cents: number, currency: string, locale: string): string`
  - `centsToInput(cents: number): string`
  - `parseISODate(s: string): Date` (local midnight), `toISODate(d: Date): string`, `toMonthKey(d: Date): string`, `parseMonthKey(s: string): Date`
  - `periodRange(period: Period, anchor: Date): { from: string; to: string }`, where `type Period = "day" | "week" | "month"`
  - `seriesRange(period: Period, anchor: Date): { from: string; to: string }` (14 days, 12 ISO weeks, or 12 months ending at the anchor's period)
  - `intlLocale(locale: string): string` (`es` → `es-MX`, `en` → `en-US`)

- [ ] **Step 1: Scaffold**

```bash
cd /c/dev/financego
pnpm create next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes
cd web
pnpm add @tanstack/react-query openapi-fetch next-intl next-themes react-hook-form zod @hookform/resolvers recharts date-fns lucide-react sonner
pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom openapi-typescript swagger2openapi @playwright/test
pnpm dlx shadcn@latest init --base-color neutral --yes
pnpm dlx shadcn@latest add button input label card dialog sheet select tabs badge dropdown-menu progress skeleton separator switch popover calendar table tooltip alert-dialog textarea --yes
```

Run `pnpm next --version` and write down the major version. On **Next ≥ 16** the request interceptor file is `src/proxy.ts`, exporting `proxy`. On **Next ≤ 15** it is `src/middleware.ts`, exporting `middleware`. Task W3 uses whichever applies.

- [ ] **Step 2: Configure Next, Vitest and the scripts**

`web/next.config.ts`:

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const apiURL = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiURL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
```

(`'unsafe-inline'` scripts are required by Next's inline bootstrap without a nonce setup. In development Next also needs `'unsafe-eval'`, so append `" 'unsafe-eval'"` to `script-src` when `process.env.NODE_ENV !== "production"`.)

`web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    env: { TZ: "America/Tijuana" },
  },
});
```

`web/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add these scripts to `web/package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "gen:api": "swagger2openapi ../api/docs/swagger.json -o src/lib/api/openapi.json && openapi-typescript src/lib/api/openapi.json -o src/lib/api/schema.d.ts",
  "e2e": "playwright test"
}
```

Add `web/.next/`, `web/node_modules/`, `web/test-results/` and `web/playwright-report/` to the root `.gitignore`.

- [ ] **Step 3: Write the failing tests** `web/src/lib/money.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { centsToInput, formatMoney, parseMoney } from "./money";

describe("parseMoney", () => {
  it.each([
    ["1,234.50", 123450],
    ["1234,5", 123450],
    ["1.234,50", 123450],
    ["$ 99", 9900],
    ["0.1", 10],
    ["12", 1200],
    [" 7.05 ", 705],
    ["1,23", 123],
  ])("%s → %d", (raw, cents) => expect(parseMoney(raw)).toBe(cents));

  it.each(["", "abc", "1.2.3", "12.345", "-5", "1e3", "12.3.4,5", "99999999999999999"])(
    "rejects %j",
    (raw) => expect(parseMoney(raw)).toBeNull(),
  );
});

describe("formatMoney", () => {
  it("formats MXN in Spanish and English", () => {
    expect(formatMoney(123450, "MXN", "es")).toBe("$1,234.50");
    expect(formatMoney(-500, "USD", "en")).toBe("-$5.00");
  });
});

describe("centsToInput", () => {
  it("renders plain decimals for editing", () => {
    expect(centsToInput(123450)).toBe("1234.50");
    expect(centsToInput(5)).toBe("0.05");
  });
});
```

`"12.345"` is ambiguous (twelve thousand three hundred forty-five, or 12.35 mistyped), so `parseMoney` rejects it rather than guessing; `"1,234"` (a single leading digit) is read as thousands.

`web/src/lib/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseISODate, toISODate, periodRange, seriesRange, toMonthKey, parseMonthKey } from "./dates";

describe("dates (TZ=America/Tijuana)", () => {
  it("parses ISO dates as local days", () => {
    const d = parseISODate("2026-03-01");
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(2);
    expect(toISODate(d)).toBe("2026-03-01");
  });

  it("month keys round-trip", () => {
    expect(toMonthKey(parseMonthKey("2026-12"))).toBe("2026-12");
  });

  it("period ranges", () => {
    const a = parseISODate("2026-03-18"); // Wednesday
    expect(periodRange("day", a)).toEqual({ from: "2026-03-18", to: "2026-03-18" });
    expect(periodRange("week", a)).toEqual({ from: "2026-03-16", to: "2026-03-22" });
    expect(periodRange("month", a)).toEqual({ from: "2026-03-01", to: "2026-03-31" });
  });

  it("series ranges end at the anchor's period", () => {
    const a = parseISODate("2026-03-18");
    expect(seriesRange("day", a)).toEqual({ from: "2026-03-05", to: "2026-03-18" });
    expect(seriesRange("week", a)).toEqual({ from: "2025-12-29", to: "2026-03-22" });
    expect(seriesRange("month", a)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });
});
```

Run `pnpm test`. Expected: FAIL (modules missing).

- [ ] **Step 4: Implement** `web/src/lib/money.ts` (this implementation was checked against the test table above)

```ts
const MAX_CENTS = 999_999_999_999;

/**
 * Parses user-typed money into integer cents without floating point.
 * Accepts "1,234.50", "1.234,50", "1234,5", "$ 99". A last separator followed
 * by 1-2 digits is the decimal point; 3 digits means thousands grouping.
 * "12.345" is ambiguous (thousands or a typo) and is rejected. Returns null when invalid.
 */
export function parseMoney(raw: string): number | null {
  const s = raw.trim().replace(/[\s$]/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const seps = [...s.matchAll(/[.,]/g)].map((m) => ({ ch: m[0], i: m.index! }));
  let whole = s;
  let frac = "";
  if (seps.length > 0) {
    const last = seps[seps.length - 1];
    const tail = s.slice(last.i + 1);
    if (tail.length >= 1 && tail.length <= 2) {
      // decimal point: earlier separators must be the other character ("1,234.50")
      if (seps.slice(0, -1).some((g) => g.ch === last.ch)) return null;
      whole = s.slice(0, last.i);
      frac = tail;
    } else if (tail.length === 3) {
      // no decimals: every separator groups thousands ("1,234", "1.234.567")
      if (seps.some((g) => g.ch !== last.ch)) return null;
      if (seps.length === 1 && last.i > 1) return null;
    } else {
      return null;
    }
    if (/[.,]/.test(whole) && (!/^\d{1,3}([.,]\d{3})+$/.test(whole) || new Set(whole.match(/[.,]/g)).size > 1)) return null;
  }
  const digits = whole.replace(/[.,]/g, "");
  if (digits.length > 10) return null;
  const cents = Number(digits) * 100 + Number(frac.padEnd(2, "0") || 0);
  return cents <= MAX_CENTS ? cents : null;
}

export function intlLocale(locale: string): string {
  return locale === "en" ? "en-US" : "es-MX";
}

export function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency }).format(cents / 100);
}

export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
```

`web/src/lib/dates.ts`:

```ts
import {
  addDays, endOfMonth, endOfISOWeek, format, startOfISOWeek, startOfMonth, subDays, subMonths, subWeeks,
} from "date-fns";

export type Period = "day" | "week" | "month";

/** "YYYY-MM-DD" → local-midnight Date (never UTC). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function toMonthKey(d: Date): string {
  return format(d, "yyyy-MM");
}

export function parseMonthKey(s: string): Date {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

export function periodRange(period: Period, anchor: Date): { from: string; to: string } {
  switch (period) {
    case "day":
      return { from: toISODate(anchor), to: toISODate(anchor) };
    case "week":
      return { from: toISODate(startOfISOWeek(anchor)), to: toISODate(endOfISOWeek(anchor)) };
    case "month":
      return { from: toISODate(startOfMonth(anchor)), to: toISODate(endOfMonth(anchor)) };
  }
}

/** The window the spending chart shows: 14 days, 12 ISO weeks or 12 months ending at the anchor's period. */
export function seriesRange(period: Period, anchor: Date): { from: string; to: string } {
  switch (period) {
    case "day":
      return { from: toISODate(subDays(anchor, 13)), to: toISODate(anchor) };
    case "week":
      return { from: toISODate(startOfISOWeek(subWeeks(anchor, 11))), to: toISODate(endOfISOWeek(anchor)) };
    case "month":
      return { from: toISODate(startOfMonth(subMonths(anchor, 11))), to: toISODate(endOfMonth(anchor)) };
  }
}

export { addDays };
```

- [ ] **Step 5: Run the tests and confirm they pass.** Run `pnpm test`. Expected: PASS. Then run `pnpm typecheck && pnpm lint`. Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/financego && git add web .gitignore
git commit -m "feat(web): scaffold Next.js app with tooling, money and date utilities"
```

---

### Task W2: Typed API client with in-memory token, single-flight refresh, errors

**Files:**
- Create: `web/src/lib/api/openapi.json` and `web/src/lib/api/schema.d.ts` (generated), `web/src/lib/api/types.ts`, `web/src/lib/api/errors.ts`, `web/src/lib/api/token-store.ts`, `web/src/lib/api/fetcher.ts`, `web/src/lib/api/fetcher.test.ts`, `web/src/lib/api/client.ts`, `web/src/lib/auth/session-hint.ts`

**Interfaces:**
- Produces:
  - `tokenStore: { get(): string | null; set(t: string | null): void; subscribe(fn: () => void): () => void }`
  - `refreshSession(): Promise<Session | null>` (single-flight; sets `tokenStore` and the hint cookie on success, clears both on failure)
  - `authFetch(input: Request): Promise<Response>`
  - `api` (openapi-fetch client for `paths`)
  - `unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T>`, which throws `ApiError`
  - `class ApiError extends Error { status: number; code: string; fields: Record<string, string> }`
  - `setSessionHint(on: boolean)`, `hasSessionHint(): boolean`
  - type aliases in `types.ts`: `Session, User, Category, PaymentMethod, IncomeSource, FixedPayment, Entry, Expense, ExpensePage, CardPayment, InstallmentPlan, Statement, Summary, SeriesPoint, BreakdownItem, CardSummary, UpcomingItem, CategoryBudget` plus the input types `RegisterInput, ProfileInput, CategoryInput, PaymentMethodInput, IncomeSourceInput, FixedPaymentInput, EntryUpdate, ExpenseInput, CardPaymentInput, InstallmentPlanInput`

- [ ] **Step 1: Generate the types from the API spec**

```bash
cd /c/dev/financego/web && pnpm gen:api
grep -c '"/expenses"' src/lib/api/openapi.json   # expect 1
```

Expected: `src/lib/api/schema.d.ts` exports `paths` and `components`, with schemas named like `components["schemas"]["service.Expense"]`.

- [ ] **Step 2: Type aliases** `web/src/lib/api/types.ts`

```ts
import type { components } from "./schema";

type S = components["schemas"];

export type Session = S["service.Session"];
export type User = S["service.User"];
export type Category = S["service.Category"];
export type PaymentMethod = S["service.PaymentMethod"];
export type IncomeSource = S["service.IncomeSource"];
export type FixedPayment = S["service.FixedPayment"];
export type Entry = S["service.Entry"];
export type Expense = S["service.Expense"];
export type ExpensePage = S["service.ExpensePage"];
export type CardPayment = S["service.CardPayment"];
export type InstallmentPlan = S["service.InstallmentPlan"];
export type Statement = S["service.Statement"];
export type Summary = S["service.Summary"];
export type SeriesPoint = S["service.SeriesPoint"];
export type BreakdownItem = S["service.BreakdownItem"];
export type CardSummary = S["service.CardSummary"];
export type UpcomingItem = S["service.UpcomingItem"];
export type CategoryBudget = S["service.CategoryBudget"];

export type RegisterInput = S["service.RegisterInput"];
export type ProfileInput = S["service.ProfileInput"];
export type CategoryInput = S["service.CategoryInput"];
export type PaymentMethodInput = S["service.PaymentMethodInput"];
export type IncomeSourceInput = S["service.IncomeSourceInput"];
export type FixedPaymentInput = S["service.FixedPaymentInput"];
export type EntryUpdate = S["service.EntryUpdate"];
export type ExpenseInput = S["service.ExpenseInput"];
export type CardPaymentInput = S["service.CardPaymentInput"];
export type InstallmentPlanInput = S["service.InstallmentPlanInput"];
```

If swag names a schema differently (check `openapi.json` → `components.schemas` keys), use the generated key. Keep the alias names above, because every later task imports them.

- [ ] **Step 3: Errors, token store and session hint**

`web/src/lib/api/errors.ts`:

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = { error?: { code?: string; message?: string; fields?: Record<string, string> } };

export function toApiError(status: number, body: unknown): ApiError {
  const e = (body as ErrorBody | undefined)?.error;
  return new ApiError(status, e?.code ?? "internal", e?.message ?? `HTTP ${status}`, e?.fields ?? {});
}
```

`web/src/lib/api/token-store.ts`:

```ts
type Listener = () => void;

let token: string | null = null;
const listeners = new Set<Listener>();

/** The access token lives only in memory; a reload restores it via the refresh cookie. */
export const tokenStore = {
  get: () => token,
  set(t: string | null) {
    token = t;
    listeners.forEach((l) => l());
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
```

`web/src/lib/auth/session-hint.ts`:

```ts
const NAME = "fin_session";

/** A non-secret cookie that tells the edge proxy a session probably exists. */
export function setSessionHint(on: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = on
    ? `${NAME}=1; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax`
    : `${NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function hasSessionHint(): boolean {
  return typeof document !== "undefined" && document.cookie.split("; ").some((c) => c === `${NAME}=1`);
}

export const SESSION_HINT_COOKIE = NAME;
```

- [ ] **Step 4: Write the failing fetcher tests** `web/src/lib/api/fetcher.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authFetch, refreshSession, __resetRefreshForTests } from "./fetcher";
import { tokenStore } from "./token-store";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("authFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    tokenStore.set(null);
    __resetRefreshForTests();
    document.cookie = "fin_session=; Max-Age=0; Path=/";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("attaches the bearer token and credentials", async () => {
    tokenStore.set("t1");
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await authFetch(new Request("http://x/api/v1/me"));
    const sent: Request = fetchMock.mock.calls[0][0];
    expect(sent.headers.get("Authorization")).toBe("Bearer t1");
    expect(sent.credentials).toBe("include");
  });

  it("single-flight: two 401s trigger one refresh and both retry", async () => {
    tokenStore.set("old");
    fetchMock.mockImplementation(async (req: Request) => {
      if (req.url.endsWith("/auth/refresh")) {
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { access_token: "new", user: { id: 1 } });
      }
      return req.headers.get("Authorization") === "Bearer new" ? json(200, { ok: true }) : json(401, {});
    });
    const [a, b] = await Promise.all([
      authFetch(new Request("http://x/api/v1/dashboard/summary")),
      authFetch(new Request("http://x/api/v1/expenses")),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const refreshCalls = fetchMock.mock.calls.filter(([r]: [Request]) => r.url.endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
    expect(tokenStore.get()).toBe("new");
    expect(document.cookie).toContain("fin_session=1");
  });

  it("retries a POST with its body intact", async () => {
    tokenStore.set("old");
    const bodies: string[] = [];
    fetchMock.mockImplementation(async (req: Request) => {
      if (req.url.endsWith("/auth/refresh")) return json(200, { access_token: "new", user: { id: 1 } });
      bodies.push(await req.text());
      return req.headers.get("Authorization") === "Bearer new" ? json(201, {}) : json(401, {});
    });
    const res = await authFetch(new Request("http://x/api/v1/expenses", { method: "POST", body: '{"amount":1}' }));
    expect(res.status).toBe(201);
    expect(bodies).toEqual(['{"amount":1}', '{"amount":1}']);
  });

  it("failed refresh clears the token and the hint and returns the 401", async () => {
    tokenStore.set("old");
    document.cookie = "fin_session=1; Path=/";
    fetchMock.mockImplementation(async (req: Request) =>
      req.url.endsWith("/auth/refresh") ? json(401, { error: { code: "unauthorized" } }) : json(401, {}),
    );
    const res = await authFetch(new Request("http://x/api/v1/me"));
    expect(res.status).toBe(401);
    expect(tokenStore.get()).toBeNull();
    expect(document.cookie).not.toContain("fin_session=1");
  });

  it("does not refresh-loop on auth endpoints", async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    await authFetch(new Request("http://x/api/v1/auth/login", { method: "POST", body: "{}" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshSession returns the session", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { access_token: "abc", user: { id: 7 } }));
    const s = await refreshSession();
    expect(s?.user?.id).toBe(7);
  });
});
```

Run `pnpm test src/lib/api`. Expected: FAIL.

- [ ] **Step 5: Implement** `web/src/lib/api/fetcher.ts`

```ts
import type { Session } from "./types";
import { tokenStore } from "./token-store";
import { setSessionHint } from "@/lib/auth/session-hint";

function apiOrigin(): string {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

let inflight: Promise<Session | null> | null = null;

/** Exchanges the HttpOnly refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<Session | null> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch(
          new Request(`${apiOrigin()}/api/v1/auth/refresh`, { method: "POST", credentials: "include" }),
        );
        if (!res.ok) throw new Error(`refresh ${res.status}`);
        const s = (await res.json()) as Session;
        tokenStore.set(s.access_token ?? null);
        setSessionHint(true);
        return s;
      } catch {
        tokenStore.set(null);
        setSessionHint(false);
        return null;
      } finally {
        setTimeout(() => (inflight = null), 0);
      }
    })();
  }
  return inflight;
}

export function __resetRefreshForTests() {
  inflight = null;
}

function withAuth(req: Request): Request {
  const headers = new Headers(req.headers);
  const t = tokenStore.get();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  return new Request(req, { headers, credentials: "include" });
}

/** fetch for openapi-fetch: bearer token, cookies, and one refresh-and-retry on 401. */
export async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  const res = await fetch(withAuth(input));
  if (res.status !== 401 || new URL(input.url).pathname.startsWith("/api/v1/auth/")) return res;
  const session = await refreshSession();
  if (!session) return res;
  return fetch(withAuth(retry));
}
```

`web/src/lib/api/client.ts`:

```ts
import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { authFetch } from "./fetcher";
import { toApiError } from "./errors";

const baseUrl = `${typeof window === "undefined" ? "http://localhost" : window.location.origin}/api/v1`;

export const api = createClient<paths>({ baseUrl, fetch: authFetch, credentials: "include" });

/** Resolves to data or throws ApiError (so TanStack Query sees failures). */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (!response.ok) throw toApiError(response.status, error);
  return data as T;
}

export { ApiError } from "./errors";
export { tokenStore } from "./token-store";
export { refreshSession } from "./fetcher";
```

- [ ] **Step 6: Run the tests.** Run `pnpm test && pnpm typecheck`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "feat(web): typed API client, in-memory token, single-flight refresh, ApiError"
```

---
### Task W3: i18n routing, providers, auth session, login and register

**Files:**
- Delete: `web/src/app/layout.tsx`, `web/src/app/page.tsx` (the `[locale]` layout becomes the root layout)
- Create: `web/messages/es.json`, `web/messages/en.json`, `web/src/i18n/routing.ts`, `request.ts`, `navigation.ts`, `web/src/proxy.ts` (or `middleware.ts`, see W1), `web/src/components/providers.tsx`, `web/src/lib/auth/auth-provider.tsx`, `web/src/lib/forms.ts`, `web/src/lib/forms.test.ts`, `web/src/lib/messages.test.ts`, `web/src/test/render.tsx`, `web/src/app/[locale]/layout.tsx`, `web/src/app/[locale]/page.tsx`, `web/src/app/[locale]/(auth)/layout.tsx`, `login/page.tsx`, `register/page.tsx`
- Modify: `web/src/app/globals.css` (theme tokens)

**Interfaces:**
- Consumes: `api`, `unwrap`, `ApiError`, `tokenStore`, `refreshSession`, `setSessionHint`, `hasSessionHint` (W2)
- Produces:
  - `useAuth(): { status: "loading" | "authenticated" | "anonymous"; user: User | null; login(email, password): Promise<void>; register(input: RegisterInput): Promise<void>; logout(): Promise<void>; setUser(u: User): void }`
  - `applyApiError(err: unknown, setError: UseFormSetError<any>, fallback: (msg: string) => void): void`
  - `Link`, `useRouter`, `usePathname`, `redirect` from `@/i18n/navigation`
  - `renderWithProviders(ui, { locale? })` test helper
  - message namespaces: `common, nav, auth, validation, expenses, month, recurring, cards, categories, settings, dashboard`
  - CSS tokens `--chart-1`, `--chart-2`, `--good`, `--warning`, `--critical`

- [ ] **Step 1: Messages.** Every later task reads these keys, so add them all now.

`web/messages/es.json`:

```json
{
  "common": {
    "appName": "FinanceGo", "save": "Guardar", "cancel": "Cancelar", "delete": "Eliminar", "edit": "Editar",
    "add": "Agregar", "close": "Cerrar", "loading": "Cargando…", "retry": "Reintentar",
    "confirmTitle": "¿Estás seguro?", "confirmDelete": "Esta acción no se puede deshacer.", "none": "Ninguno",
    "optional": "opcional", "active": "Activo", "inactive": "Inactivo", "activate": "Activar",
    "error": "Algo salió mal", "saved": "Guardado", "deleted": "Eliminado", "empty": "Aún no hay nada aquí",
    "actions": "Acciones", "search": "Buscar", "from": "Desde", "to": "Hasta", "all": "Todos",
    "previous": "Anterior", "next": "Siguiente", "today": "Hoy", "total": "Total"
  },
  "nav": {
    "dashboard": "Inicio", "expenses": "Gastos", "month": "Mes", "recurring": "Recurrentes", "cards": "Tarjetas",
    "categories": "Categorías", "settings": "Ajustes", "more": "Más", "quickAdd": "Agregar gasto",
    "logout": "Cerrar sesión", "theme": "Tema", "themeLight": "Claro", "themeDark": "Oscuro", "themeSystem": "Sistema",
    "language": "Idioma", "mainNav": "Navegación principal"
  },
  "auth": {
    "loginTitle": "Inicia sesión", "registerTitle": "Crea tu cuenta", "email": "Correo", "password": "Contraseña",
    "name": "Nombre", "currency": "Moneda", "timezone": "Zona horaria", "login": "Entrar", "register": "Crear cuenta",
    "noAccount": "¿No tienes cuenta?", "haveAccount": "¿Ya tienes cuenta?",
    "invalidCredentials": "Correo o contraseña incorrectos", "passwordHint": "Mínimo 8 caracteres",
    "tagline": "Tus ingresos, pagos fijos y gastos en un solo lugar."
  },
  "validation": {
    "required": "Requerido", "amount": "Escribe un monto válido, p. ej. 1,234.50", "email": "Correo inválido",
    "min8": "Mínimo 8 caracteres", "last4": "Exactamente 4 dígitos", "day": "Día entre 1 y 31",
    "installments": "Entre 2 y 48 mensualidades", "max200": "Máximo 200 caracteres"
  },
  "expenses": {
    "title": "Gastos", "new": "Nuevo gasto", "edit": "Editar gasto", "amount": "Monto", "category": "Categoría",
    "paymentMethod": "Método de pago", "description": "Descripción", "date": "Fecha", "noMethod": "Sin método",
    "loadMore": "Cargar más", "empty": "No hay gastos en este rango", "searchPlaceholder": "Buscar descripción"
  },
  "month": {
    "title": "Mes", "income": "Ingresos", "fixed": "Pagos fijos", "installments": "Meses sin intereses",
    "status": { "pending": "Pendiente", "paid": "Pagado", "received": "Recibido", "skipped": "Omitido" },
    "markPaid": "Marcar pagado", "markReceived": "Marcar recibido", "skip": "Omitir", "undo": "Deshacer",
    "due": "Vence {date}", "edited": "Editado", "editEntry": "Editar movimiento", "empty": "Sin movimientos este mes"
  },
  "recurring": {
    "title": "Recurrentes", "incomeSources": "Ingresos", "fixedPayments": "Pagos fijos",
    "newIncome": "Nueva fuente de ingreso", "newFixed": "Nuevo pago fijo", "editIncome": "Editar ingreso",
    "editFixed": "Editar pago fijo", "name": "Nombre", "amount": "Monto", "day": "Día del mes",
    "startMonth": "Mes de inicio", "endMonth": "Mes final", "deactivate": "Desactivar",
    "dayHint": "Si el mes es más corto se usa el último día", "everyMonth": "Cada mes el día {day}",
    "endMonthHint": "Déjalo vacío si no termina"
  },
  "cards": {
    "title": "Tarjetas y cuentas", "new": "Nuevo método de pago", "edit": "Editar método de pago",
    "nickname": "Alias", "type": "Tipo",
    "types": { "credit": "Crédito", "debit": "Débito", "cash": "Efectivo", "transfer": "Transferencia" },
    "bank": "Banco", "network": "Red", "last4": "Últimos 4 dígitos",
    "last4Hint": "Solo como referencia. Nunca guardes el número completo, CVV ni vencimiento.",
    "creditLimit": "Límite de crédito", "statementDay": "Día de corte", "paymentDueDay": "Día límite de pago",
    "openingBalance": "Saldo inicial", "openingBalanceDate": "Fecha del saldo inicial",
    "openingHint": "Deuda previa, sin incluir compras a MSI que registres aparte.",
    "currentBalance": "Saldo actual", "amountDue": "Pago para no generar intereses", "dueOn": "Fecha límite",
    "billed": "Saldo al corte", "utilization": "Uso del límite", "available": "Crédito disponible",
    "cycle": "Periodo {from} – {to}", "charges": "Cargos", "payments": "Pagos",
    "recordPayment": "Registrar pago", "msi": "Meses sin intereses", "newMsi": "Nueva compra a MSI",
    "editMsi": "Editar compra a MSI", "totalAmount": "Total", "installments": "Mensualidades",
    "purchasedOn": "Fecha de compra", "remaining": "Restante", "cancelPlan": "Cancelar plan",
    "cancelled": "Cancelado", "note": "Nota", "noCharges": "Sin cargos en este periodo",
    "source": { "expense": "Gasto", "fixed": "Pago fijo" }, "installmentOf": "{no}/{of}",
    "notCredit": "Este método no es tarjeta de crédito.", "otherMethods": "Otros métodos",
    "creditCards": "Tarjetas de crédito", "perMonth": "{amount} al mes"
  },
  "categories": {
    "title": "Categorías", "new": "Nueva categoría", "edit": "Editar categoría", "kind": "Tipo",
    "kinds": { "expense": "Gasto", "income": "Ingreso" }, "color": "Color", "name": "Nombre",
    "inUse": "Esta categoría está en uso. Elige a cuál mover sus movimientos:", "reassignTo": "Mover a",
    "budget": "Límite mensual", "noBudget": "Sin límite", "removeBudget": "Quitar límite"
  },
  "settings": {
    "title": "Ajustes", "profile": "Perfil", "export": "Exportar datos", "exportExpenses": "Gastos (CSV)",
    "exportEntries": "Ingresos y pagos fijos (CSV)", "danger": "Zona de peligro", "deleteAccount": "Eliminar cuenta",
    "deleteWarning": "Se borrarán tu cuenta y todos tus datos. No se puede deshacer.",
    "confirmPassword": "Escribe tu contraseña para confirmar", "language": "Idioma"
  },
  "dashboard": {
    "title": "Resumen", "period": { "day": "Día", "week": "Semana", "month": "Mes" }, "anchor": "Fecha",
    "income": "Ingresos del mes", "fixed": "Fijos del mes", "fixedDetail": "{paid} pagado · {pending} pendiente",
    "installments": "MSI del mes",
    "spent": { "day": "Gastado este día", "week": "Gastado esta semana", "month": "Gastado este mes" },
    "available": "Disponible del mes", "overspent": "Sobregirado",
    "safeToSpend": "Puedes gastar {amount} por día ({days} días restantes)",
    "spending": "Gasto en el tiempo", "expensesSeries": "Gastos", "committedSeries": "Fijos y MSI",
    "byCategory": "Por categoría", "byMethod": "Por método de pago", "noMethod": "Sin método",
    "other": "Otros", "budgets": "Límites por categoría", "upcoming": "Próximos pagos", "overdue": "Vencido",
    "cardsDebt": "Deuda de tarjetas", "showTable": "Ver tabla", "showChart": "Ver gráfica",
    "noData": "Sin movimientos en este periodo",
    "budgetStatus": { "ok": "En orden", "warn": "Cerca del límite", "over": "Excedido" },
    "periodColumn": "Periodo", "cardDue": "Pago de tarjeta"
  }
}
```

`web/messages/en.json`: the **same keys**, in English:

```json
{
  "common": {
    "appName": "FinanceGo", "save": "Save", "cancel": "Cancel", "delete": "Delete", "edit": "Edit",
    "add": "Add", "close": "Close", "loading": "Loading…", "retry": "Retry",
    "confirmTitle": "Are you sure?", "confirmDelete": "This cannot be undone.", "none": "None",
    "optional": "optional", "active": "Active", "inactive": "Inactive", "activate": "Activate",
    "error": "Something went wrong", "saved": "Saved", "deleted": "Deleted", "empty": "Nothing here yet",
    "actions": "Actions", "search": "Search", "from": "From", "to": "To", "all": "All",
    "previous": "Previous", "next": "Next", "today": "Today", "total": "Total"
  },
  "nav": {
    "dashboard": "Home", "expenses": "Expenses", "month": "Month", "recurring": "Recurring", "cards": "Cards",
    "categories": "Categories", "settings": "Settings", "more": "More", "quickAdd": "Add expense",
    "logout": "Log out", "theme": "Theme", "themeLight": "Light", "themeDark": "Dark", "themeSystem": "System",
    "language": "Language", "mainNav": "Main navigation"
  },
  "auth": {
    "loginTitle": "Log in", "registerTitle": "Create your account", "email": "Email", "password": "Password",
    "name": "Name", "currency": "Currency", "timezone": "Time zone", "login": "Log in", "register": "Create account",
    "noAccount": "No account yet?", "haveAccount": "Already have an account?",
    "invalidCredentials": "Wrong email or password", "passwordHint": "At least 8 characters",
    "tagline": "Your income, fixed payments and expenses in one place."
  },
  "validation": {
    "required": "Required", "amount": "Enter a valid amount, e.g. 1,234.50", "email": "Invalid email",
    "min8": "At least 8 characters", "last4": "Exactly 4 digits", "day": "Day between 1 and 31",
    "installments": "Between 2 and 48 installments", "max200": "At most 200 characters"
  },
  "expenses": {
    "title": "Expenses", "new": "New expense", "edit": "Edit expense", "amount": "Amount", "category": "Category",
    "paymentMethod": "Payment method", "description": "Description", "date": "Date", "noMethod": "No method",
    "loadMore": "Load more", "empty": "No expenses in this range", "searchPlaceholder": "Search description"
  },
  "month": {
    "title": "Month", "income": "Income", "fixed": "Fixed payments", "installments": "Interest-free installments",
    "status": { "pending": "Pending", "paid": "Paid", "received": "Received", "skipped": "Skipped" },
    "markPaid": "Mark paid", "markReceived": "Mark received", "skip": "Skip", "undo": "Undo",
    "due": "Due {date}", "edited": "Edited", "editEntry": "Edit entry", "empty": "Nothing this month"
  },
  "recurring": {
    "title": "Recurring", "incomeSources": "Income", "fixedPayments": "Fixed payments",
    "newIncome": "New income source", "newFixed": "New fixed payment", "editIncome": "Edit income",
    "editFixed": "Edit fixed payment", "name": "Name", "amount": "Amount", "day": "Day of month",
    "startMonth": "Start month", "endMonth": "End month", "deactivate": "Deactivate",
    "dayHint": "Shorter months use their last day", "everyMonth": "Every month on day {day}",
    "endMonthHint": "Leave empty if it never ends"
  },
  "cards": {
    "title": "Cards & accounts", "new": "New payment method", "edit": "Edit payment method",
    "nickname": "Nickname", "type": "Type",
    "types": { "credit": "Credit", "debit": "Debit", "cash": "Cash", "transfer": "Transfer" },
    "bank": "Bank", "network": "Network", "last4": "Last 4 digits",
    "last4Hint": "Reference only. Never store the full number, CVV or expiry.",
    "creditLimit": "Credit limit", "statementDay": "Statement day", "paymentDueDay": "Payment due day",
    "openingBalance": "Opening balance", "openingBalanceDate": "Opening balance date",
    "openingHint": "Existing debt, excluding interest-free purchases you add separately.",
    "currentBalance": "Current balance", "amountDue": "Pay to avoid interest", "dueOn": "Due date",
    "billed": "Statement balance", "utilization": "Credit used", "available": "Available credit",
    "cycle": "Cycle {from} – {to}", "charges": "Charges", "payments": "Payments",
    "recordPayment": "Record payment", "msi": "Interest-free installments", "newMsi": "New installment purchase",
    "editMsi": "Edit installment purchase", "totalAmount": "Total", "installments": "Installments",
    "purchasedOn": "Purchase date", "remaining": "Remaining", "cancelPlan": "Cancel plan",
    "cancelled": "Cancelled", "note": "Note", "noCharges": "No charges this cycle",
    "source": { "expense": "Expense", "fixed": "Fixed payment" }, "installmentOf": "{no}/{of}",
    "notCredit": "This payment method is not a credit card.", "otherMethods": "Other methods",
    "creditCards": "Credit cards", "perMonth": "{amount} per month"
  },
  "categories": {
    "title": "Categories", "new": "New category", "edit": "Edit category", "kind": "Type",
    "kinds": { "expense": "Expense", "income": "Income" }, "color": "Color", "name": "Name",
    "inUse": "This category is in use. Choose where to move its records:", "reassignTo": "Move to",
    "budget": "Monthly limit", "noBudget": "No limit", "removeBudget": "Remove limit"
  },
  "settings": {
    "title": "Settings", "profile": "Profile", "export": "Export data", "exportExpenses": "Expenses (CSV)",
    "exportEntries": "Income & fixed payments (CSV)", "danger": "Danger zone", "deleteAccount": "Delete account",
    "deleteWarning": "Your account and all your data will be deleted. This cannot be undone.",
    "confirmPassword": "Type your password to confirm", "language": "Language"
  },
  "dashboard": {
    "title": "Overview", "period": { "day": "Day", "week": "Week", "month": "Month" }, "anchor": "Date",
    "income": "Income this month", "fixed": "Fixed this month", "fixedDetail": "{paid} paid · {pending} pending",
    "installments": "Installments this month",
    "spent": { "day": "Spent this day", "week": "Spent this week", "month": "Spent this month" },
    "available": "Available this month", "overspent": "Overspent",
    "safeToSpend": "You can spend {amount} per day ({days} days left)",
    "spending": "Spending over time", "expensesSeries": "Expenses", "committedSeries": "Fixed & installments",
    "byCategory": "By category", "byMethod": "By payment method", "noMethod": "No method",
    "other": "Other", "budgets": "Category limits", "upcoming": "Upcoming payments", "overdue": "Overdue",
    "cardsDebt": "Card debt", "showTable": "Show table", "showChart": "Show chart",
    "noData": "No activity in this period",
    "budgetStatus": { "ok": "On track", "warn": "Near the limit", "over": "Over the limit" },
    "periodColumn": "Period", "cardDue": "Card payment"
  }
}
```

- [ ] **Step 2: Write the failing tests**

`web/src/lib/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import es from "../../messages/es.json";
import en from "../../messages/en.json";

function keys(o: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("messages", () => {
  it("es and en define exactly the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });
});
```

`web/src/lib/forms.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { applyApiError } from "./forms";
import { ApiError } from "./api/errors";

describe("applyApiError", () => {
  it("maps field errors onto the form", () => {
    const setError = vi.fn();
    const fallback = vi.fn();
    applyApiError(new ApiError(422, "invalid_reference", "x", { category_id: "does not exist" }), setError, fallback);
    expect(setError).toHaveBeenCalledWith("category_id", { type: "server", message: "does not exist" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back to a toast for non-field errors", () => {
    const setError = vi.fn();
    const fallback = vi.fn();
    applyApiError(new ApiError(409, "plan_locked", "installments already billed"), setError, fallback);
    applyApiError(new Error("network"), setError, fallback);
    expect(fallback).toHaveBeenNthCalledWith(1, "installments already billed");
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(setError).not.toHaveBeenCalled();
  });
});
```

Run `pnpm test`. Expected: FAIL (`forms` missing).

- [ ] **Step 3: Implement** `web/src/lib/forms.ts`

```ts
import type { UseFormSetError } from "react-hook-form";
import { ApiError } from "./api/errors";

/** Puts server field errors under their inputs; everything else goes to `fallback` (a toast). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyApiError(err: unknown, setError: UseFormSetError<any>, fallback: (msg: string) => void) {
  if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
    for (const [field, message] of Object.entries(err.fields)) setError(field, { type: "server", message });
    return;
  }
  fallback(err instanceof Error ? err.message : String(err));
}
```

- [ ] **Step 4: next-intl wiring**

`web/src/i18n/routing.ts`:

```ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({ locales: ["es", "en"], defaultLocale: "es" });
export type Locale = (typeof routing.locales)[number];
```

`web/src/i18n/request.ts`:

```ts
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
```

`web/src/i18n/navigation.ts`:

```ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```

`web/src/proxy.ts`. On Next ≤ 15, name the file `src/middleware.ts` and rename the export to `middleware`.

```ts
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);
const PUBLIC = new Set(["/login", "/register"]);

/** Locale routing plus a cheap redirect when no session hint exists. The API remains the real gate. */
export function proxy(req: NextRequest) {
  const [, first, ...rest] = req.nextUrl.pathname.split("/");
  if ((routing.locales as readonly string[]).includes(first)) {
    const sub = `/${rest.join("/")}`;
    if (sub !== "/" && !PUBLIC.has(sub) && !req.cookies.has("fin_session")) {
      return NextResponse.redirect(new URL(`/${first}/login`, req.url));
    }
  }
  return intl(req);
}

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };
```

- [ ] **Step 5: Theme tokens.** Append to `web/src/app/globals.css` after the shadcn blocks, overriding `--background`:

```css
:root {
  --background: #fcfcfb;
  --chart-1: #2a78d6;
  --chart-2: #eb6834;
  --good: #0ca30c;
  --warning: #fab219;
  --critical: #d03b3b;
  --chart-grid: #e1e0d9;
  --chart-axis: #898781;
}
.dark {
  --background: #1a1a19;
  --chart-1: #3987e5;
  --chart-2: #d95926;
  --chart-grid: #2c2c2a;
  --chart-axis: #898781;
}
@theme inline {
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-good: var(--good);
  --color-warning: var(--warning);
  --color-critical: var(--critical);
}
```

(If shadcn's generated `globals.css` already declares `--chart-1`/`--chart-2` inside `:root`/`.dark`, replace those values instead of duplicating them.)

- [ ] **Step 6: Auth provider and app providers**

`web/src/lib/auth/auth-provider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, refreshSession, tokenStore, unwrap } from "@/lib/api/client";
import type { RegisterInput, Session, User } from "@/lib/api/types";
import { hasSessionHint, setSessionHint } from "./session-hint";

type Status = "loading" | "authenticated" | "anonymous";

type AuthState = {
  status: Status;
  user: User | null;
  login(email: string, password: string): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  setUser(u: User): void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let alive = true;
    if (!hasSessionHint()) {
      setStatus("anonymous");
      return;
    }
    refreshSession().then((s) => {
      if (!alive) return;
      setUser(s?.user ?? null);
      setStatus(s ? "authenticated" : "anonymous");
    });
    return () => {
      alive = false;
    };
  }, []);

  // Another tab or a failed refresh can clear the token: fall back to anonymous.
  useEffect(
    () =>
      tokenStore.subscribe(() => {
        if (!tokenStore.get()) setStatus((s) => (s === "authenticated" ? "anonymous" : s));
      }),
    [],
  );

  const start = useCallback((s: Session) => {
    tokenStore.set(s.access_token ?? null);
    setSessionHint(true);
    setUser(s.user ?? null);
    setStatus("authenticated");
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      setUser,
      login: async (email, password) => start(await unwrap(api.POST("/auth/login", { body: { email, password } }))),
      register: async (input) => start(await unwrap(api.POST("/auth/register", { body: input }))),
      logout: async () => {
        await api.POST("/auth/logout").catch(() => undefined);
        tokenStore.set(null);
        setSessionHint(false);
        qc.clear();
        setUser(null);
        setStatus("anonymous");
      },
    }),
    [status, user, start, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
```

`web/src/components/providers.tsx`:

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { ApiError } from "@/lib/api/errors";
import { AuthProvider } from "@/lib/auth/auth-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={qc}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 7: Layouts and pages**

Delete `web/src/app/layout.tsx` and `web/src/app/page.tsx`.

`web/src/app/[locale]/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { routing } from "@/i18n/routing";
import { Providers } from "@/components/providers";
import "../globals.css";

export const metadata: Metadata = {
  title: "FinanceGo",
  description: "Ingresos, pagos fijos, gastos y tarjetas en un solo lugar.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`web/src/app/[locale]/page.tsx`:

```tsx
import { redirect } from "@/i18n/navigation";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/dashboard", locale });
}
```

`web/src/app/[locale]/(auth)/layout.tsx`:

```tsx
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">{t("common.appName")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.tagline")}</p>
      </div>
      {children}
      <nav className="flex justify-center gap-3 text-sm" aria-label={t("nav.language")}>
        <Link href="/login" locale="es" className="underline-offset-4 hover:underline">Español</Link>
        <Link href="/login" locale="en" className="underline-offset-4 hover:underline">English</Link>
      </nav>
    </main>
  );
}
```

`web/src/app/[locale]/(auth)/login/page.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-provider";
import { applyApiError } from "@/lib/forms";

export default function LoginPage() {
  const t = useTranslations();
  const { login, status } = useAuth();
  const router = useRouter();
  const schema = useMemo(
    () => z.object({ email: z.string().email(t("validation.email")), password: z.string().min(1, t("validation.required")) }),
    [t],
  );
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await login(v.email, v.password);
      router.replace("/dashboard");
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_credentials") form.setError("root", { message: t("auth.invalidCredentials") });
      else applyApiError(e, form.setError, (m) => toast.error(m));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.loginTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          {errors.root && <p role="alert" className="text-sm text-destructive">{errors.root.message}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>{t("auth.login")}</Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("auth.noAccount")} <Link href="/register" className="text-foreground underline underline-offset-4">{t("auth.register")}</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

`web/src/app/[locale]/(auth)/register/page.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { applyApiError } from "@/lib/forms";
import { CURRENCIES, timezones } from "@/lib/locale-options";

export default function RegisterPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { register: signup } = useAuth();
  const router = useRouter();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("validation.required")).max(80),
        email: z.string().email(t("validation.email")),
        password: z.string().min(8, t("validation.min8")).max(128),
        currency: z.string().regex(/^[A-Z]{3}$/),
        timezone: z.string().min(1, t("validation.required")),
      }),
    [t],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", email: "", password: "", currency: "MXN",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await signup({ ...v, locale });
      router.replace("/dashboard");
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m));
    }
  });

  const field = (name: "name" | "email" | "password", label: string, type = "text", auto?: string) => (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={type} autoComplete={auto} aria-invalid={!!errors[name]} {...form.register(name)} />
      {errors[name] && <p className="text-sm text-destructive">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.registerTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {field("name", t("auth.name"), "text", "name")}
          {field("email", t("auth.email"), "email", "email")}
          {field("password", t("auth.password"), "password", "new-password")}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="currency">{t("auth.currency")}</Label>
              <select id="currency" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm" {...form.register("currency")}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">{t("auth.timezone")}</Label>
              <Input id="timezone" list="tz-list" aria-invalid={!!errors.timezone} {...form.register("timezone")} />
              <datalist id="tz-list">{timezones().map((z) => <option key={z} value={z} />)}</datalist>
              {errors.timezone && <p className="text-sm text-destructive">{errors.timezone.message}</p>}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>{t("auth.register")}</Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")} <Link href="/login" className="text-foreground underline underline-offset-4">{t("auth.login")}</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

`web/src/lib/locale-options.ts` (shared with the W9 settings page; Next.js forbids extra named exports from a `page.tsx`):

```ts
export const CURRENCIES = ["MXN", "USD", "EUR", "COP", "ARS", "CLP", "PEN", "GTQ", "CAD"] as const;

export function timezones(): string[] {
  return typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
}
```

- [ ] **Step 8: Test render helper** `web/src/test/render.tsx` (used by later component tests)

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import es from "../../messages/es.json";
import en from "../../messages/en.json";

export function renderWithProviders(ui: ReactElement, { locale = "es" }: { locale?: "es" | "en" } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en} timeZone="America/Tijuana">
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
```

- [ ] **Step 9: Verify.** Run `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: all pass. Then start the API (`cd .. && docker compose -f docker-compose.yml up -d db api`) and `pnpm dev`. Open http://localhost:3000/es/register, create an account, and check you land on `/es/dashboard`: it is a 404 until W4, which is fine, but the URL must be right. Check that `fin_session=1` is set and that reloading keeps you signed in (`/api/v1/auth/refresh` returns 200 in the network tab).

- [ ] **Step 10: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "feat(web): i18n routing, auth session provider, login and register"
```

---

### Task W4: App shell, navigation, data hooks, shared components

**Files:**
- Create: `web/src/app/[locale]/(app)/layout.tsx`, `web/src/components/shell/{app-shell,sidebar,bottom-nav,nav-items,user-menu}.tsx`, `web/src/lib/query/keys.ts`, `web/src/lib/query/hooks.ts`, `web/src/lib/query/hooks.test.tsx`, `web/src/lib/use-media-query.ts`, `web/src/components/common/{money,money-input,responsive-dialog,confirm-button,empty-state,field-error,category-select,payment-method-select,month-nav}.tsx`, `web/src/components/expenses/quick-add.tsx` (a stub that W5 fills in)
- Create: placeholder pages for every app route (`dashboard`, `expenses`, `month/[month]`, `recurring`, `cards`, `cards/[id]`, `categories`, `settings`), each rendering its translated title, so navigation works before the real pages exist

**Interfaces:**
- Consumes: `api`, `unwrap`, types (W2); `useAuth`, navigation, messages (W3)
- Produces:
  - `invalidateFinance(qc)`
  - queries: `useMe`, `useCategories(kind?)`, `usePaymentMethods()`, `useIncomeSources()`, `useFixedPayments()`, `useMonthEntries(month)`, `useExpenses(filters)` (infinite), `useCardPayments(pmId)`, `usePlans(pmId?)`, `useStatement(pmId, cycle?)`, `useSummary(month?)`, `useSeries(period, from, to)`, `useBreakdown(by, from, to)`, `useCardsOverview()`, `useUpcoming(days)`, `useBudgets()`
  - mutations: `useUpdateMe`, `useCreate/Update/DeleteCategory`, `useCreate/Update/DeletePaymentMethod`, `useCreate/Update/DeactivateIncomeSource`, `useCreate/Update/DeactivateFixedPayment`, `useUpdateEntry`, `useCreate/Update/DeleteExpense`, `useCreate/DeleteCardPayment`, `useCreate/Update/CancelPlan`, `usePutBudget`, `useDeleteBudget`
  - `useFormatMoney(): (cents: number) => string`, `<Money cents className? />`
  - `<MoneyInput>` (an `Input` with `inputMode="decimal"` and a currency prefix)
  - `<ResponsiveDialog open onOpenChange title>` (a Dialog at `md+`, a bottom Sheet below)
  - `<ConfirmButton onConfirm label>`, `<EmptyState>`, `<FieldError>`
  - `<CategorySelect kind value onChange>`, `<PaymentMethodSelect value onChange allowNone>`
  - `<MonthNav month basePath>`
  - `useMediaQuery(q)`
  - `<QuickAdd />`

- [ ] **Step 1: Write the failing test** `web/src/lib/query/hooks.test.tsx`

```tsx
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateFinance } from "./hooks";

describe("invalidateFinance", () => {
  it("invalidates every finance query but keeps the profile", async () => {
    const qc = new QueryClient();
    for (const k of [["me"], ["summary", "2026-03"], ["expenses", {}], ["statement", 1, null], ["categories"]]) {
      qc.setQueryData(k, { x: 1 });
    }
    await invalidateFinance(qc);
    const stale = qc.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => q.queryKey[0]);
    expect(stale.sort()).toEqual(["categories", "expenses", "statement", "summary"]);
  });
});
```

Run `pnpm test src/lib/query`. Expected: FAIL.

- [ ] **Step 2: Implement** `web/src/lib/query/keys.ts` and `hooks.ts`

`keys.ts`:

```ts
export const ME_KEY = ["me"] as const;
```

`hooks.ts`:

```ts
"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import type * as T from "@/lib/api/types";
import { ME_KEY } from "./keys";

/** After any write, every finance view may be stale (balances depend on everything). */
export function invalidateFinance(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
}

function useFinanceMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateFinance(qc) });
}

const items = <X,>(r: { items?: X[] }) => r.items ?? [];
const path = (id: number) => ({ params: { path: { id } } });

// ---- profile
export const useMe = () => useQuery({ queryKey: ME_KEY, queryFn: () => unwrap(api.GET("/me")) });

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: T.ProfileInput) => unwrap(api.PUT("/me", { body: v })),
    onSuccess: (u) => {
      qc.setQueryData(ME_KEY, u);
      return invalidateFinance(qc);
    },
  });
}

// ---- categories & budgets
export const useCategories = (kind?: "expense" | "income") =>
  useQuery({
    queryKey: ["categories"],
    queryFn: () => unwrap(api.GET("/categories")).then(items<T.Category>),
    select: (l) => (kind ? l.filter((c) => c.kind === kind) : l),
  });
export const useCreateCategory = () => useFinanceMutation((v: T.CategoryInput) => unwrap(api.POST("/categories", { body: v })));
export const useUpdateCategory = () =>
  useFinanceMutation(({ id, ...v }: T.CategoryInput & { id: number }) => unwrap(api.PUT("/categories/{id}", { ...path(id), body: v })));
export const useDeleteCategory = () =>
  useFinanceMutation(({ id, reassignTo }: { id: number; reassignTo?: number }) =>
    unwrap(api.DELETE("/categories/{id}", { params: { path: { id }, query: { reassign_to: reassignTo } } })),
  );
export const useBudgets = () =>
  useQuery({ queryKey: ["budgets"], queryFn: () => unwrap(api.GET("/category-budgets")).then(items<T.CategoryBudget>) });
export const usePutBudget = () =>
  useFinanceMutation(({ categoryId, limit }: { categoryId: number; limit: number }) =>
    unwrap(api.PUT("/category-budgets/{id}", { ...path(categoryId), body: { monthly_limit: limit } })),
  );
export const useDeleteBudget = () => useFinanceMutation((categoryId: number) => unwrap(api.DELETE("/category-budgets/{id}", path(categoryId))));

// ---- payment methods, card payments, plans, statements
export const usePaymentMethods = () =>
  useQuery({ queryKey: ["payment-methods"], queryFn: () => unwrap(api.GET("/payment-methods")).then(items<T.PaymentMethod>) });
export const useCreatePaymentMethod = () =>
  useFinanceMutation((v: T.PaymentMethodInput) => unwrap(api.POST("/payment-methods", { body: v })));
export const useUpdatePaymentMethod = () =>
  useFinanceMutation(({ id, ...v }: T.PaymentMethodInput & { id: number }) => unwrap(api.PUT("/payment-methods/{id}", { ...path(id), body: v })));
export const useDeletePaymentMethod = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/payment-methods/{id}", path(id))));

export const useStatement = (pmId: number, cycle?: string) =>
  useQuery({
    queryKey: ["statement", pmId, cycle ?? null],
    queryFn: () => unwrap(api.GET("/payment-methods/{id}/statement", { params: { path: { id: pmId }, query: { cycle } } })),
  });
export const useCardPayments = (pmId: number) =>
  useQuery({
    queryKey: ["card-payments", pmId],
    queryFn: () => unwrap(api.GET("/card-payments", { params: { query: { payment_method_id: pmId } } })).then(items<T.CardPayment>),
  });
export const useCreateCardPayment = () => useFinanceMutation((v: T.CardPaymentInput) => unwrap(api.POST("/card-payments", { body: v })));
export const useDeleteCardPayment = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/card-payments/{id}", path(id))));

export const usePlans = (pmId?: number) =>
  useQuery({
    queryKey: ["plans", pmId ?? null],
    queryFn: () => unwrap(api.GET("/installment-plans", { params: { query: { payment_method_id: pmId } } })).then(items<T.InstallmentPlan>),
  });
export const useCreatePlan = () => useFinanceMutation((v: T.InstallmentPlanInput) => unwrap(api.POST("/installment-plans", { body: v })));
export const useUpdatePlan = () =>
  useFinanceMutation(({ id, ...v }: T.InstallmentPlanInput & { id: number }) => unwrap(api.PUT("/installment-plans/{id}", { ...path(id), body: v })));
export const useCancelPlan = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/installment-plans/{id}", path(id))));

// ---- recurring templates & month entries
export const useIncomeSources = () =>
  useQuery({ queryKey: ["income-sources"], queryFn: () => unwrap(api.GET("/income-sources")).then(items<T.IncomeSource>) });
export const useCreateIncomeSource = () => useFinanceMutation((v: T.IncomeSourceInput) => unwrap(api.POST("/income-sources", { body: v })));
export const useUpdateIncomeSource = () =>
  useFinanceMutation(({ id, ...v }: T.IncomeSourceInput & { id: number }) => unwrap(api.PUT("/income-sources/{id}", { ...path(id), body: v })));
export const useDeactivateIncomeSource = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/income-sources/{id}", path(id))));

export const useFixedPayments = () =>
  useQuery({ queryKey: ["fixed-payments"], queryFn: () => unwrap(api.GET("/fixed-payments")).then(items<T.FixedPayment>) });
export const useCreateFixedPayment = () => useFinanceMutation((v: T.FixedPaymentInput) => unwrap(api.POST("/fixed-payments", { body: v })));
export const useUpdateFixedPayment = () =>
  useFinanceMutation(({ id, ...v }: T.FixedPaymentInput & { id: number }) => unwrap(api.PUT("/fixed-payments/{id}", { ...path(id), body: v })));
export const useDeactivateFixedPayment = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/fixed-payments/{id}", path(id))));

export const useMonthEntries = (month: string) =>
  useQuery({
    queryKey: ["entries", month],
    queryFn: () => unwrap(api.GET("/months/{month}/entries", { params: { path: { month } } })).then(items<T.Entry>),
  });
export const useUpdateEntry = () =>
  useFinanceMutation(({ id, ...v }: T.EntryUpdate & { id: number }) => unwrap(api.PUT("/entries/{id}", { ...path(id), body: v })));

// ---- expenses
export type ExpenseFilters = { from?: string; to?: string; category_id?: number; payment_method_id?: number; q?: string };

export const useExpenses = (f: ExpenseFilters) =>
  useInfiniteQuery({
    queryKey: ["expenses", f],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => unwrap(api.GET("/expenses", { params: { query: { ...f, cursor: pageParam, limit: 50 } } })),
    getNextPageParam: (last: T.ExpensePage) => last.next_cursor ?? undefined,
  });
export const useCreateExpense = () => useFinanceMutation((v: T.ExpenseInput) => unwrap(api.POST("/expenses", { body: v })));
export const useUpdateExpense = () =>
  useFinanceMutation(({ id, ...v }: T.ExpenseInput & { id: number }) => unwrap(api.PUT("/expenses/{id}", { ...path(id), body: v })));
export const useDeleteExpense = () => useFinanceMutation((id: number) => unwrap(api.DELETE("/expenses/{id}", path(id))));

// ---- dashboard
export const useSummary = (month?: string) =>
  useQuery({ queryKey: ["summary", month ?? null], queryFn: () => unwrap(api.GET("/dashboard/summary", { params: { query: { month } } })) });
export const useSeries = (period: "day" | "week" | "month", from: string, to: string) =>
  useQuery({
    queryKey: ["series", period, from, to],
    queryFn: () => unwrap(api.GET("/dashboard/series", { params: { query: { period, from, to } } })).then(items<T.SeriesPoint>),
  });
export const useBreakdown = (by: "category" | "payment_method", from: string, to: string) =>
  useQuery({
    queryKey: ["breakdown", by, from, to],
    queryFn: () => unwrap(api.GET("/dashboard/breakdown", { params: { query: { by, from, to } } })).then(items<T.BreakdownItem>),
  });
export const useCardsOverview = () =>
  useQuery({ queryKey: ["cards-overview"], queryFn: () => unwrap(api.GET("/dashboard/cards")).then(items<T.CardSummary>) });
export const useUpcoming = (days: number) =>
  useQuery({ queryKey: ["upcoming", days], queryFn: () => unwrap(api.GET("/dashboard/upcoming", { params: { query: { days } } })).then(items<T.UpcomingItem>) });
```

If `openapi-fetch` rejects a query param type (for example swag typed `reassign_to` as `integer`, which is correct), follow the generated `paths` types; do not add casts to `any`. Run `pnpm test src/lib/query`. Expected: PASS.

- [ ] **Step 3: Shared components**

`web/src/lib/use-media-query.ts`:

```ts
"use client";
import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
```

`web/src/components/common/money.tsx`:

```tsx
"use client";
import { useLocale } from "next-intl";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useMe } from "@/lib/query/hooks";

export function useFormatMoney() {
  const locale = useLocale();
  const currency = useMe().data?.currency ?? "MXN";
  return useCallback((cents: number) => formatMoney(cents, currency, locale), [currency, locale]);
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  const fmt = useFormatMoney();
  return <span className={cn("tabular-nums", className)}>{fmt(cents)}</span>;
}
```

`web/src/components/common/money-input.tsx`:

```tsx
"use client";
import { forwardRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/query/hooks";

/** Free-text amount field; the form converts with parseMoney on submit. */
export const MoneyInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input>>(function MoneyInput(props, ref) {
  const currency = useMe().data?.currency ?? "MXN";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">{currency}</span>
      <Input ref={ref} inputMode="decimal" autoComplete="off" className="pl-12 tabular-nums" {...props} />
    </div>
  );
});
```

`web/src/components/common/field-error.tsx`:

```tsx
export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return <p id={id} role="alert" className="text-sm text-destructive">{message}</p>;
}
```

`web/src/components/common/empty-state.tsx`:

```tsx
import type { ReactNode } from "react";

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      <p>{children}</p>
      {action}
    </div>
  );
}
```

`web/src/components/common/responsive-dialog.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/use-media-query";

export function ResponsiveDialog({ open, onOpenChange, title, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-xl px-4 pb-8">
        <SheetHeader className="px-0"><SheetTitle>{title}</SheetTitle></SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
```

`web/src/components/common/confirm-button.tsx`:

```tsx
"use client";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ConfirmButton({ onConfirm, children, description }: { onConfirm: () => void; children: ReactNode; description?: string }) {
  const t = useTranslations("common");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{description ?? t("confirmDelete")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

`web/src/components/common/category-select.tsx`:

```tsx
"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories } from "@/lib/query/hooks";

export function CategorySelect({ kind, value, onChange, id, invalid, placeholder }: {
  kind: "expense" | "income"; value: number | null | undefined; onChange: (v: number) => void; id?: string; invalid?: boolean; placeholder?: string;
}) {
  const { data = [] } = useCategories(kind);
  return (
    <Select value={value ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {data.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

`web/src/components/common/payment-method-select.tsx`:

```tsx
"use client";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePaymentMethods } from "@/lib/query/hooks";

const NONE = "none";

export function PaymentMethodSelect({ value, onChange, id, creditOnly, allowNone = true, invalid }: {
  value: number | null | undefined; onChange: (v: number | null) => void; id?: string; creditOnly?: boolean; allowNone?: boolean; invalid?: boolean;
}) {
  const t = useTranslations("expenses");
  const { data = [] } = usePaymentMethods();
  const list = data.filter((p) => (p.active || p.id === value) && (!creditOnly || p.type === "credit"));
  return (
    <Select value={value ? String(value) : NONE} onValueChange={(v) => onChange(v === NONE ? null : Number(v))}>
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{t("noMethod")}</SelectItem>}
        {list.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            {p.nickname}{p.last4 ? ` ···· ${p.last4}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

`web/src/components/common/month-nav.tsx`:

```tsx
"use client";
import { addMonths, format, subMonths } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseMonthKey, toMonthKey } from "@/lib/dates";

export function MonthNav({ month, basePath }: { month: string; basePath: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const d = parseMonthKey(month);
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="icon" aria-label={t("previous")}>
        <Link href={`${basePath}/${toMonthKey(subMonths(d, 1))}`}><ChevronLeft /></Link>
      </Button>
      <span className="min-w-36 text-center font-medium capitalize">{format(d, "LLLL yyyy", { locale: locale === "en" ? enUS : es })}</span>
      <Button asChild variant="outline" size="icon" aria-label={t("next")}>
        <Link href={`${basePath}/${toMonthKey(addMonths(d, 1))}`}><ChevronRight /></Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Shell**

`web/src/components/shell/nav-items.ts`:

```ts
import { CalendarDays, CreditCard, LayoutDashboard, Receipt, Repeat, Settings, Tags, type LucideIcon } from "lucide-react";
import { toMonthKey } from "@/lib/dates";

export type NavItem = { key: "dashboard" | "expenses" | "month" | "recurring" | "cards" | "categories" | "settings"; href: string; icon: LucideIcon };

export function navItems(): NavItem[] {
  return [
    { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
    { key: "expenses", href: "/expenses", icon: Receipt },
    { key: "month", href: `/month/${toMonthKey(new Date())}`, icon: CalendarDays },
    { key: "recurring", href: "/recurring", icon: Repeat },
    { key: "cards", href: "/cards", icon: CreditCard },
    { key: "categories", href: "/categories", icon: Tags },
    { key: "settings", href: "/settings", icon: Settings },
  ];
}

export function isActive(pathname: string, item: NavItem): boolean {
  const root = "/" + item.href.split("/")[1];
  return pathname === root || pathname.startsWith(root + "/");
}
```

`web/src/components/shell/user-menu.tsx`:

```tsx
"use client";
import { Languages, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { useUpdateMe } from "@/lib/query/hooks";

export function UserMenu() {
  const t = useTranslations("nav");
  const { user, logout, setUser } = useAuth();
  const { setTheme } = useTheme();
  const router = useRouter();
  const updateMe = useUpdateMe();

  const switchLocale = async (locale: "es" | "en") => {
    if (!user) return;
    try {
      const u = await updateMe.mutateAsync({ name: user.name ?? "", currency: user.currency ?? "MXN", timezone: user.timezone ?? "UTC", locale });
      setUser(u); // the (app) layout redirects to the new locale
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-start truncate">{user?.name ?? user?.email}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("theme")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}><Sun /> {t("themeLight")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}><Moon /> {t("themeDark")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}><Monitor /> {t("themeSystem")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t("language")}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => switchLocale("es")}><Languages /> Español</DropdownMenuItem>
        <DropdownMenuItem onClick={() => switchLocale("en")}><Languages /> English</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => { await logout(); router.replace("/login"); }}><LogOut /> {t("logout")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

`web/src/components/shell/sidebar.tsx`:

```tsx
"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { QuickAdd } from "@/components/expenses/quick-add";
import { isActive, navItems } from "./nav-items";
import { UserMenu } from "./user-menu";

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r p-4 md:flex">
      <div className="px-2 text-lg font-semibold">{t("common.appName")}</div>
      <QuickAdd variant="button" />
      <nav aria-label={t("nav.mainNav")} className="flex flex-1 flex-col gap-1">
        {navItems().map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive(pathname, item) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent",
              isActive(pathname, item) && "bg-accent font-medium",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {t(`nav.${item.key}`)}
          </Link>
        ))}
      </nav>
      <UserMenu />
    </aside>
  );
}
```

`web/src/components/shell/bottom-nav.tsx`:

```tsx
"use client";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { QuickAdd } from "@/components/expenses/quick-add";
import { isActive, navItems } from "./nav-items";
import { UserMenu } from "./user-menu";

export function BottomNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const items = navItems();
  const primary = items.filter((i) => i.key === "dashboard" || i.key === "expenses" || i.key === "cards");
  const rest = items.filter((i) => !primary.includes(i));
  const tab = (item: (typeof items)[number]) => (
    <Link
      key={item.key}
      href={item.href}
      aria-current={isActive(pathname, item) ? "page" : undefined}
      className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", isActive(pathname, item) ? "text-foreground" : "text-muted-foreground")}
    >
      <item.icon className="size-5" aria-hidden />
      {t(`nav.${item.key}`)}
    </Link>
  );
  return (
    <>
      <nav
        aria-label={t("nav.mainNav")}
        className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {tab(primary[0])}
        {tab(primary[1])}
        <div className="flex flex-1 justify-center"><QuickAdd variant="fab" /></div>
        {tab(primary[2])}
        <button type="button" onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
          <Menu className="size-5" aria-hidden />
          {t("nav.more")}
        </button>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8">
          <SheetHeader><SheetTitle>{t("nav.more")}</SheetTitle></SheetHeader>
          <div className="flex flex-col gap-1 px-4">
            {rest.map((item) => (
              <Link key={item.key} href={item.href} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-md px-2 py-3 hover:bg-accent">
                <item.icon className="size-5" aria-hidden />
                {t(`nav.${item.key}`)}
              </Link>
            ))}
            <UserMenu />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

`web/src/components/shell/app-shell.tsx`:

```tsx
import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
```

`web/src/components/expenses/quick-add.tsx` (a stub until W5 replaces its body):

```tsx
"use client";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function QuickAdd({ variant }: { variant: "fab" | "button" }) {
  const t = useTranslations("nav");
  return variant === "fab" ? (
    <Button size="icon" className="-mt-6 size-14 rounded-full shadow-lg" aria-label={t("quickAdd")}><Plus className="size-6" /></Button>
  ) : (
    <Button className="w-full"><Plus /> {t("quickAdd")}</Button>
  );
}
```

`web/src/app/[locale]/(app)/layout.tsx`:

```tsx
"use client";
import { useLocale } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (user?.locale && user.locale !== locale) router.replace(pathname, { locale: user.locale as "es" | "en" });
  }, [user?.locale, locale, pathname, router]);

  if (status !== "authenticated") {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground" aria-busy>…</div>;
  }
  return <AppShell>{children}</AppShell>;
}
```

Placeholder pages: create `dashboard/page.tsx`, `expenses/page.tsx`, `recurring/page.tsx`, `cards/page.tsx`, `cards/[id]/page.tsx`, `categories/page.tsx`, `settings/page.tsx` and `month/[month]/page.tsx` under `(app)`, each shaped like this (with its own namespace):

```tsx
"use client";
import { useTranslations } from "next-intl";

export default function Page() {
  const t = useTranslations("dashboard");
  return <h1 className="text-2xl font-semibold">{t("title")}</h1>;
}
```

- [ ] **Step 5: Verify.** Run `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: pass. Then `pnpm dev` and log in:
  - At 1280px wide the sidebar shows all 7 links.
  - At 375px wide (DevTools device mode) the bottom bar shows Inicio, Gastos, +, Tarjetas, Más; "Más" opens a sheet with the rest; nothing scrolls horizontally.
  - Switching language to English moves the URL to `/en/...`.
  - Dark mode toggles.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "feat(web): responsive app shell, navigation, data hooks, shared form components"
```

---
### Task W5: Expenses — form, list with filters, quick add

**Files:**
- Create: `web/src/components/expenses/expense-form.tsx`, `web/src/components/expenses/expense-form.test.tsx`, `web/src/components/expenses/expense-list.tsx`
- Replace: `web/src/components/expenses/quick-add.tsx`, `web/src/app/[locale]/(app)/expenses/page.tsx`

**Interfaces:**
- Consumes: hooks (W4): `useCategories`, `usePaymentMethods`, `useExpenses`, `useCreateExpense`, `useUpdateExpense`, `useDeleteExpense`; `MoneyInput`, `CategorySelect`, `PaymentMethodSelect`, `ResponsiveDialog`, `ConfirmButton`, `Money`, `FieldError`, `EmptyState`; `parseMoney`, `centsToInput`, `toISODate`, `periodRange`, `parseISODate`; `applyApiError`
- Produces:
  - `<ExpenseForm initial?: Expense onSubmit(v: ExpenseInput): Promise<void> onCancel?() />`, which is presentational and reused by quick add and edit
  - `<ExpenseList filters />`
  - `<QuickAdd variant="fab" | "button" />`

- [ ] **Step 1: Write the failing test** `web/src/components/expenses/expense-form.test.tsx`

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { ExpenseForm } from "./expense-form";

vi.mock("@/lib/query/hooks", () => ({
  useCategories: () => ({ data: [{ id: 1, name: "Comida", kind: "expense", color: "#f97316", icon: "tag" }] }),
  usePaymentMethods: () => ({ data: [] }),
  useMe: () => ({ data: { currency: "MXN" } }),
}));

const initial = { id: 0, category_id: 1, amount: 0, description: "", spent_on: "2026-03-10", created_at: "" };

describe("ExpenseForm", () => {
  it("rejects an unparseable amount without calling onSubmit", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<ExpenseForm initial={initial} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Monto"), "1.2.3");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/Escribe un monto válido/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends integer cents parsed from localized input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<ExpenseForm initial={initial} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Monto"), "1,234.50");
    await userEvent.type(screen.getByLabelText("Descripción"), "  Súper  ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        amount: 123450, category_id: 1, payment_method_id: null, description: "Súper", spent_on: "2026-03-10",
      }),
    );
  });

  it("shows server field errors under the matching field", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(422, "invalid_reference", "x", { category_id: "does not exist" }));
    renderWithProviders(<ExpenseForm initial={initial} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Monto"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const msg = await screen.findByText("does not exist");
    expect(msg).toHaveAttribute("id", "expense-category-error");
  });
});
```

Run `pnpm test src/components/expenses`. Expected: FAIL.

- [ ] **Step 2: Implement** `web/src/components/expenses/expense-form.tsx`

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CategorySelect } from "@/components/common/category-select";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { PaymentMethodSelect } from "@/components/common/payment-method-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Expense, ExpenseInput } from "@/lib/api/types";
import { toISODate } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { centsToInput, parseMoney } from "@/lib/money";

type Values = { amount: string; category_id: number | null; payment_method_id: number | null; description: string; spent_on: string };

export function ExpenseForm({ initial, onSubmit, onCancel }: {
  initial?: Partial<Expense>;
  onSubmit: (v: ExpenseInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const schema = useMemo(
    () =>
      z.object({
        amount: z.string().refine((v) => parseMoney(v) !== null, t("validation.amount")),
        category_id: z.number().nullable().refine((v) => v !== null, t("validation.required")),
        payment_method_id: z.number().nullable(),
        description: z.string().max(200, t("validation.max200")),
        spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("validation.required")),
      }),
    [t],
  );
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: initial?.amount ? centsToInput(initial.amount) : "",
      category_id: initial?.category_id ?? null,
      payment_method_id: initial?.payment_method_id ?? null,
      description: initial?.description ?? "",
      spent_on: initial?.spent_on ?? toISODate(new Date()),
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSubmit({
        amount: parseMoney(v.amount)!,
        category_id: v.category_id!,
        payment_method_id: v.payment_method_id,
        description: v.description.trim(),
        spent_on: v.spent_on,
      });
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="expense-amount">{t("expenses.amount")}</Label>
        <MoneyInput id="expense-amount" autoFocus aria-invalid={!!errors.amount} aria-describedby="expense-amount-error" {...form.register("amount")} />
        <FieldError id="expense-amount-error" message={errors.amount?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="expense-category">{t("expenses.category")}</Label>
          <Controller
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <CategorySelect id="expense-category" kind="expense" value={field.value} onChange={field.onChange} invalid={!!errors.category_id} />
            )}
          />
          <FieldError id="expense-category-error" message={errors.category_id?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-method">{t("expenses.paymentMethod")}</Label>
          <Controller
            control={form.control}
            name="payment_method_id"
            render={({ field }) => <PaymentMethodSelect id="expense-method" value={field.value} onChange={field.onChange} />}
          />
          <FieldError message={errors.payment_method_id?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="expense-date">{t("expenses.date")}</Label>
          <Input id="expense-date" type="date" aria-invalid={!!errors.spent_on} {...form.register("spent_on")} />
          <FieldError message={errors.spent_on?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-description">{t("expenses.description")}</Label>
          <Input id="expense-description" maxLength={200} {...form.register("description")} />
          <FieldError message={errors.description?.message} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Implement the list** `web/src/components/expenses/expense-list.tsx`

```tsx
"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/common/confirm-button";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Expense } from "@/lib/api/types";
import { parseISODate } from "@/lib/dates";
import {
  useCategories, useDeleteExpense, useExpenses, usePaymentMethods, useUpdateExpense, type ExpenseFilters,
} from "@/lib/query/hooks";
import { ExpenseForm } from "./expense-form";

export function ExpenseList({ filters }: { filters: ExpenseFilters }) {
  const t = useTranslations();
  const locale = useLocale();
  const q = useExpenses(filters);
  const { data: categories = [] } = useCategories();
  const { data: methods = [] } = usePaymentMethods();
  const update = useUpdateExpense();
  const remove = useDeleteExpense();
  const [editing, setEditing] = useState<Expense | null>(null);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const pmById = useMemo(() => new Map(methods.map((p) => [p.id, p])), [methods]);
  const rows = q.data?.pages.flatMap((p) => p.items ?? []) ?? [];
  const day = (s: string) => format(parseISODate(s), "EEE d MMM", { locale: locale === "en" ? enUS : es });

  if (q.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (rows.length === 0) return <EmptyState>{t("expenses.empty")}</EmptyState>;

  const actions = (e: Expense) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label={t("common.edit")} onClick={() => setEditing(e)}><Pencil /></Button>
      <ConfirmButton onConfirm={() => remove.mutate(e.id, { onSuccess: () => toast.success(t("common.deleted")) })}>
        <Button variant="ghost" size="icon" aria-label={t("common.delete")}><Trash2 /></Button>
      </ConfirmButton>
    </div>
  );
  const category = (e: Expense) => {
    const c = catById.get(e.category_id);
    return (
      <span className="inline-flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: c?.color }} aria-hidden />
        {c?.name}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* mobile: cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{e.description || catById.get(e.category_id)?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {day(e.spent_on)} · {category(e)}{e.payment_method_id ? ` · ${pmById.get(e.payment_method_id)?.nickname ?? ""}` : ""}
              </p>
            </div>
            <Money cents={e.amount} className="font-medium" />
            {actions(e)}
          </li>
        ))}
      </ul>
      {/* desktop: table */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>{t("expenses.date")}</TableHead>
            <TableHead>{t("expenses.description")}</TableHead>
            <TableHead>{t("expenses.category")}</TableHead>
            <TableHead>{t("expenses.paymentMethod")}</TableHead>
            <TableHead className="text-right">{t("expenses.amount")}</TableHead>
            <TableHead><span className="sr-only">{t("common.actions")}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap">{day(e.spent_on)}</TableCell>
              <TableCell className="max-w-64 truncate">{e.description}</TableCell>
              <TableCell>{category(e)}</TableCell>
              <TableCell>{e.payment_method_id ? pmById.get(e.payment_method_id)?.nickname : "—"}</TableCell>
              <TableCell className="text-right"><Money cents={e.amount} /></TableCell>
              <TableCell>{actions(e)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{t("expenses.loadMore")}</Button>
        </div>
      )}
      <ResponsiveDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={t("expenses.edit")}>
        {editing && (
          <ExpenseForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              await update.mutateAsync({ id: editing.id, ...v });
              toast.success(t("common.saved"));
              setEditing(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
```

- [ ] **Step 4: Page and quick add**

`web/src/app/[locale]/(app)/expenses/page.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { CategorySelect } from "@/components/common/category-select";
import { PaymentMethodSelect } from "@/components/common/payment-method-select";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ExpenseList } from "@/components/expenses/expense-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { periodRange } from "@/lib/dates";
import { useCreateExpense } from "@/lib/query/hooks";

export default function ExpensesPage() {
  const t = useTranslations();
  const month = periodRange("month", new Date());
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [methodId, setMethodId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [creating, setCreating] = useState(false);
  const create = useCreateExpense();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("expenses.title")}</h1>
        <Button onClick={() => setCreating(true)}><Plus /> {t("expenses.new")}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="f-from">{t("common.from")}</Label>
          <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-to">{t("common.to")}</Label>
          <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-cat">{t("expenses.category")}</Label>
          <div className="flex gap-1">
            <CategorySelect id="f-cat" kind="expense" value={categoryId} onChange={setCategoryId} placeholder={t("common.all")} />
            {categoryId && <Button variant="ghost" size="sm" onClick={() => setCategoryId(null)}>×</Button>}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-pm">{t("expenses.paymentMethod")}</Label>
          <PaymentMethodSelect id="f-pm" value={methodId} onChange={setMethodId} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-q">{t("common.search")}</Label>
          <Input id="f-q" type="search" placeholder={t("expenses.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <ExpenseList
        filters={{
          from: from || undefined, to: to || undefined, q: q || undefined,
          category_id: categoryId ?? undefined, payment_method_id: methodId ?? undefined,
        }}
      />
      <ResponsiveDialog open={creating} onOpenChange={setCreating} title={t("expenses.new")}>
        <ExpenseForm
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            await create.mutateAsync(v);
            toast.success(t("common.saved"));
            setCreating(false);
          }}
        />
      </ResponsiveDialog>
    </div>
  );
}
```

In the filter bar, "Sin método" in `PaymentMethodSelect` means "all methods": `methodId === null` sends no filter. That is acceptable; the API has no "no method" filter.

`web/src/components/expenses/quick-add.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useCreateExpense } from "@/lib/query/hooks";
import { ExpenseForm } from "./expense-form";

export function QuickAdd({ variant }: { variant: "fab" | "button" }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const create = useCreateExpense();
  return (
    <>
      {variant === "fab" ? (
        <Button size="icon" className="-mt-6 size-14 rounded-full shadow-lg" aria-label={t("nav.quickAdd")} onClick={() => setOpen(true)}>
          <Plus className="size-6" />
        </Button>
      ) : (
        <Button className="w-full" onClick={() => setOpen(true)}><Plus /> {t("nav.quickAdd")}</Button>
      )}
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t("expenses.new")}>
        <ExpenseForm
          onCancel={() => setOpen(false)}
          onSubmit={async (v) => {
            await create.mutateAsync(v);
            toast.success(t("common.saved"));
            setOpen(false);
          }}
        />
      </ResponsiveDialog>
    </>
  );
}
```

- [ ] **Step 5: Run the tests and verify manually.** Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. Then in `pnpm dev`:
  - add an expense from the **+** button at 375px (the bottom sheet opens and the amount field is focused)
  - edit it and delete it
  - filter by date and search, and check the "Load more" button appears after 50 rows (seed quickly with a loop of `curl` calls if needed)

- [ ] **Step 6: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "feat(web): expenses list with filters, edit/delete, and quick add"
```

---

### Task W6: Month view (income, fixed payments, MSI rows)

**Files:**
- Create: `web/src/components/month/entry-actions.ts`, `web/src/components/month/entry-actions.test.ts`, `web/src/components/month/entry-row.tsx`, `web/src/components/month/entry-form.tsx`
- Replace: `web/src/app/[locale]/(app)/month/[month]/page.tsx`

**Interfaces:**
- Consumes: `useMonthEntries`, `useUpdateEntry`, `useSummary`, `MonthNav`, `Money`, `MoneyInput`, `PaymentMethodSelect`, `ResponsiveDialog`
- Produces:
  - `entryActions(e: Entry): Array<{ key: "markPaid" | "markReceived" | "skip" | "undo"; status: "pending" | "paid" | "received" | "skipped" }>`
  - `<EntryRow entry />`, `<EntryForm entry onDone />`

- [ ] **Step 1: Write the failing test** `web/src/components/month/entry-actions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { Entry } from "@/lib/api/types";
import { entryActions } from "./entry-actions";

const e = (kind: string, status: string) => ({ id: 1, kind, status, amount: 1, name: "x", due_date: "2026-03-01", month: "2026-03" }) as Entry;

describe("entryActions", () => {
  it("pending income can be received or skipped", () => {
    expect(entryActions(e("income", "pending")).map((a) => a.key)).toEqual(["markReceived", "skip"]);
  });
  it("pending fixed/installment can be paid or skipped", () => {
    expect(entryActions(e("fixed", "pending")).map((a) => a.status)).toEqual(["paid", "skipped"]);
    expect(entryActions(e("installment", "pending")).map((a) => a.key)).toEqual(["markPaid", "skip"]);
  });
  it("settled or skipped rows can only be undone", () => {
    for (const [k, s] of [["income", "received"], ["fixed", "paid"], ["fixed", "skipped"]]) {
      expect(entryActions(e(k, s))).toEqual([{ key: "undo", status: "pending" }]);
    }
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: Implement** `web/src/components/month/entry-actions.ts`

```ts
import type { Entry } from "@/lib/api/types";

export type EntryAction = { key: "markPaid" | "markReceived" | "skip" | "undo"; status: "pending" | "paid" | "received" | "skipped" };

export function entryActions(e: Entry): EntryAction[] {
  if (e.status !== "pending") return [{ key: "undo", status: "pending" }];
  return e.kind === "income"
    ? [{ key: "markReceived", status: "received" }, { key: "skip", status: "skipped" }]
    : [{ key: "markPaid", status: "paid" }, { key: "skip", status: "skipped" }];
}
```

- [ ] **Step 3: Entry form** `web/src/components/month/entry-form.tsx` (amount and payment method; installment rows are read-only here)

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { PaymentMethodSelect } from "@/components/common/payment-method-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Entry } from "@/lib/api/types";
import { centsToInput, parseMoney } from "@/lib/money";
import { useUpdateEntry } from "@/lib/query/hooks";

export function EntryForm({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const t = useTranslations();
  const update = useUpdateEntry();
  const [amount, setAmount] = useState(centsToInput(entry.amount));
  const [pm, setPm] = useState<number | null>(entry.payment_method_id ?? null);
  const [error, setError] = useState<string>();

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null) return setError(t("validation.amount"));
    try {
      await update.mutateAsync({
        id: entry.id, amount: cents, status: entry.status, settled_on: entry.settled_on ?? undefined,
        payment_method_id: entry.kind === "income" ? undefined : pm ?? undefined,
      });
      toast.success(t("common.saved"));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="entry-amount">{t("recurring.amount")}</Label>
        <MoneyInput id="entry-amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!error} />
        <FieldError message={error} />
      </div>
      {entry.kind === "fixed" && (
        <div className="space-y-2">
          <Label htmlFor="entry-pm">{t("expenses.paymentMethod")}</Label>
          <PaymentMethodSelect id="entry-pm" value={pm} onChange={setPm} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={update.isPending}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
```

The API's `PUT /entries/{id}` replaces `payment_method_id`. Sending `undefined` serializes as an absent key, i.e. `null`, which is right for income and clears the method when `pm` is null.

- [ ] **Step 4: Row and page**

`web/src/components/month/entry-row.tsx`:

```tsx
"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Entry } from "@/lib/api/types";
import { parseISODate } from "@/lib/dates";
import { useUpdateEntry } from "@/lib/query/hooks";
import { cn } from "@/lib/utils";
import { entryActions } from "./entry-actions";
import { EntryForm } from "./entry-form";

export function EntryRow({ entry }: { entry: Entry }) {
  const t = useTranslations("month");
  const tc = useTranslations("common");
  const locale = useLocale();
  const update = useUpdateEntry();
  const [editing, setEditing] = useState(false);
  const due = format(parseISODate(entry.due_date), "d MMM", { locale: locale === "en" ? enUS : es });

  const setStatus = (status: string) =>
    update.mutate(
      { id: entry.id, amount: entry.amount, status, payment_method_id: entry.payment_method_id ?? undefined },
      { onError: (e) => toast.error(e.message) },
    );

  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3", entry.status === "skipped" && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", entry.status === "skipped" && "line-through")}>{entry.name}</p>
        <p className="text-xs text-muted-foreground">
          {t("due", { date: due })}
          {entry.edited && ` · ${t("edited")}`}
        </p>
      </div>
      <Badge variant={entry.status === "pending" ? "outline" : "secondary"}>{t(`status.${entry.status}`)}</Badge>
      <Money cents={entry.amount} className="w-28 text-right font-medium" />
      <div className="flex gap-1">
        {entryActions(entry).map((a) => (
          <Button key={a.key} size="sm" variant={a.key === "markPaid" || a.key === "markReceived" ? "default" : "ghost"} disabled={update.isPending} onClick={() => setStatus(a.status)}>
            {t(a.key)}
          </Button>
        ))}
        {entry.kind !== "installment" && (
          <Button size="icon" variant="ghost" aria-label={tc("edit")} onClick={() => setEditing(true)}><Pencil /></Button>
        )}
      </div>
      <ResponsiveDialog open={editing} onOpenChange={setEditing} title={t("editEntry")}>
        <EntryForm entry={entry} onDone={() => setEditing(false)} />
      </ResponsiveDialog>
    </li>
  );
}
```

`web/src/app/[locale]/(app)/month/[month]/page.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { notFound, useParams } from "next/navigation";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { MonthNav } from "@/components/common/month-nav";
import { EntryRow } from "@/components/month/entry-row";
import type { Entry } from "@/lib/api/types";
import { useMonthEntries, useSummary } from "@/lib/query/hooks";
import { cn } from "@/lib/utils";

export default function MonthPage() {
  const { month } = useParams<{ month: string }>();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const t = useTranslations();
  const entries = useMonthEntries(month);
  const summary = useSummary(month);

  const groups: Array<[string, Entry[]]> = [
    [t("month.income"), (entries.data ?? []).filter((e) => e.kind === "income")],
    [t("month.fixed"), (entries.data ?? []).filter((e) => e.kind === "fixed")],
    [t("month.installments"), (entries.data ?? []).filter((e) => e.kind === "installment")],
  ];
  const s = summary.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("month.title")}</h1>
        <MonthNav month={month} basePath="/month" />
      </div>
      {s && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([
            ["dashboard.income", s.income],
            ["dashboard.fixed", s.fixed_committed],
            ["dashboard.installments", s.installments],
            ["dashboard.spent.month", s.spent],
            ["dashboard.available", s.available],
          ] as const).map(([k, v]) => (
            <div key={k} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{t(k)}</dt>
              <dd className={cn("text-lg font-semibold", k === "dashboard.available" && (v ?? 0) < 0 && "text-critical")}>
                <Money cents={v ?? 0} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {entries.error && <p role="alert" className="text-sm text-destructive">{entries.error.message}</p>}
      {entries.data?.length === 0 && <EmptyState>{t("month.empty")}</EmptyState>}
      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <section key={title} className="space-y-2">
            <h2 className="flex justify-between text-sm font-medium text-muted-foreground">
              <span>{title}</span>
              <Money cents={list.filter((e) => e.status !== "skipped").reduce((a, e) => a + e.amount, 0)} />
            </h2>
            <ul className="space-y-2">{list.map((e) => <EntryRow key={e.id} entry={e} />)}</ul>
          </section>
        ),
      )}
    </div>
  );
}
```

Negative Available here is text-only red; it sits beside its label "Disponible del mes", and the dashboard KPI (W10) carries the icon + "Sobregirado" treatment. The month header is a compact recap.

- [ ] **Step 5: Verify.** Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. In `pnpm dev`, with an income source and a fixed payment in place (from W7, or created via the API with curl), check:
  - `/es/month/2026-03` shows the rows
  - "Marcar pagado" flips the badge and the header recap updates
  - "Deshacer" reverts
  - month navigation works
  - 13+ months ahead shows the API's 422 message

- [ ] **Step 6: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "feat(web): month view with income, fixed and MSI rows and status actions"
```

---

### Task W7: Recurring templates (income sources and fixed payments)

**Files:**
- Create: `web/src/components/recurring/template-form.tsx`, `web/src/components/recurring/template-form.test.tsx`
- Replace: `web/src/app/[locale]/(app)/recurring/page.tsx`

**Interfaces:**
- Consumes: the income/fixed hooks, `CategorySelect`, `PaymentMethodSelect`, `MoneyInput`, `ResponsiveDialog`, `Money`, `applyApiError`
- Produces: `<TemplateForm kind="income" | "fixed" initial? onSubmit(v: IncomeSourceInput | FixedPaymentInput) onCancel? />` (one form for both kinds: fixed adds a required expense category and an optional payment method; income has an optional income category)

- [ ] **Step 1: Write the failing test** `web/src/components/recurring/template-form.test.tsx`

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { TemplateForm } from "./template-form";

vi.mock("@/lib/query/hooks", () => ({
  useCategories: () => ({ data: [{ id: 5, name: "Vivienda", kind: "expense", color: "#8b5cf6", icon: "home" }] }),
  usePaymentMethods: () => ({ data: [] }),
  useMe: () => ({ data: { currency: "MXN" } }),
}));

describe("TemplateForm", () => {
  it("validates the day of month", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TemplateForm kind="income" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Nombre"), "Salario");
    await userEvent.type(screen.getByLabelText("Monto"), "25000");
    await userEvent.clear(screen.getByLabelText("Día del mes"));
    await userEvent.type(screen.getByLabelText("Día del mes"), "32");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Día entre 1 y 31")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a fixed payment with cents and months", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <TemplateForm kind="fixed" initial={{ category_id: 5, start_month: "2026-03" }} onSubmit={onSubmit} />,
    );
    await userEvent.type(screen.getByLabelText("Nombre"), "Renta");
    await userEvent.type(screen.getByLabelText("Monto"), "10,000");
    await userEvent.clear(screen.getByLabelText("Día del mes"));
    await userEvent.type(screen.getByLabelText("Día del mes"), "31");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Renta", amount: 1000000, day_of_month: 31, start_month: "2026-03", end_month: null,
        category_id: 5, payment_method_id: null, active: true,
      }),
    );
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: Implement** `web/src/components/recurring/template-form.tsx`

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CategorySelect } from "@/components/common/category-select";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { PaymentMethodSelect } from "@/components/common/payment-method-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FixedPayment, FixedPaymentInput, IncomeSource, IncomeSourceInput } from "@/lib/api/types";
import { toMonthKey } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { centsToInput, parseMoney } from "@/lib/money";

type Kind = "income" | "fixed";
type Values = {
  name: string; amount: string; day_of_month: number; start_month: string; end_month: string;
  category_id: number | null; payment_method_id: number | null;
};

export function TemplateForm({ kind, initial, onSubmit, onCancel }: {
  kind: Kind;
  initial?: Partial<IncomeSource & FixedPayment>;
  onSubmit: (v: IncomeSourceInput | FixedPaymentInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, t("validation.required")).max(80),
          amount: z.string().refine((v) => parseMoney(v) !== null, t("validation.amount")),
          day_of_month: z.coerce.number().int().min(1, t("validation.day")).max(31, t("validation.day")),
          start_month: z.string().regex(/^\d{4}-\d{2}$/, t("validation.required")),
          end_month: z.string(),
          category_id: z.number().nullable(),
          payment_method_id: z.number().nullable(),
        })
        .refine((v) => kind === "income" || v.category_id !== null, { path: ["category_id"], message: t("validation.required") }),
    [t, kind],
  );
  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      name: initial?.name ?? "",
      amount: initial?.amount ? centsToInput(initial.amount) : "",
      day_of_month: initial?.day_of_month ?? 1,
      start_month: initial?.start_month ?? toMonthKey(new Date()),
      end_month: initial?.end_month ?? "",
      category_id: initial?.category_id ?? null,
      payment_method_id: initial?.payment_method_id ?? null,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (v) => {
    const base = {
      name: v.name.trim(), amount: parseMoney(v.amount)!, day_of_month: Number(v.day_of_month),
      start_month: v.start_month, end_month: v.end_month || null, active: initial?.active ?? true,
    };
    try {
      await onSubmit(
        kind === "income"
          ? { ...base, category_id: v.category_id }
          : { ...base, category_id: v.category_id!, payment_method_id: v.payment_method_id },
      );
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="tpl-name">{t("recurring.name")}</Label>
        <Input id="tpl-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tpl-amount">{t("recurring.amount")}</Label>
          <MoneyInput id="tpl-amount" aria-invalid={!!errors.amount} {...form.register("amount")} />
          <FieldError message={errors.amount?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpl-day">{t("recurring.day")}</Label>
          <Input id="tpl-day" type="number" min={1} max={31} inputMode="numeric" aria-describedby="tpl-day-hint" aria-invalid={!!errors.day_of_month} {...form.register("day_of_month")} />
          <p id="tpl-day-hint" className="text-xs text-muted-foreground">{t("recurring.dayHint")}</p>
          <FieldError message={errors.day_of_month?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tpl-category">{t("expenses.category")}</Label>
          <Controller
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <CategorySelect id="tpl-category" kind={kind === "income" ? "income" : "expense"} value={field.value} onChange={field.onChange} invalid={!!errors.category_id} />
            )}
          />
          <FieldError message={errors.category_id?.message} />
        </div>
        {kind === "fixed" && (
          <div className="space-y-2">
            <Label htmlFor="tpl-pm">{t("expenses.paymentMethod")}</Label>
            <Controller
              control={form.control}
              name="payment_method_id"
              render={({ field }) => <PaymentMethodSelect id="tpl-pm" value={field.value} onChange={field.onChange} />}
            />
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tpl-start">{t("recurring.startMonth")}</Label>
          <Input id="tpl-start" type="month" aria-invalid={!!errors.start_month} {...form.register("start_month")} />
          <FieldError message={errors.start_month?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tpl-end">{t("recurring.endMonth")} ({t("common.optional")})</Label>
          <Input id="tpl-end" type="month" aria-describedby="tpl-end-hint" {...form.register("end_month")} />
          <p id="tpl-end-hint" className="text-xs text-muted-foreground">{t("recurring.endMonthHint")}</p>
          <FieldError message={errors.end_month?.message} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
```

The test submits income without a category, so `category_id` is `null` and the income branch keeps it `null`. The fixed test expects `category_id: 5, payment_method_id: null`. Key order in `toHaveBeenCalledWith` does not matter.

- [ ] **Step 3: Page** `web/src/app/[locale]/(app)/recurring/page.tsx`

```tsx
"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { TemplateForm } from "@/components/recurring/template-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FixedPayment, IncomeSource } from "@/lib/api/types";
import {
  useCreateFixedPayment, useCreateIncomeSource, useDeactivateFixedPayment, useDeactivateIncomeSource,
  useFixedPayments, useIncomeSources, useUpdateFixedPayment, useUpdateIncomeSource,
} from "@/lib/query/hooks";

type Row = (IncomeSource | FixedPayment) & { id: number };

function TemplateList({ rows, onEdit, onToggle }: {
  rows: Row[]; onEdit: (r: Row) => void; onToggle: (r: Row) => void;
}) {
  const t = useTranslations();
  if (rows.length === 0) return <EmptyState>{t("common.empty")}</EmptyState>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.name}</p>
            <p className="text-xs text-muted-foreground">
              {t("recurring.everyMonth", { day: r.day_of_month })} · {r.start_month}{r.end_month ? ` – ${r.end_month}` : ""}
            </p>
          </div>
          {!r.active && <Badge variant="outline">{t("common.inactive")}</Badge>}
          <Money cents={r.amount} className="font-medium" />
          <Button size="icon" variant="ghost" aria-label={t("common.edit")} onClick={() => onEdit(r)}><Pencil /></Button>
          <Button size="sm" variant="ghost" onClick={() => onToggle(r)}>
            {r.active ? t("recurring.deactivate") : t("common.activate")}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default function RecurringPage() {
  const t = useTranslations();
  const incomes = useIncomeSources();
  const fixed = useFixedPayments();
  const [tab, setTab] = useState<"income" | "fixed">("income");
  const [dialog, setDialog] = useState<{ kind: "income" | "fixed"; row?: Row } | null>(null);
  const createIncome = useCreateIncomeSource();
  const updateIncome = useUpdateIncomeSource();
  const offIncome = useDeactivateIncomeSource();
  const createFixed = useCreateFixedPayment();
  const updateFixed = useUpdateFixedPayment();
  const offFixed = useDeactivateFixedPayment();

  // Reactivation is a full PUT with active=true (the API has no separate endpoint).
  const toggle = (kind: "income" | "fixed", r: Row) => {
    const done = { onSuccess: () => toast.success(t("common.saved")), onError: (e: Error) => toast.error(e.message) };
    if (r.active) return kind === "income" ? offIncome.mutate(r.id, done) : offFixed.mutate(r.id, done);
    const { id, ...rest } = r;
    return kind === "income"
      ? updateIncome.mutate({ id, ...(rest as IncomeSource), active: true }, done)
      : updateFixed.mutate({ id, ...(rest as FixedPayment), active: true }, done);
  };

  const title = dialog
    ? dialog.row ? t(dialog.kind === "income" ? "recurring.editIncome" : "recurring.editFixed")
      : t(dialog.kind === "income" ? "recurring.newIncome" : "recurring.newFixed")
    : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("recurring.title")}</h1>
        <Button onClick={() => setDialog({ kind: tab })}>
          <Plus /> {t(tab === "income" ? "recurring.newIncome" : "recurring.newFixed")}
        </Button>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "income" | "fixed")}>
        <TabsList>
          <TabsTrigger value="income">{t("recurring.incomeSources")}</TabsTrigger>
          <TabsTrigger value="fixed">{t("recurring.fixedPayments")}</TabsTrigger>
        </TabsList>
        <TabsContent value="income" className="pt-4">
          <TemplateList rows={(incomes.data ?? []) as Row[]} onEdit={(row) => setDialog({ kind: "income", row })} onToggle={(r) => toggle("income", r)} />
        </TabsContent>
        <TabsContent value="fixed" className="pt-4">
          <TemplateList rows={(fixed.data ?? []) as Row[]} onEdit={(row) => setDialog({ kind: "fixed", row })} onToggle={(r) => toggle("fixed", r)} />
        </TabsContent>
      </Tabs>
      <ResponsiveDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} title={title}>
        {dialog && (
          <TemplateForm
            kind={dialog.kind}
            initial={dialog.row}
            onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              if (dialog.kind === "income") {
                if (dialog.row) await updateIncome.mutateAsync({ id: dialog.row.id, ...(v as IncomeSource) });
                else await createIncome.mutateAsync(v);
              } else {
                if (dialog.row) await updateFixed.mutateAsync({ id: dialog.row.id, ...(v as FixedPayment) });
                else await createFixed.mutateAsync(v as FixedPayment);
              }
              toast.success(t("common.saved"));
              setDialog(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
```

- [ ] **Step 4: Verify.** Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. In `pnpm dev`:
  - create a salary (day 15) and rent (day 31, on a card)
  - the month view (W6) shows them, with rent due on the last day of short months
  - editing rent's amount updates the current month's pending row
  - deactivate and reactivate work

- [ ] **Step 5: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "feat(web): recurring income sources and fixed payments management"
```

---
### Task W8: Cards — payment methods, statements, card payments, MSI plans

**Files:**
- Create: `web/src/components/cards/payment-method-form.tsx`, `web/src/components/cards/payment-method-form.test.tsx`, `web/src/components/cards/card-payment-form.tsx`, `web/src/components/cards/plan-form.tsx`, `web/src/components/cards/statement-view.tsx`, `web/src/components/cards/plans-list.tsx`, `web/src/components/common/meter.tsx`
- Replace: `web/src/app/[locale]/(app)/cards/page.tsx`, `web/src/app/[locale]/(app)/cards/[id]/page.tsx`

**Interfaces:**
- Consumes: the payment-method, statement, card-payment and plan hooks, plus `useCardsOverview`; shared components; `parseMoney`, `centsToInput`, `toISODate`, `parseMonthKey`, `toMonthKey`
- Produces:
  - `<PaymentMethodForm initial? onSubmit(v: PaymentMethodInput) onCancel? />`
  - `<CardPaymentForm cardId defaultAmount onDone />`
  - `<PlanForm cardId initial? onSubmit onCancel? />`
  - `<StatementView cardId />`, `<PlansList cardId />`
  - `<Meter value max label />`, a neutral horizontal meter using `--chart-1` with a visible percentage label

- [ ] **Step 1: Write the failing test** `web/src/components/cards/payment-method-form.test.tsx`

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PaymentMethodForm } from "./payment-method-form";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

describe("PaymentMethodForm", () => {
  it("rejects anything but exactly 4 digits for last4", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PaymentMethodForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Alias"), "Nómina");
    await userEvent.type(screen.getByLabelText("Últimos 4 dígitos"), "12a4");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Exactamente 4 dígitos")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("limits last4 input length and never offers a full-number field", () => {
    renderWithProviders(<PaymentMethodForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Últimos 4 dígitos")).toHaveAttribute("maxLength", "4");
    expect(screen.queryByLabelText(/número|number|cvv/i)).toBeNull();
  });

  it("builds a credit card payload with cents and cycle days", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<PaymentMethodForm initial={{ type: "credit" }} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Alias"), "BBVA Oro");
    await userEvent.type(screen.getByLabelText("Últimos 4 dígitos"), "4242");
    await userEvent.type(screen.getByLabelText("Límite de crédito"), "50,000");
    await userEvent.clear(screen.getByLabelText("Día de corte"));
    await userEvent.type(screen.getByLabelText("Día de corte"), "15");
    await userEvent.clear(screen.getByLabelText("Día límite de pago"));
    await userEvent.type(screen.getByLabelText("Día límite de pago"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const v = onSubmit.mock.calls[0][0];
    expect(v).toMatchObject({
      nickname: "BBVA Oro", type: "credit", last4: "4242", credit_limit: 5000000,
      statement_day: 15, payment_due_day: 5, opening_balance: 0,
    });
    expect(v.opening_balance_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("debit cards hide and null the credit fields", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<PaymentMethodForm initial={{ type: "debit" }} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText("Día de corte")).toBeNull();
    await userEvent.type(screen.getByLabelText("Alias"), "Nómina");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        type: "debit", credit_limit: null, statement_day: null, payment_due_day: null, opening_balance: 0, opening_balance_date: null,
      }),
    );
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: Implement** `web/src/components/cards/payment-method-form.tsx`

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentMethod, PaymentMethodInput } from "@/lib/api/types";
import { toISODate } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { centsToInput, parseMoney } from "@/lib/money";

const TYPES = ["credit", "debit", "cash", "transfer"] as const;
const NETWORKS = ["visa", "mastercard", "amex", "other"] as const;
const selectCls = "h-9 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-60";

type Values = {
  nickname: string; type: (typeof TYPES)[number]; bank: string; network: string; last4: string; color: string; active: boolean;
  credit_limit: string; statement_day: number; payment_due_day: number; opening_balance: string; opening_balance_date: string;
};

export function PaymentMethodForm({ initial, onSubmit, onCancel }: {
  initial?: Partial<PaymentMethod>;
  onSubmit: (v: PaymentMethodInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const editing = initial?.id !== undefined;
  const schema = useMemo(
    () =>
      z
        .object({
          nickname: z.string().trim().min(1, t("validation.required")).max(60),
          type: z.enum(TYPES),
          bank: z.string().max(60),
          network: z.string(),
          last4: z.string().refine((v) => v === "" || /^\d{4}$/.test(v), t("validation.last4")),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          active: z.boolean(),
          credit_limit: z.string().refine((v) => v.trim() === "" || parseMoney(v) !== null, t("validation.amount")),
          statement_day: z.coerce.number(),
          payment_due_day: z.coerce.number(),
          opening_balance: z.string().refine((v) => v.trim() === "" || parseMoney(v) !== null || /^0+$/.test(v.trim()), t("validation.amount")),
          opening_balance_date: z.string(),
        })
        .superRefine((v, ctx) => {
          if (v.type !== "credit") return;
          for (const k of ["statement_day", "payment_due_day"] as const) {
            if (!Number.isInteger(v[k]) || v[k] < 1 || v[k] > 31) ctx.addIssue({ code: "custom", path: [k], message: t("validation.day") });
          }
        }),
    [t],
  );
  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      nickname: initial?.nickname ?? "",
      type: (initial?.type as Values["type"]) ?? "debit",
      bank: initial?.bank ?? "",
      network: initial?.network ?? "",
      last4: initial?.last4 ?? "",
      color: initial?.color ?? "#64748b",
      active: initial?.active ?? true,
      credit_limit: initial?.credit_limit ? centsToInput(initial.credit_limit) : "",
      statement_day: initial?.statement_day ?? 1,
      payment_due_day: initial?.payment_due_day ?? 20,
      opening_balance: initial?.opening_balance ? centsToInput(initial.opening_balance) : "",
      opening_balance_date: initial?.opening_balance_date ?? toISODate(new Date()),
    },
  });
  const { errors, isSubmitting } = form.formState;
  const type = form.watch("type");
  const credit = type === "credit";

  const submit = form.handleSubmit(async (v) => {
    const opening = v.opening_balance.trim() === "" ? 0 : parseMoney(v.opening_balance) ?? 0;
    const input: PaymentMethodInput = {
      nickname: v.nickname.trim(), type: v.type, bank: v.bank.trim() || null, network: v.network || null,
      last4: v.last4 || null, color: v.color, active: v.active,
      credit_limit: credit && v.credit_limit.trim() ? parseMoney(v.credit_limit) : null,
      statement_day: credit ? Number(v.statement_day) : null,
      payment_due_day: credit ? Number(v.payment_due_day) : null,
      opening_balance: credit ? opening : 0,
      opening_balance_date: credit ? v.opening_balance_date : null,
    };
    try {
      await onSubmit(input);
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pm-nickname">{t("cards.nickname")}</Label>
          <Input id="pm-nickname" aria-invalid={!!errors.nickname} {...form.register("nickname")} />
          <FieldError message={errors.nickname?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pm-type">{t("cards.type")}</Label>
          <select id="pm-type" className={selectCls} disabled={editing} {...form.register("type")}>
            {TYPES.map((ty) => <option key={ty} value={ty}>{t(`cards.types.${ty}`)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="pm-bank">{t("cards.bank")}</Label>
          <Input id="pm-bank" {...form.register("bank")} />
          <FieldError message={errors.bank?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pm-network">{t("cards.network")}</Label>
          <select id="pm-network" className={selectCls} {...form.register("network")}>
            <option value="">—</option>
            {NETWORKS.map((n) => <option key={n} value={n}>{n === "other" ? "…" : n.toUpperCase()}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pm-last4">{t("cards.last4")}</Label>
          <Input id="pm-last4" inputMode="numeric" maxLength={4} autoComplete="off" aria-describedby="pm-last4-hint" aria-invalid={!!errors.last4} {...form.register("last4")} />
          <FieldError message={errors.last4?.message} />
        </div>
      </div>
      <p id="pm-last4-hint" className="text-xs text-muted-foreground">{t("cards.last4Hint")}</p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="pm-color">{t("categories.color")}</Label>
          <input id="pm-color" type="color" className="h-9 w-12 rounded border" {...form.register("color")} />
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("active")} /> {t("common.active")}
          </label>
        )}
      </div>
      {credit && (
        <fieldset className="space-y-4 rounded-lg border p-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pm-limit">{t("cards.creditLimit")}</Label>
              <MoneyInput id="pm-limit" aria-invalid={!!errors.credit_limit} {...form.register("credit_limit")} />
              <FieldError message={errors.credit_limit?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pm-statement">{t("cards.statementDay")}</Label>
              <Input id="pm-statement" type="number" min={1} max={31} aria-invalid={!!errors.statement_day} {...form.register("statement_day")} />
              <FieldError message={errors.statement_day?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pm-due">{t("cards.paymentDueDay")}</Label>
              <Input id="pm-due" type="number" min={1} max={31} aria-invalid={!!errors.payment_due_day} {...form.register("payment_due_day")} />
              <FieldError message={errors.payment_due_day?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pm-opening">{t("cards.openingBalance")}</Label>
              <MoneyInput id="pm-opening" aria-describedby="pm-opening-hint" aria-invalid={!!errors.opening_balance} {...form.register("opening_balance")} />
              <FieldError message={errors.opening_balance?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pm-opening-date">{t("cards.openingBalanceDate")}</Label>
              <Input id="pm-opening-date" type="date" {...form.register("opening_balance_date")} />
            </div>
          </div>
          <p id="pm-opening-hint" className="text-xs text-muted-foreground">{t("cards.openingHint")}</p>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
```

`editing` uses `initial?.id`. The test passes `initial={{ type: "credit" }}` with no id, so the type select stays enabled.

- [ ] **Step 3: Meter, payment form, plan form**

`web/src/components/common/meter.tsx`:

```tsx
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{(max > 0 ? (value / max) * 100 : 0).toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className="h-2 rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

`web/src/components/cards/card-payment-form.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/errors";
import { toISODate } from "@/lib/dates";
import { centsToInput, parseMoney } from "@/lib/money";
import { useCreateCardPayment } from "@/lib/query/hooks";

export function CardPaymentForm({ cardId, defaultAmount, onDone }: { cardId: number; defaultAmount: number; onDone: () => void }) {
  const t = useTranslations();
  const create = useCreateCardPayment();
  const [amount, setAmount] = useState(defaultAmount > 0 ? centsToInput(defaultAmount) : "");
  const [paidOn, setPaidOn] = useState(toISODate(new Date()));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null) return setErrors({ amount: t("validation.amount") });
    try {
      await create.mutateAsync({ payment_method_id: cardId, amount: cents, paid_on: paidOn, note: note.trim() });
      toast.success(t("common.saved"));
      onDone();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cp-amount">{t("recurring.amount")}</Label>
          <MoneyInput id="cp-amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!errors.amount} />
          <FieldError message={errors.amount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp-date">{t("expenses.date")}</Label>
          <Input id="cp-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          <FieldError message={errors.paid_on} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-note">{t("cards.note")} ({t("common.optional")})</Label>
        <Input id="cp-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={create.isPending}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
```

`web/src/components/cards/plan-form.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CategorySelect } from "@/components/common/category-select";
import { FieldError } from "@/components/common/field-error";
import { MoneyInput } from "@/components/common/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InstallmentPlan, InstallmentPlanInput } from "@/lib/api/types";
import { toISODate } from "@/lib/dates";
import { applyApiError } from "@/lib/forms";
import { centsToInput, parseMoney } from "@/lib/money";

type Values = { description: string; total_amount: string; installments: number; purchased_on: string; category_id: number | null };

export function PlanForm({ cardId, initial, onSubmit, onCancel }: {
  cardId: number; initial?: InstallmentPlan; onSubmit: (v: InstallmentPlanInput) => Promise<void>; onCancel?: () => void;
}) {
  const t = useTranslations();
  const schema = useMemo(
    () =>
      z.object({
        description: z.string().trim().min(1, t("validation.required")).max(120),
        total_amount: z.string().refine((v) => parseMoney(v) !== null, t("validation.amount")),
        installments: z.coerce.number().int().min(2, t("validation.installments")).max(48, t("validation.installments")),
        purchased_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("validation.required")),
        category_id: z.number().nullable().refine((v) => v !== null, t("validation.required")),
      }),
    [t],
  );
  const form = useForm<Values>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      description: initial?.description ?? "",
      total_amount: initial ? centsToInput(initial.total_amount) : "",
      installments: initial?.installments ?? 12,
      purchased_on: initial?.purchased_on ?? toISODate(new Date()),
      category_id: initial?.category_id ?? null,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSubmit({
        payment_method_id: cardId, category_id: v.category_id!, description: v.description.trim(),
        total_amount: parseMoney(v.total_amount)!, installments: Number(v.installments), purchased_on: v.purchased_on,
      });
    } catch (e) {
      applyApiError(e, form.setError, (m) => toast.error(m));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="plan-desc">{t("expenses.description")}</Label>
        <Input id="plan-desc" aria-invalid={!!errors.description} {...form.register("description")} />
        <FieldError message={errors.description?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="plan-total">{t("cards.totalAmount")}</Label>
          <MoneyInput id="plan-total" aria-invalid={!!errors.total_amount} {...form.register("total_amount")} />
          <FieldError message={errors.total_amount?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-n">{t("cards.installments")}</Label>
          <Input id="plan-n" type="number" min={2} max={48} list="plan-n-common" aria-invalid={!!errors.installments} {...form.register("installments")} />
          <datalist id="plan-n-common">{[3, 6, 9, 12, 18, 24].map((n) => <option key={n} value={n} />)}</datalist>
          <FieldError message={errors.installments?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="plan-date">{t("cards.purchasedOn")}</Label>
          <Input id="plan-date" type="date" {...form.register("purchased_on")} />
          <FieldError message={errors.purchased_on?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-cat">{t("expenses.category")}</Label>
          <Controller control={form.control} name="category_id" render={({ field }) => (
            <CategorySelect id="plan-cat" kind="expense" value={field.value} onChange={field.onChange} invalid={!!errors.category_id} />
          )} />
          <FieldError message={errors.category_id?.message} />
        </div>
      </div>
      <FieldError message={errors.root?.message} />
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={isSubmitting}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Statement view and plans list**

`web/src/components/cards/statement-view.tsx`:

```tsx
"use client";

import { addMonths, format, subMonths } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/common/confirm-button";
import { Meter } from "@/components/common/meter";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseISODate, parseMonthKey, toMonthKey } from "@/lib/dates";
import { useDeleteCardPayment, useStatement } from "@/lib/query/hooks";
import { CardPaymentForm } from "./card-payment-form";

export function StatementView({ cardId }: { cardId: number }) {
  const t = useTranslations();
  const locale = useLocale();
  const [cycle, setCycle] = useState<string | undefined>();
  const [paying, setPaying] = useState(false);
  const q = useStatement(cardId, cycle);
  const del = useDeleteCardPayment();
  const s = q.data;
  const fmt = (d: string, p = "d MMM") => format(parseISODate(d), p, { locale: locale === "en" ? enUS : es });

  if (q.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (q.error || !s) return <p role="alert" className="text-sm text-destructive">{q.error?.message}</p>;

  const shift = (n: number) => setCycle(toMonthKey((n > 0 ? addMonths : subMonths)(parseMonthKey(s.cycle), Math.abs(n))));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label={t("common.previous")} onClick={() => shift(-1)}><ChevronLeft /></Button>
          <span className="text-sm font-medium">{t("cards.cycle", { from: fmt(s.opens_on), to: fmt(s.closes_on) })}</span>
          <Button variant="outline" size="icon" aria-label={t("common.next")} onClick={() => shift(1)}><ChevronRight /></Button>
        </div>
        <Button onClick={() => setPaying(true)}>{t("cards.recordPayment")}</Button>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-lg border p-4 lg:col-span-1">
          <dt className="text-xs text-muted-foreground">{t("cards.amountDue")}</dt>
          <dd className="text-2xl font-semibold"><Money cents={s.amount_due} /></dd>
          <dd className="text-xs text-muted-foreground">{t("cards.dueOn")}: {fmt(s.due_on, "PPP")}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-xs text-muted-foreground">{t("cards.billed")}</dt>
          <dd className="text-lg font-semibold"><Money cents={s.billed_balance} /></dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-xs text-muted-foreground">{t("cards.currentBalance")}</dt>
          <dd className="text-lg font-semibold"><Money cents={s.current_balance} /></dd>
        </div>
        {s.credit_limit != null && (
          <div className="col-span-2 space-y-2 rounded-lg border p-4 lg:col-span-1">
            <Meter value={s.current_balance} max={s.credit_limit} label={t("cards.utilization")} />
            <p className="text-xs text-muted-foreground">{t("cards.available")}: <Money cents={s.available_credit ?? 0} /></p>
          </div>
        )}
      </dl>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t("cards.charges")}</h3>
          {(s.charges ?? []).length === 0 && (s.installments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("cards.noCharges")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {(s.charges ?? []).map((c, i) => (
                <li key={`c${i}`} className="flex items-center gap-3 p-3 text-sm">
                  <span className="w-16 text-muted-foreground">{fmt(c.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.description}</span>
                  <Badge variant="outline">{t(`cards.source.${c.source}`)}</Badge>
                  <Money cents={c.amount} />
                </li>
              ))}
              {(s.installments ?? []).map((m) => (
                <li key={`m${m.plan_id}`} className="flex items-center gap-3 p-3 text-sm">
                  <span className="w-16 text-muted-foreground">MSI</span>
                  <span className="min-w-0 flex-1 truncate">{m.description}</span>
                  <Badge variant="outline">{t("cards.installmentOf", { no: m.no, of: m.of })}</Badge>
                  <Money cents={m.amount} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t("cards.payments")}</h3>
          <ul className="divide-y rounded-lg border">
            {(s.payments ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3 text-sm">
                <span className="w-16 text-muted-foreground">{fmt(p.paid_on)}</span>
                <span className="min-w-0 flex-1 truncate">{p.note}</span>
                <Money cents={p.amount} />
                <ConfirmButton onConfirm={() => del.mutate(p.id)}>
                  <Button variant="ghost" size="icon" aria-label={t("common.delete")}><Trash2 /></Button>
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ResponsiveDialog open={paying} onOpenChange={setPaying} title={t("cards.recordPayment")}>
        <CardPaymentForm cardId={cardId} defaultAmount={s.amount_due} onDone={() => setPaying(false)} />
      </ResponsiveDialog>
    </section>
  );
}
```

`web/src/components/cards/plans-list.tsx`:

```tsx
"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/common/confirm-button";
import { Meter } from "@/components/common/meter";
import { Money, useFormatMoney } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InstallmentPlan } from "@/lib/api/types";
import { useCancelPlan, useCreatePlan, usePlans, useUpdatePlan } from "@/lib/query/hooks";
import { PlanForm } from "./plan-form";

export function PlansList({ cardId }: { cardId: number }) {
  const t = useTranslations();
  const fmt = useFormatMoney();
  const { data: plans = [] } = usePlans(cardId);
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const cancel = useCancelPlan();
  const [dialog, setDialog] = useState<{ plan?: InstallmentPlan } | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("cards.msi")}</h2>
        <Button variant="outline" onClick={() => setDialog({})}><Plus /> {t("cards.newMsi")}</Button>
      </div>
      <ul className="space-y-2">
        {plans.map((p) => (
          <li key={p.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-medium">{p.description}</p>
              {p.cancelled_on && <Badge variant="outline">{t("cards.cancelled")}</Badge>}
              <span className="text-sm text-muted-foreground">{t("cards.perMonth", { amount: fmt(p.installment_amount) })}</span>
              {!p.cancelled_on && (
                <>
                  <Button size="icon" variant="ghost" aria-label={t("common.edit")} onClick={() => setDialog({ plan: p })}><Pencil /></Button>
                  <ConfirmButton onConfirm={() => cancel.mutate(p.id, { onSuccess: () => toast.success(t("common.saved")) })}>
                    <Button size="sm" variant="ghost">{t("cards.cancelPlan")}</Button>
                  </ConfirmButton>
                </>
              )}
            </div>
            <Meter value={p.billed_count} max={p.installments} label={t("cards.installmentOf", { no: p.billed_count, of: p.installments })} />
            <p className="text-xs text-muted-foreground">
              {t("cards.totalAmount")}: <Money cents={p.total_amount} /> · {t("cards.remaining")}: <Money cents={p.remaining_amount} />
            </p>
          </li>
        ))}
      </ul>
      <ResponsiveDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} title={t(dialog?.plan ? "cards.editMsi" : "cards.newMsi")}>
        {dialog && (
          <PlanForm
            cardId={cardId}
            initial={dialog.plan}
            onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              if (dialog.plan) await update.mutateAsync({ id: dialog.plan.id, ...v });
              else await create.mutateAsync(v);
              toast.success(t("common.saved"));
              setDialog(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </section>
  );
}
```

A 409 `plan_locked` has no fields, so `applyApiError` in `PlanForm` shows its message as a toast. That is the intended UX.

- [ ] **Step 5: Pages**

`web/src/app/[locale]/(app)/cards/page.tsx`:

```tsx
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentMethodForm } from "@/components/cards/payment-method-form";
import { ConfirmButton } from "@/components/common/confirm-button";
import { EmptyState } from "@/components/common/empty-state";
import { Meter } from "@/components/common/meter";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { PaymentMethod } from "@/lib/api/types";
import {
  useCardsOverview, useCreatePaymentMethod, useDeletePaymentMethod, usePaymentMethods, useUpdatePaymentMethod,
} from "@/lib/query/hooks";

export default function CardsPage() {
  const t = useTranslations();
  const { data: methods = [], isPending } = usePaymentMethods();
  const { data: overview = [] } = useCardsOverview();
  const create = useCreatePaymentMethod();
  const update = useUpdatePaymentMethod();
  const remove = useDeletePaymentMethod();
  const [dialog, setDialog] = useState<{ pm?: PaymentMethod } | null>(null);
  const summaryOf = (id: number) => overview.find((c) => c.payment_method_id === id);
  const credit = methods.filter((m) => m.type === "credit");
  const others = methods.filter((m) => m.type !== "credit");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("cards.title")}</h1>
        <Button onClick={() => setDialog({})}><Plus /> {t("cards.new")}</Button>
      </div>
      {!isPending && methods.length === 0 && <EmptyState>{t("common.empty")}</EmptyState>}
      {credit.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("cards.creditCards")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {credit.map((c) => {
              const s = summaryOf(c.id);
              return (
                <Link key={c.id} href={`/cards/${c.id}`} className="block space-y-3 rounded-xl border p-4 hover:bg-accent/50" style={{ borderTopColor: c.color, borderTopWidth: 4 }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{c.nickname}</span>
                    {c.last4 && <span className="text-xs tabular-nums text-muted-foreground">···· {c.last4}</span>}
                  </div>
                  {!c.active && <Badge variant="outline">{t("common.inactive")}</Badge>}
                  {s && (
                    <>
                      <div>
                        <p className="text-xs text-muted-foreground">{t("cards.currentBalance")}</p>
                        <p className="text-xl font-semibold"><Money cents={s.current_balance} /></p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("cards.amountDue")}: <Money cents={s.amount_due} className="text-foreground" /> · {s.due_on}
                      </p>
                      {s.credit_limit != null && <Meter value={s.current_balance} max={s.credit_limit} label={t("cards.utilization")} />}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
      {others.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("cards.otherMethods")}</h2>
          <ul className="space-y-2">
            {others.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                <span className="size-3 rounded-full" style={{ background: m.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{m.nickname}{m.last4 ? ` ···· ${m.last4}` : ""}</span>
                <Badge variant="outline">{t(`cards.types.${m.type}`)}</Badge>
                {!m.active && <Badge variant="outline">{t("common.inactive")}</Badge>}
                <Button size="icon" variant="ghost" aria-label={t("common.edit")} onClick={() => setDialog({ pm: m })}><Pencil /></Button>
                <ConfirmButton onConfirm={() => remove.mutate(m.id, { onSuccess: () => toast.success(t("common.deleted")), onError: (e) => toast.error(e.message) })}>
                  <Button size="icon" variant="ghost" aria-label={t("common.delete")}><Trash2 /></Button>
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ResponsiveDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} title={t(dialog?.pm ? "cards.edit" : "cards.new")}>
        {dialog && (
          <PaymentMethodForm
            initial={dialog.pm}
            onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              if (dialog.pm) await update.mutateAsync({ id: dialog.pm.id, ...v });
              else await create.mutateAsync(v);
              toast.success(t("common.saved"));
              setDialog(null);
            }}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
```

`web/src/app/[locale]/(app)/cards/[id]/page.tsx`:

```tsx
"use client";

import { ArrowLeft, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentMethodForm } from "@/components/cards/payment-method-form";
import { PlansList } from "@/components/cards/plans-list";
import { StatementView } from "@/components/cards/statement-view";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { usePaymentMethods, useUpdatePaymentMethod } from "@/lib/query/hooks";

export default function CardPage() {
  const t = useTranslations();
  const id = Number(useParams<{ id: string }>().id);
  const { data: methods, isPending } = usePaymentMethods();
  const update = useUpdatePaymentMethod();
  const [editing, setEditing] = useState(false);
  const pm = methods?.find((m) => m.id === id);

  if (isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!pm) return <p role="alert">{t("common.error")}</p>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("nav.cards")}><Link href="/cards"><ArrowLeft /></Link></Button>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{pm.nickname}{pm.last4 ? ` ···· ${pm.last4}` : ""}</h1>
        <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> {t("common.edit")}</Button>
      </div>
      {pm.type === "credit" ? (
        <>
          <StatementView cardId={id} />
          <PlansList cardId={id} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("cards.notCredit")}</p>
      )}
      <ResponsiveDialog open={editing} onOpenChange={setEditing} title={t("cards.edit")}>
        <PaymentMethodForm
          initial={pm}
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            await update.mutateAsync({ id, ...v });
            toast.success(t("common.saved"));
            setEditing(false);
          }}
        />
      </ResponsiveDialog>
    </div>
  );
}
```

- [ ] **Step 6: Verify.** Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS. In `pnpm dev`:
  - create a credit card (closes 15, due 5) with a limit
  - add an expense on it, an MSI purchase (12 months) and a card payment
  - the statement shows charges, the MSI line `1/12`, the payment, amount due, due date and utilization
  - previous/next cycle navigation works
  - editing a plan after its first cycle closed shows the `plan_locked` toast
  - cancelling a plan updates the remaining amount

- [ ] **Step 7: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "feat(web): payment methods, credit-card statements, card payments and MSI plans"
```

---

### Task W9: Categories with budgets, and settings (profile, export, delete account)

**Files:**
- Create: `web/src/components/categories/category-form.tsx`, `web/src/components/categories/category-form.test.tsx`, `web/src/lib/download.ts`
- Replace: `web/src/app/[locale]/(app)/categories/page.tsx`, `web/src/app/[locale]/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: the category and budget hooks, `useUpdateMe`, `useAuth`, `api`, `ApiError`, `CURRENCIES`, `timezones()`
- Produces:
  - `<CategoryForm initial? onSubmit(v: CategoryInput) onCancel? />`
  - `saveBlob(blob: Blob, filename: string): void`

- [ ] **Step 1: Write the failing test** `web/src/components/categories/category-form.test.tsx`

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { CategoryForm } from "./category-form";

describe("CategoryForm", () => {
  it("requires a name", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<CategoryForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Requerido")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("locks the kind when editing and submits trimmed values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<CategoryForm initial={{ id: 3, name: "Comida", kind: "expense", color: "#f97316", icon: "utensils" }} onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Tipo")).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Nombre"));
    await userEvent.type(screen.getByLabelText("Nombre"), "  Súper ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: "Súper", kind: "expense", color: "#f97316", icon: "utensils" }));
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: Implement** `web/src/components/categories/category-form.tsx`

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/errors";
import type { Category, CategoryInput } from "@/lib/api/types";

export function CategoryForm({ initial, onSubmit, onCancel }: {
  initial?: Partial<Category>; onSubmit: (v: CategoryInput) => Promise<void>; onCancel?: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"expense" | "income">((initial?.kind as "expense" | "income") ?? "expense");
  const [color, setColor] = useState(initial?.color ?? "#64748b");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: t("validation.required") });
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), kind, color, icon: initial?.icon ?? "tag" });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="cat-name">{t("categories.name")}</Label>
        <Input id="cat-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
        <FieldError message={errors.name} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cat-kind">{t("categories.kind")}</Label>
          <select id="cat-kind" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-60" disabled={initial?.id !== undefined}
            value={kind} onChange={(e) => setKind(e.target.value as "expense" | "income")}>
            <option value="expense">{t("categories.kinds.expense")}</option>
            <option value="income">{t("categories.kinds.income")}</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-color">{t("categories.color")}</Label>
          <input id="cat-color" type="color" className="h-9 w-full rounded border" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>}
        <Button type="submit" disabled={busy}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
```

`web/src/lib/download.ts`:

```ts
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 3: Categories page** `web/src/app/[locale]/(app)/categories/page.tsx`

```tsx
"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryForm } from "@/components/categories/category-form";
import { CategorySelect } from "@/components/common/category-select";
import { MoneyInput } from "@/components/common/money-input";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/errors";
import type { Category } from "@/lib/api/types";
import { centsToInput, parseMoney } from "@/lib/money";
import {
  useBudgets, useCategories, useCreateCategory, useDeleteBudget, useDeleteCategory, usePutBudget, useUpdateCategory,
} from "@/lib/query/hooks";

function BudgetField({ category, limit }: { category: Category; limit?: number }) {
  const t = useTranslations();
  const put = usePutBudget();
  const del = useDeleteBudget();
  const [value, setValue] = useState(limit ? centsToInput(limit) : "");
  const save = () => {
    if (value.trim() === "") {
      if (limit) del.mutate(category.id, { onSuccess: () => toast.success(t("common.saved")) });
      return;
    }
    const cents = parseMoney(value);
    if (cents === null) return toast.error(t("validation.amount"));
    if (cents !== limit) put.mutate({ categoryId: category.id, limit: cents }, { onSuccess: () => toast.success(t("common.saved")) });
  };
  return (
    <div className="w-40">
      <Label htmlFor={`budget-${category.id}`} className="sr-only">{t("categories.budget")}</Label>
      <MoneyInput id={`budget-${category.id}`} placeholder={t("categories.noBudget")} value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} />
    </div>
  );
}

export default function CategoriesPage() {
  const t = useTranslations();
  const { data: categories = [] } = useCategories();
  const { data: budgets = [] } = useBudgets();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [dialog, setDialog] = useState<{ cat?: Category } | null>(null);
  const [reassign, setReassign] = useState<{ cat: Category; to: number | null } | null>(null);

  const tryDelete = (cat: Category) =>
    remove.mutate({ id: cat.id }, {
      onSuccess: () => toast.success(t("common.deleted")),
      onError: (e) => (e instanceof ApiError && e.code === "category_in_use" ? setReassign({ cat, to: null }) : toast.error(e.message)),
    });

  const section = (kind: "expense" | "income") => (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{t(`categories.kinds.${kind}`)}</h2>
      <ul className="space-y-2">
        {categories.filter((c) => c.kind === kind).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {kind === "expense" && <BudgetField category={c} limit={budgets.find((b) => b.category_id === c.id)?.monthly_limit} />}
            <Button size="icon" variant="ghost" aria-label={t("common.edit")} onClick={() => setDialog({ cat: c })}><Pencil /></Button>
            <Button size="icon" variant="ghost" aria-label={t("common.delete")} onClick={() => tryDelete(c)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("categories.title")}</h1>
        <Button onClick={() => setDialog({})}><Plus /> {t("categories.new")}</Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("categories.budget")}: {t("categories.noBudget").toLowerCase()} = —</p>
      {section("expense")}
      {section("income")}
      <ResponsiveDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} title={t(dialog?.cat ? "categories.edit" : "categories.new")}>
        {dialog && (
          <CategoryForm
            initial={dialog.cat}
            onCancel={() => setDialog(null)}
            onSubmit={async (v) => {
              if (dialog.cat) await update.mutateAsync({ id: dialog.cat.id, ...v });
              else await create.mutateAsync(v);
              toast.success(t("common.saved"));
              setDialog(null);
            }}
          />
        )}
      </ResponsiveDialog>
      <ResponsiveDialog open={!!reassign} onOpenChange={(o) => !o && setReassign(null)} title={t("common.confirmTitle")}>
        {reassign && (
          <div className="space-y-4">
            <p className="text-sm">{t("categories.inUse")}</p>
            <Label htmlFor="reassign-to">{t("categories.reassignTo")}</Label>
            <CategorySelect id="reassign-to" kind={reassign.cat.kind as "expense" | "income"} value={reassign.to} onChange={(to) => setReassign({ ...reassign, to })} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReassign(null)}>{t("common.cancel")}</Button>
              <Button
                variant="destructive"
                disabled={!reassign.to || reassign.to === reassign.cat.id}
                onClick={() =>
                  remove.mutate({ id: reassign.cat.id, reassignTo: reassign.to! }, {
                    onSuccess: () => { toast.success(t("common.deleted")); setReassign(null); },
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                {t("common.delete")}
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </div>
  );
}
```

Remove the explanatory `<p>` under the heading if it reads awkwardly; the budget inputs' placeholder ("Sin límite") already explains the empty state.

- [ ] **Step 4: Settings page** `web/src/app/[locale]/(app)/settings/page.tsx`

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FieldError } from "@/components/common/field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { ApiError, toApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-provider";
import { toISODate } from "@/lib/dates";
import { saveBlob } from "@/lib/download";
import { CURRENCIES, timezones } from "@/lib/locale-options";
import { useMe, useUpdateMe } from "@/lib/query/hooks";

const selectCls = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

export default function SettingsPage() {
  const t = useTranslations();
  const { data: me } = useMe();
  const { setUser, logout } = useAuth();
  const updateMe = useUpdateMe();
  const router = useRouter();
  const [profile, setProfile] = useState({ name: "", currency: "MXN", locale: "es", timezone: "UTC" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(toISODate(new Date()));
  const [password, setPassword] = useState("");
  const [deleteError, setDeleteError] = useState<string>();

  useEffect(() => {
    if (me) setProfile({ name: me.name ?? "", currency: me.currency ?? "MXN", locale: me.locale ?? "es", timezone: me.timezone ?? "UTC" });
  }, [me]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      const u = await updateMe.mutateAsync(profile);
      setUser(u);
      toast.success(t("common.saved"));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const download = async (kind: "expenses" | "entries") => {
    const path = kind === "expenses" ? "/export/expenses.csv" : "/export/entries.csv";
    const { data, error, response } = await api.GET(path, { params: { query: { from, to } }, parseAs: "blob" });
    if (!response.ok || !data) return toast.error(toApiError(response.status, error).message);
    saveBlob(data as Blob, `${kind}_${from}_${to}.csv`);
  };

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(undefined);
    const { error, response } = await api.DELETE("/me", { body: { password } });
    if (!response.ok) return setDeleteError(toApiError(response.status, error).fields.password ?? toApiError(response.status, error).message);
    await logout();
    router.replace("/register");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      <Card>
        <CardHeader><CardTitle>{t("settings.profile")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2" noValidate>
            <div className="space-y-2">
              <Label htmlFor="p-name">{t("auth.name")}</Label>
              <Input id="p-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} aria-invalid={!!errors.name} />
              <FieldError message={errors.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-currency">{t("auth.currency")}</Label>
              <select id="p-currency" className={selectCls} value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-locale">{t("settings.language")}</Label>
              <select id="p-locale" className={selectCls} value={profile.locale} onChange={(e) => setProfile({ ...profile, locale: e.target.value })}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-tz">{t("auth.timezone")}</Label>
              <Input id="p-tz" list="p-tz-list" value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} aria-invalid={!!errors.timezone} />
              <datalist id="p-tz-list">{timezones().map((z) => <option key={z} value={z} />)}</datalist>
              <FieldError message={errors.timezone} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={updateMe.isPending}>{t("common.save")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("settings.export")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4 sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="x-from">{t("common.from")}</Label>
            <Input id="x-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="x-to">{t("common.to")}</Label>
            <Input id="x-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => download("expenses")}>{t("settings.exportExpenses")}</Button>
          <Button variant="outline" onClick={() => download("entries")}>{t("settings.exportEntries")}</Button>
        </CardContent>
      </Card>
      <Card className="border-destructive/50">
        <CardHeader><CardTitle className="text-destructive">{t("settings.danger")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={deleteAccount} className="space-y-3" noValidate>
            <p className="text-sm text-muted-foreground">{t("settings.deleteWarning")}</p>
            <Label htmlFor="d-pass">{t("settings.confirmPassword")}</Label>
            <Input id="d-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!deleteError} />
            <FieldError message={deleteError} />
            <Button type="submit" variant="destructive" disabled={!password}>{t("settings.deleteAccount")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Verify.** Run `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: PASS. In `pnpm dev`:
  - set a budget on "Comida"
  - delete a used category: the reassign dialog appears, and the delete succeeds after choosing a target
  - change the language in Settings: the URL switches to `/en/...`
  - the CSV downloads open in a spreadsheet with correct accents
  - account deletion with a wrong password shows the field error; with the right one it lands on `/register`

- [ ] **Step 6: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "feat(web): categories with monthly budgets, settings with export and account deletion"
```

---
### Task W10: Dashboard — period controls, KPIs, spending chart, breakdowns, budgets, upcoming, card debt

**Files:**
- Create: `web/src/components/dashboard/{period-controls,kpi-cards,spending-chart,breakdown-bars,budget-meters,upcoming-list,cards-debt}.tsx`, `web/src/components/dashboard/kpi-cards.test.tsx`, `web/src/components/dashboard/budget-meters.test.tsx`
- Replace: `web/src/app/[locale]/(app)/dashboard/page.tsx`

**Chart decisions (dataviz method):**
- **Spending over time** is magnitude over time with two parts (expenses and committed fixed/MSI), so it is a **stacked bar** chart:
  - series-1 `--chart-1` is expenses, series-2 `--chart-2` is committed; the palette is validated in both modes (Global Constraints)
  - 2px `--background` stroke as the gap between segments, 4px rounded top on the upper segment
  - hairline horizontal grid only
  - legend always shown (2 series) with a hover tooltip per bar
  - "Ver tabla" toggle for an accessible table view
- **Breakdowns** are ranked parts of a whole with many categories, so they are **horizontal bars in one hue** (`--chart-1`) with direct value labels and percentages, not a donut. The category's own color appears only as a small identity dot next to the name. Items beyond the top 7 fold into "Otros".
  - This replaces the spec's "category donut".
  - Ruling: a donut with more than 5 user-colored slices fails the categorical-palette gate (user-chosen colors are unvalidated). Ranked bars read more accurately. Cost if wrong: a visual preference only.
- **Budgets and utilization** are single-value meters. Budgets use **status colors with icon + label** (ok < 80% ✓, warn 80–100% ⚠, over > 100% ✕). Card utilization uses the neutral `Meter` (W8).
- **Available** is a hero stat tile, not a chart. Negative values get critical color, an icon and the label "Sobregirado".

**Interfaces:**
- Consumes: `useSummary`, `useSeries`, `useBreakdown`, `useUpcoming`, `useCardsOverview`, `useUpdateEntry`, `useFormatMoney`, `Meter`, `periodRange`, `seriesRange`, `parseISODate`, `toISODate`, `toMonthKey`, `intlLocale`
- Produces:
  - `<PeriodControls period anchor onChange(period, anchor) />`
  - `<KpiCards summary spent period />`
  - `<SpendingChart points period />`
  - `<BreakdownBars title items identityDots? />`
  - `<BudgetMeters budgets />` and `budgetStatus(pct: number): "ok" | "warn" | "over"`
  - `<UpcomingList />`, `<CardsDebt />`

- [ ] **Step 1: Write the failing tests**

`web/src/components/dashboard/kpi-cards.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Summary } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { KpiCards } from "./kpi-cards";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

const base: Summary = {
  month: "2026-03", currency: "MXN", income: 100000, fixed_committed: 80000, fixed_paid: 30000,
  installments: 30000, spent: 10000, available: -20000, budgets: [],
};

describe("KpiCards", () => {
  it("marks negative Available with icon + label, not color alone", () => {
    renderWithProviders(<KpiCards summary={base} spent={10000} period="month" />);
    const label = screen.getByText("Sobregirado");
    expect(label).toBeInTheDocument();
    expect(label.closest("[data-kpi='available']")?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("-$200.00")).toHaveClass("text-critical");
  });

  it("shows safe-to-spend for the current month", () => {
    renderWithProviders(
      <KpiCards summary={{ ...base, available: 170000, safe_to_spend_per_day: 10000, days_remaining: 17 }} spent={500} period="week" />,
    );
    expect(screen.getByText("Puedes gastar $100.00 por día (17 días restantes)")).toBeInTheDocument();
    expect(screen.getByText("Gastado esta semana")).toBeInTheDocument();
    expect(screen.queryByText("Sobregirado")).toBeNull();
  });

  it("shows committed fixed payments with paid/pending detail", () => {
    renderWithProviders(<KpiCards summary={base} spent={0} period="month" />);
    expect(screen.getByText("$300.00 pagado · $500.00 pendiente")).toBeInTheDocument();
  });
});
```

`web/src/components/dashboard/budget-meters.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { BudgetMeters, budgetStatus } from "./budget-meters";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

describe("budgets", () => {
  it("classifies percentages", () => {
    expect(budgetStatus(79)).toBe("ok");
    expect(budgetStatus(80)).toBe("warn");
    expect(budgetStatus(100)).toBe("warn");
    expect(budgetStatus(101)).toBe("over");
  });

  it("labels each status in text", () => {
    renderWithProviders(
      <BudgetMeters budgets={[
        { category_id: 1, name: "Comida", color: "#f00", limit: 1000, spent: 500, pct: 50 },
        { category_id: 2, name: "Ocio", color: "#0f0", limit: 1000, spent: 1500, pct: 150 },
      ]} />,
    );
    expect(screen.getByText("En orden")).toBeInTheDocument();
    expect(screen.getByText("Excedido")).toBeInTheDocument();
  });
});
```

Run them. Expected: FAIL.

- [ ] **Step 2: KPI cards** `web/src/components/dashboard/kpi-cards.tsx`

```tsx
"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useFormatMoney } from "@/components/common/money";
import type { Summary } from "@/lib/api/types";
import type { Period } from "@/lib/dates";
import { cn } from "@/lib/utils";

function Tile({ id, label, value, children, valueClass }: { id: string; label: string; value: string; children?: ReactNode; valueClass?: string }) {
  return (
    <div data-kpi={id} className="space-y-1 rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold", valueClass)}>{value}</p>
      {children}
    </div>
  );
}

export function KpiCards({ summary: s, spent, period }: { summary: Summary; spent: number; period: Period }) {
  const t = useTranslations("dashboard");
  const fmt = useFormatMoney();
  const negative = s.available < 0;
  const committed = s.fixed_committed + s.installments;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile id="income" label={t("income")} value={fmt(s.income)} />
      <Tile id="fixed" label={t("fixed")} value={fmt(committed)}>
        <p className="text-xs text-muted-foreground">{t("fixedDetail", { paid: fmt(s.fixed_paid), pending: fmt(s.fixed_committed - s.fixed_paid) })}</p>
        {s.installments > 0 && <p className="text-xs text-muted-foreground">{t("installments")}: {fmt(s.installments)}</p>}
      </Tile>
      <Tile id="spent" label={t(`spent.${period}`)} value={fmt(spent)} />
      <Tile id="available" label={t("available")} value={fmt(s.available)} valueClass={negative ? "text-critical" : undefined}>
        {negative ? (
          <p className="flex items-center gap-1 text-sm font-medium text-critical">
            <AlertTriangle className="size-4" aria-hidden />
            {t("overspent")}
          </p>
        ) : (
          s.safe_to_spend_per_day != null && (
            <p className="text-xs text-muted-foreground">
              {t("safeToSpend", { amount: fmt(s.safe_to_spend_per_day), days: s.days_remaining ?? 0 })}
            </p>
          )
        )}
      </Tile>
    </div>
  );
}
```

The test's `getByText("-$200.00")` targets the `<p>` whose class includes `text-critical`, so `Tile` puts `valueClass` on the value `<p>` directly. Keep it that way.

- [ ] **Step 3: Budget meters, breakdown bars, period controls**

`web/src/components/dashboard/budget-meters.tsx`:

```tsx
"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatMoney } from "@/components/common/money";

type Budget = { category_id: number; name: string; color: string; limit: number; spent: number; pct: number };

export function budgetStatus(pct: number): "ok" | "warn" | "over" {
  if (pct > 100) return "over";
  if (pct >= 80) return "warn";
  return "ok";
}

const STYLE = {
  ok: { Icon: CheckCircle2, bar: "bg-good", text: "text-good" },
  warn: { Icon: AlertTriangle, bar: "bg-warning", text: "text-foreground" },
  over: { Icon: XCircle, bar: "bg-critical", text: "text-critical" },
} as const;

export function BudgetMeters({ budgets }: { budgets: Budget[] }) {
  const t = useTranslations("dashboard");
  const fmt = useFormatMoney();
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">{t("budgets")}</h2>
      {budgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-3">
          {budgets.map((b) => {
            const status = budgetStatus(b.pct);
            const { Icon, bar, text } = STYLE[status];
            return (
              <li key={b.category_id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span className="size-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
                    {b.name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{fmt(b.spent)} / {fmt(b.limit)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={b.limit} aria-valuenow={b.spent} aria-label={b.name}>
                  <div className={`h-2 rounded-full ${bar}`} style={{ width: `${Math.min(100, b.pct)}%` }} />
                </div>
                <p className={`flex items-center gap-1 text-xs ${text}`}>
                  <Icon className="size-3.5" aria-hidden /> {t(`budgetStatus.${status}`)} · {b.pct}%
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

(The warning status uses foreground text beside the amber icon and bar. Amber `#fab219` text fails contrast on light surfaces, so the icon and label carry the meaning.)

`web/src/components/dashboard/breakdown-bars.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useFormatMoney } from "@/components/common/money";
import type { BreakdownItem } from "@/lib/api/types";

const TOP = 7;

export function BreakdownBars({ title, items, identityDots = true }: { title: string; items: BreakdownItem[]; identityDots?: boolean }) {
  const t = useTranslations("dashboard");
  const fmt = useFormatMoney();
  const rest = items.slice(TOP).reduce((a, i) => a + i.amount, 0);
  const rows = rest > 0 ? [...items.slice(0, TOP), { id: undefined, name: t("other"), color: "#94a3b8", amount: rest }] : items;
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r, i) => {
            const name = r.name || t("noMethod");
            const pct = total ? Math.round((r.amount / total) * 100) : 0;
            return (
              <li key={`${r.id ?? "none"}-${i}`} title={`${name}: ${fmt(r.amount)} (${pct}%)`} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    {identityDots && <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />}
                    {name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {fmt(r.amount)} <span className="text-muted-foreground">{pct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-chart-1" style={{ width: `${(r.amount / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

`web/src/components/dashboard/period-controls.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toISODate, type Period } from "@/lib/dates";

export function PeriodControls({ period, anchor, onChange }: { period: Period; anchor: string; onChange: (p: Period, anchor: string) => void }) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Tabs value={period} onValueChange={(v) => onChange(v as Period, anchor)}>
        <TabsList>
          {(["day", "week", "month"] as const).map((p) => (
            <TabsTrigger key={p} value={p}>{t(`dashboard.period.${p}`)}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="anchor" className="sr-only">{t("dashboard.anchor")}</Label>
          <Input id="anchor" type="date" className="w-40" value={anchor} onChange={(e) => e.target.value && onChange(period, e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => onChange(period, toISODate(new Date()))}>{t("common.today")}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Spending chart** `web/src/components/dashboard/spending-chart.tsx`

```tsx
"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFormatMoney } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SeriesPoint } from "@/lib/api/types";
import { parseISODate, type Period } from "@/lib/dates";
import { intlLocale } from "@/lib/money";

export function SpendingChart({ points, period }: { points: SeriesPoint[]; period: Period }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const fmt = useFormatMoney();
  const [asTable, setAsTable] = useState(false);
  const dfLocale = locale === "en" ? enUS : es;
  const label = (s: string) => format(parseISODate(s), period === "month" ? "MMM yy" : "d MMM", { locale: dfLocale });
  const compact = new Intl.NumberFormat(intlLocale(locale), { notation: "compact", maximumFractionDigits: 1 });
  const names: Record<string, string> = { expenses: t("expensesSeries"), committed: t("committedSeries") };
  const empty = points.every((p) => p.expenses === 0 && p.committed === 0);

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{t("spending")}</h2>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-1" aria-hidden />{names.expenses}</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-2" aria-hidden />{names.committed}</span>
          <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)}>{asTable ? t("showChart") : t("showTable")}</Button>
        </div>
      </div>
      {asTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("periodColumn")}</TableHead>
              <TableHead className="text-right">{names.expenses}</TableHead>
              <TableHead className="text-right">{names.committed}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((p) => (
              <TableRow key={p.start}>
                <TableCell>{label(p.start)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(p.expenses)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(p.committed)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : empty ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="start" tickFormatter={label} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }}
                tick={{ fill: "var(--chart-axis)", fontSize: 12 }} minTickGap={12} />
              <YAxis tickFormatter={(v: number) => compact.format(v / 100)} tickLine={false} axisLine={false}
                tick={{ fill: "var(--chart-axis)", fontSize: 12 }} width={48} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={({ active, payload, label: key }) =>
                  active && payload?.length ? (
                    <div className="min-w-44 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow">
                      <p className="mb-1 font-medium">{label(String(key))}</p>
                      {payload.map((p) => (
                        <p key={String(p.dataKey)} className="flex items-center gap-2">
                          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
                          {names[String(p.dataKey)]}
                          <span className="ml-auto tabular-nums">{fmt(Number(p.value))}</span>
                        </p>
                      ))}
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="expenses" stackId="s" fill="var(--chart-1)" stroke="var(--background)" strokeWidth={2} />
              <Bar dataKey="committed" stackId="s" fill="var(--chart-2)" stroke="var(--background)" strokeWidth={2} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Upcoming and card debt**

`web/src/components/dashboard/upcoming-list.tsx`:

```tsx
"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { AlertTriangle, CreditCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Money } from "@/components/common/money";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseISODate } from "@/lib/dates";
import { useUpcoming, useUpdateEntry } from "@/lib/query/hooks";

export function UpcomingList() {
  const t = useTranslations();
  const locale = useLocale();
  const { data = [] } = useUpcoming(30);
  const update = useUpdateEntry();
  const day = (s: string) => format(parseISODate(s), "EEE d MMM", { locale: locale === "en" ? enUS : es });

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">{t("dashboard.upcoming")}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="divide-y">
          {data.map((u, i) => (
            <li key={`${u.type}-${u.entry_id ?? u.payment_method_id}-${i}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {u.type === "card" && <CreditCard className="mr-1 inline size-3.5" aria-hidden />}
                  {u.type === "card" ? `${t("dashboard.cardDue")} · ${u.name}` : u.name}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {day(u.date)}
                  {u.overdue && (
                    <span className="flex items-center gap-1 font-medium text-critical">
                      <AlertTriangle className="size-3" aria-hidden /> {t("dashboard.overdue")}
                    </span>
                  )}
                </p>
              </div>
              <Money cents={u.amount} className="font-medium" />
              {u.type === "fixed" && u.entry_id ? (
                <Button size="sm" variant="outline" disabled={update.isPending}
                  onClick={() => update.mutate(
                    { id: u.entry_id!, amount: u.amount, status: "paid", payment_method_id: u.payment_method_id ?? undefined },
                    { onSuccess: () => toast.success(t("common.saved")), onError: (e) => toast.error(e.message) },
                  )}>
                  {t("month.markPaid")}
                </Button>
              ) : (
                <Button asChild size="sm" variant="ghost"><Link href={`/cards/${u.payment_method_id}`}>{t("cards.recordPayment")}</Link></Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

`web/src/components/dashboard/cards-debt.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Meter } from "@/components/common/meter";
import { Money } from "@/components/common/money";
import { Link } from "@/i18n/navigation";
import { useCardsOverview } from "@/lib/query/hooks";

export function CardsDebt() {
  const t = useTranslations("cards");
  const td = useTranslations("dashboard");
  const { data = [] } = useCardsOverview();
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-medium">{td("cardsDebt")}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-4">
          {data.map((c) => (
            <li key={c.payment_method_id}>
              <Link href={`/cards/${c.payment_method_id}`} className="block space-y-1 rounded-md hover:bg-accent/40">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{c.nickname}{c.last4 ? ` ···· ${c.last4}` : ""}</span>
                  <Money cents={c.current_balance} className="font-semibold" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("amountDue")}: <Money cents={c.amount_due} className="text-foreground" /> · {t("dueOn")} {c.due_on}
                </p>
                {c.credit_limit != null && <Meter value={c.current_balance} max={c.credit_limit} label={t("utilization")} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Dashboard page** `web/src/app/[locale]/(app)/dashboard/page.tsx`

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import { BudgetMeters } from "@/components/dashboard/budget-meters";
import { CardsDebt } from "@/components/dashboard/cards-debt";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { UpcomingList } from "@/components/dashboard/upcoming-list";
import { Skeleton } from "@/components/ui/skeleton";
import { usePathname, useRouter } from "@/i18n/navigation";
import { parseISODate, periodRange, seriesRange, toISODate, toMonthKey, type Period } from "@/lib/dates";
import { useBreakdown, useSeries, useSummary } from "@/lib/query/hooks";

function Dashboard() {
  const t = useTranslations("dashboard");
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawPeriod = sp.get("period");
  const period: Period = rawPeriod === "day" || rawPeriod === "week" ? rawPeriod : "month";
  const rawDate = sp.get("date") ?? "";
  const anchorStr = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : toISODate(new Date());
  const anchor = parseISODate(anchorStr);
  const pr = periodRange(period, anchor);
  const sr = seriesRange(period, anchor);

  const summary = useSummary(toMonthKey(anchor));
  const current = useSeries(period, pr.from, pr.to);
  const series = useSeries(period, sr.from, sr.to);
  const byCat = useBreakdown("category", pr.from, pr.to);
  const byPm = useBreakdown("payment_method", pr.from, pr.to);
  const spent = (current.data ?? []).reduce((a, p) => a + p.expenses, 0);

  const onChange = (p: Period, d: string) => router.replace({ pathname, query: { period: p, date: d } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <PeriodControls period={period} anchor={anchorStr} onChange={onChange} />
      </div>
      {summary.data ? <KpiCards summary={summary.data} spent={spent} period={period} /> : <Skeleton className="h-28 w-full" />}
      {summary.error && <p role="alert" className="text-sm text-destructive">{summary.error.message}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {series.data ? <SpendingChart points={series.data} period={period} /> : <Skeleton className="h-80 w-full" />}
        </div>
        <UpcomingList />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownBars title={t("byCategory")} items={byCat.data ?? []} />
        <BreakdownBars title={t("byMethod")} items={byPm.data ?? []} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <BudgetMeters budgets={summary.data?.budgets ?? []} />
        <CardsDebt />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Dashboard />
    </Suspense>
  );
}
```

- [ ] **Step 7: Verify.** Run `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Expected: PASS. In `pnpm dev`, with data from the earlier tasks:
  - Day, Week and Month change the chart's buckets (14 days, 12 weeks, 12 months) and the "Gastado …" tile
  - the date picker moves the window
  - the chart tooltip shows both series
  - "Ver tabla" swaps to a table
  - dark mode uses the dark steps (`#3987e5` / `#d95926`)
  - at 375px everything stacks without horizontal scroll
  - driving Available negative (a large expense) shows red with ⚠ and "Sobregirado"
  - **Look at the rendered chart** (a screenshot at desktop and mobile widths) for label collisions and overflow before calling it done

- [ ] **Step 8: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "feat(web): dashboard with period controls, KPIs, spending chart, breakdowns, budgets, upcoming and card debt"
```

---

### Task W11: PWA manifest, web Docker image, compose, CI

**Files:**
- Create: `web/public/manifest.webmanifest`, `web/scripts/make-icons.mjs`, `web/public/icons/*.png` (generated and committed), `web/src/app/icon.svg`, `web/Dockerfile`, `web/.dockerignore`
- Modify: `docker-compose.yml` (web service), `.github/workflows/ci.yml` (web job), `README.md`, `web/package.json` (`packageManager` field, icons script)

**Interfaces:**
- Produces: the image `financego-web` on :3000, which proxies `/api/*` to `API_URL` (build arg, default `http://api:8080`); CI job `web`

- [ ] **Step 1: Icon and manifest**

`web/src/app/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#2a78d6"/>
  <path d="M18 44V20h22v6H25v4h13v6H25v8z" fill="#fcfcfb"/>
  <circle cx="45" cy="41" r="5" fill="#eb6834"/>
</svg>
```

`web/scripts/make-icons.mjs`:

```js
import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile(new URL("../src/app/icon.svg", import.meta.url));
await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
}
// Maskable: pad to the 80% safe zone on the brand color.
const inner = await sharp(svg).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#2a78d6" } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile(new URL("../public/icons/maskable-512.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
```

```bash
cd /c/dev/financego/web && pnpm add -D sharp && node scripts/make-icons.mjs && ls public/icons
```

Expected: `icon-192.png`, `icon-512.png` and `maskable-512.png` exist.

`web/public/manifest.webmanifest`:

```json
{
  "name": "FinanceGo",
  "short_name": "FinanceGo",
  "description": "Ingresos, pagos fijos, gastos y tarjetas en un solo lugar.",
  "start_url": "/es/dashboard",
  "scope": "/",
  "display": "standalone",
  "background_color": "#fcfcfb",
  "theme_color": "#2a78d6",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Web image**

Add `"packageManager": "pnpm@<the version printed by pnpm --version>"` to `web/package.json` so corepack pins it.

`web/Dockerfile`:

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
ARG API_URL=http://api:8080
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

`web/.dockerignore`:

```
node_modules
.next
test-results
playwright-report
e2e
```

Append under `services:` in `docker-compose.yml`:

```yaml
  web:
    build:
      context: ./web
      args:
        API_URL: http://api:8080
    image: financego-web
    depends_on:
      - api
    ports: ["3000:3000"]
    restart: unless-stopped
```

- [ ] **Step 3: CI.** Add these jobs to `.github/workflows/ci.yml`:

```yaml
  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          package_json_file: web/package.json
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: web/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - name: API types are current
        run: pnpm gen:api && git diff --exit-code -- src/lib/api
      - run: pnpm build

  e2e:
    runs-on: ubuntu-latest
    needs: [web]
    env:
      JWT_SECRET: ci-only-secret-with-at-least-thirty-two-bytes!!
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          package_json_file: web/package.json
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: web/pnpm-lock.yaml
      - run: docker compose -f docker-compose.yml up -d --build
      - name: wait for the web app
        run: |
          for i in $(seq 1 60); do curl -fs http://localhost:3000/es/login >/dev/null && exit 0; sleep 2; done
          docker compose -f docker-compose.yml logs; exit 1
      - working-directory: web
        run: pnpm install --frozen-lockfile && pnpm exec playwright install --with-deps chromium && pnpm e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: web/playwright-report
```

Also add `docker build -t financego-web ./web` to the existing `docker` job.

- [ ] **Step 4: README (web section).** Append:

````markdown
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
````

- [ ] **Step 5: Verify**

```bash
cd /c/dev/financego
docker compose -f docker-compose.yml up -d --build
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/es/login     # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/manifest.webmanifest   # 200
curl -s -X POST http://localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"x@y.z","password":"nope"}'   # 401 JSON from the API through the proxy
```

Expected: 200, 200, then `{"error":{"code":"invalid_credentials",...}}`. Leave the stack up for W12.

- [ ] **Step 6: Commit**

```bash
git add web docker-compose.yml .github README.md
git commit -m "chore(web): PWA manifest and icons, standalone Docker image, compose service, CI jobs"
```

---

### Task W12: Playwright end-to-end tests

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/helpers.ts`, `web/e2e/happy-path.spec.ts`, `web/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: the running compose stack at `E2E_BASE_URL` (default `http://localhost:3000`)

- [ ] **Step 1: Config** `web/playwright.config.ts`

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", locale: "es-MX", timezoneId: "America/Tijuana" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /happy-path/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile/ },
  ],
});
```

- [ ] **Step 2: Helpers** `web/e2e/helpers.ts`

```ts
import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

export async function register(page: Page, email: string) {
  await page.goto("/es/register");
  await page.getByLabel("Nombre").fill("E2E");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("password123");
  await page.getByLabel("Zona horaria").fill("America/Tijuana");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/es\/dashboard/);
}

/** Picks an option from a shadcn (Radix) Select identified by its label. */
export async function pick(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option }).click();
}
```

- [ ] **Step 3: Happy path** `web/e2e/happy-path.spec.ts`

```ts
import { expect, test } from "@playwright/test";
import { pick, register, uniqueEmail } from "./helpers";

test("register → income + card fixed payment → card expense → Available → card payment → English", async ({ page }) => {
  await register(page, uniqueEmail("happy"));
  const month = new Date().toISOString().slice(0, 7);

  // Credit card
  await page.goto("/es/cards");
  await page.getByRole("button", { name: "Nuevo método de pago" }).click();
  await page.getByLabel("Alias").fill("Visa Oro");
  await page.getByLabel("Tipo").selectOption("credit");
  await page.getByLabel("Últimos 4 dígitos").fill("4242");
  await page.getByLabel("Día de corte").fill("15");
  await page.getByLabel("Día límite de pago").fill("5");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Visa Oro")).toBeVisible();

  // Income and a fixed payment charged to the card
  await page.goto("/es/recurring");
  await page.getByRole("button", { name: "Nueva fuente de ingreso" }).click();
  await page.getByLabel("Nombre").fill("Salario");
  await page.getByLabel("Monto").fill("30,000");
  await page.getByLabel("Día del mes").fill("1");
  await page.getByLabel("Mes de inicio").fill(month);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Salario")).toBeVisible();

  await page.getByRole("tab", { name: "Pagos fijos" }).click();
  await page.getByRole("button", { name: "Nuevo pago fijo" }).click();
  await page.getByLabel("Nombre").fill("Renta");
  await page.getByLabel("Monto").fill("10000");
  await page.getByLabel("Día del mes").fill("5");
  await pick(page, "Categoría", "Vivienda");
  await pick(page, "Método de pago", /Visa Oro/);
  await page.getByLabel("Mes de inicio").fill(month);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Renta")).toBeVisible();

  // Card expense via quick add
  await page.getByRole("button", { name: "Agregar gasto" }).first().click();
  await page.getByLabel("Monto").fill("500");
  await pick(page, "Categoría", "Comida");
  await pick(page, "Método de pago", /Visa Oro/);
  await page.getByRole("button", { name: "Guardar" }).click();

  // Available = 30,000 − 10,000 − 500
  await page.goto("/es/dashboard");
  await expect(page.locator("[data-kpi='available']")).toContainText("$19,500.00");

  // Card: current balance 500, then pay it off
  await page.goto("/es/cards");
  await page.getByRole("link", { name: /Visa Oro/ }).click();
  await expect(page.getByText("Saldo actual").locator("..")).toContainText("$500.00");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Monto").fill("500");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Saldo actual").locator("..")).toContainText("$0.00");

  // Switch to English through the user menu
  await page.goto("/es/dashboard");
  await page.getByRole("button", { name: "E2E" }).click();
  await page.getByRole("menuitem", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});
```

The card is created with the default opening-balance date (today), so the same-day expense counts toward the balance. If the statement view's "Saldo actual" element structure differs, locate it by its `<dt>` text and the sibling `<dd>`. The assertion target is the current balance value.

- [ ] **Step 4: Mobile smoke test** `web/e2e/mobile.spec.ts`

```ts
import { expect, test } from "@playwright/test";
import { register, uniqueEmail } from "./helpers";

test("mobile: bottom navigation, quick add sheet, no horizontal scroll", async ({ page }) => {
  await register(page, uniqueEmail("mobile"));
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link", { name: "Gastos" })).toBeVisible();
  await nav.getByRole("button", { name: "Agregar gasto" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  for (const path of ["/es/dashboard", "/es/expenses", "/es/cards", "/es/recurring", "/es/settings"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});
```

- [ ] **Step 5: Run.** With the stack from W11 running:

```bash
cd /c/dev/financego/web && pnpm exec playwright install chromium && pnpm e2e
```

Expected: 2 passed (desktop happy path, mobile smoke). Fix the app, not the assertions, when a real behavior differs. Adjust a locator only when the DOM legitimately differs from what the test assumed, and say so in the report.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/financego && git add web && git commit -m "test(web): Playwright happy-path and mobile smoke E2E"
```

---

## Self-Review Notes (for the executor)

- **Spec coverage:**
  - §8 routing, auth, money, responsive shell, theme, i18n → W1–W4
  - expenses → W5; month → W6; recurring → W7
  - cards, statements, MSI, payments → W8
  - categories, budgets, settings, export, deletion → W9
  - dashboard (KPIs, safe-to-spend, series, breakdowns, budgets, upcoming, card debt) → W10
  - PWA, Docker, CI → W11; E2E per spec §9 → W12
- **Deliberate deviation:** the spec's "category donut" became ranked horizontal bars (see the W10 ruling).
- **Generated types:** field optionality in `schema.d.ts` follows swag, which marks non-pointer fields as not required. Use `?? default` where a field is typed optional; never cast to `any` to silence it.
