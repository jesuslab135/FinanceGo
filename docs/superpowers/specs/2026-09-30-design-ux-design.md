# FinanceGo — Design & UX Overhaul — Design Spec

Date: 2026-09-30
Status: Approved section by section in brainstorming (visual companion)
Applies to: `web/` (Next.js 16 client) on branch `feat/web`. No API changes.

## 1. Purpose and success criteria

Give FinanceGo a distinctive, warm, trustworthy look and a delightful but calm interaction model. The new-user experience should produce real numbers within minutes.

Success means:

- The whole app uses one token-driven design system with the "Warm & friendly" direction, in both light and dark themes.
- A new user reaches a dashboard with their own income, fixed payments and a first expense in under 2 minutes through a skippable guided setup.
- Logging an expense on a phone takes 3 taps plus the amount: **+**, amount, category, save.
- Motion is expressive but calm:
  - Nothing is over 300 ms, except the 600 ms number count-up and the 900 ms celebrations.
  - Everything turns into instant changes when `prefers-reduced-motion: reduce` is set.
- Quality bar:
  - WCAG AA contrast on every text/background pair.
  - Touch targets of at least 44 px.
  - Lighthouse accessibility 100 and performance ≥ 90 on the dashboard (mobile profile).
  - No horizontal scroll at 360 px.

Research that shaped these choices:

- Trust is paramount in fintech UX, and dashboards should support 5-second scans.
- Copilot and Monarch win users through visual polish and clarity; YNAB loses them through complexity.
- Fintech motion should reassure, not entertain: 150–350 ms, restrained counters.
- Finance apps lose 60–75 % of users in week one to empty and overwhelming first screens; first-run should produce one real outcome fast.
- Tabular figures for amounts; bottom sheets and 44 px targets on mobile.

## 2. Decisions

| Topic | Decision |
|---|---|
| Visual direction | B · Warm & friendly: warm neutrals, terracotta hero card, rounded cards, personal greeting |
| Typography | Plus Jakarta Sans (headings, hero and KPI numbers, 700/800) + Inter (body and tables, 400–600), self-hosted via `next/font`, Latin subset; amounts use `tabular-nums` |
| Category icons | Lucide line icons (1.75 stroke) on tiles tinted with the category color; curated set of about 40 icons with an icon picker |
| Motion level | Expressive but calm |
| Motion stack | Motion (`motion/react`, `LazyMotion` + `m`) for springs, lists, layout, count-up and swipe; View Transitions API for route changes; Vaul (shadcn Drawer) for bottom sheets; CSS for hover and press |
| UX upgrades | Guided first-run, mobile gestures, smart insights, faster entry (all four) |
| API | No changes. Insights and onboarding state are derived from existing endpoints plus localStorage |

## 3. Design tokens

All tokens are CSS custom properties in `globals.css`, exposed to Tailwind v4 via `@theme inline`. The dark theme is defined separately, not auto-inverted.

### 3.1 Color

| Token | Light | Dark |
|---|---|---|
| `--bg` (page) | `#f6efe7` | `#14100d` |
| `--surface` (cards) | `#fffaf4` | `#1c1714` |
| `--surface-raised` (rows, inputs) | `#ffffff` | `#241d19` |
| `--fg` | `#2a1d14` | `#f6ede4` |
| `--fg-muted` | `#6b5a4c` | `#b8a797` |
| `--border` | `#efe4d8` | `#2e2520` |
| `--brand` | `#d9602f` | `#e0683a` |
| `--brand-fg` (text on brand) | `#ffffff` | `#ffffff` |
| `--hero-from` / `--hero-to` | `#d9602f` / `#ef9a55` | `#b64b22` / `#e0683a` |
| `--accent` (teal) | `#0a8a74` | `#1fa38a` |
| `--chart-1` / `--chart-2` | `#d9602f` / `#0a8a74` | `#e0683a` / `#1fa38a` |
| `--good` / `--warning` / `--critical` | `#0ca30c` / `#fab219` / `#d03b3b` | same |
| `--critical-hero-from` / `--critical-hero-to` | `#b42828` / `#d94a3a` | `#8f1f1f` / `#c23a2e` |
| `--focus` | `#d9602f` | `#ef8a5c` |
| `--shadow` | `0 1px 2px rgb(74 45 25 / .06), 0 8px 24px rgb(74 45 25 / .08)` | none (1px `--border` hairline instead) |

Rules:

- **Chart palettes were validated** with the dataviz validator:
  - light `#d9602f,#0a8a74` on `#fffaf4`
  - dark `#e0683a,#1fa38a` on `#1c1714`
  - All checks pass.
- **Status colors** always carry an icon and a label, never color alone. Warning text uses `--fg`, because amber text fails contrast on light surfaces.
- **Category tiles** use the category color at 15 % opacity as the background, with the icon stroke at 100 %. In dark mode the tile uses 22 % opacity.
- **Contrast:** every text/background pair above must meet 4.5:1 (body) or 3:1 (≥ 18.66 px bold). A unit test computes contrast for the token pairs.

### 3.2 Typography

- **Display font** is Plus Jakarta Sans (`--font-display`), used for page titles, the greeting, hero and KPI amounts, and section titles.
- **Body font** is Inter (`--font-sans`), used everywhere else.
- **Scale (px):** 12 / 13 / 14 / 16 / 18 / 22 / 28 / 36 / 44. The hero amount is 36 px on mobile and 44 px on desktop, weight 800, `letter-spacing: -0.02em`.
- **Amounts:** every amount has `font-variant-numeric: tabular-nums`. On the hero amount, the cents render at 60 % opacity.

### 3.3 Shape, space, elevation

- **Radius:** 10 px (inputs, small buttons), 16 px (cards, rows), 20 px (hero, sheets, dialogs), full (chips, pills, FAB).
- **Spacing:** a 4 px grid. Page gutter is 16 px on mobile and 32 px on desktop.
- **Elevation:** light mode uses `--shadow` on cards; dark mode uses hairlines.

### 3.4 Motion tokens (`web/src/lib/motion.ts`)

- **Durations:** `press 120ms`, `small 200ms`, `sheet/page 280ms`, `count 600ms`, `celebrate 900ms`.
- **Easing:**
  - `enter = cubic-bezier(.2,.8,.2,1)`
  - `exit = cubic-bezier(.4,0,1,1)`
  - `spring = { type: "spring", stiffness: 380, damping: 32 }`
- **Stagger:** 40 ms (chips), 60 ms (chart bars).
- **Reduced motion:** `MotionConfig reducedMotion="user"` at the root. Custom JS animations (count-up, confetti) check `useReducedMotion()` and jump to the end state. In CSS, `@media (prefers-reduced-motion: reduce)` sets transition and animation durations to 0 and disables view-transition animations.

## 4. Components and patterns

1. **HeroAvailable.** Gradient card with the label "Te quedan este mes" / "Left this month", the amount, and "≈ $X al día · N días" (ICU plural).
   - Count-up (`useCountUp`) animates from the previous value to the new one over 600 ms.
   - When Available < 0, it switches to the critical gradient with an AlertTriangle and "Sobregirado", and skips the count-up.
   - It is used on the dashboard and on the month view (for the month shown), and carries `view-transition-name: hero-amount` so the amount morphs between those pages.
2. **Greeting.** "¡Buenos días / Buenas tardes / Buenas noches, {firstName}!" chosen from the local hour, with the month name below.
3. **KpiChips.** Income, Fixed, Installments, Spent as rounded tiles with a small icon. They enter with fade plus an 8 px upward slide, staggered 40 ms.
4. **ListRow** (used by expenses, month entries, upcoming, statement charges, plans):
   - Layout: category tile, title and meta, amount aligned right.
   - Enter animation: fade and slide. Removal: height collapse via `AnimatePresence` with `layout`.
   - **SwipeRow** wrapper, touch devices only (`pointer: coarse`):
     - Swiping left past 72 px reveals **Editar** and **Eliminar**.
     - Swiping right past 96 px runs the primary action (for example "Marcar pagado") with a spring snap back.
     - Every swipe action also exists in an always-available "…" menu, so keyboard and screen-reader users are covered.
5. **Undoable delete.** Deleting removes the row optimistically and shows the toast "Eliminado · Deshacer" for 5 s. The API DELETE is sent only when the toast expires, or immediately if the user navigates away. Deshacer restores the row. Implemented in `useUndoableDelete(mutation)`.
6. **Sheets.**
   - **Mobile (below `md`):** Vaul Drawer, draggable, snap points [0.55, 1], drag down to dismiss, grab handle, focus trapped.
   - **Desktop:** Dialog with scale 0.96→1 and fade over 200 ms.
   - `ResponsiveDialog` switches between them.
7. **QuickAdd**, a keypad flow opened from the FAB and the sidebar button:
   - **Step 1, amount keypad.** 3×4 grid of digits, `00` and backspace. The amount builds in cents, like an ATM (typing 1-2-3-4-5 shows 123.45), is displayed large with tabular digits, and can't exceed the max amount.
   - **Step 2, category grid.** The 6 most recently used expense categories come first, then all the rest. Each is a tile with icon and name.
   - **Step 3, card chips.** Defaults to the card last used with that category, falling back to the last card used.
   - **Optional fields:** description and date (today by default).
   - **Save:** calls `POST /expenses`, pulses the FAB, triggers a haptic tap (`navigator.vibrate?.(10)`) and shows the toast "Guardado · Deshacer" (undo deletes the new expense).
   - **Description suggestions:** typing a description suggests the category last used with a matching description.
   - The existing full ExpenseForm remains for editing.
8. **Charts.**
   - Stacked bars grow from the baseline on first render (Recharts `isAnimationActive` with 600 ms duration; disabled under reduced motion).
   - Changing period cross-fades the chart.
   - Breakdown bars and budget meters animate width from 0 on mount.
9. **Page transitions.**
   - Next 16 view transitions (`experimental.viewTransition` / React `<ViewTransition>` where available), otherwise `@view-transition { navigation: auto; }` with CSS.
   - Pages cross-fade with a 6 px upward slide over 200 ms.
   - The hero amount morphs between pages via its shared view-transition name.
   - Browsers without the API change pages instantly.
10. **Skeletons.** Content-shaped skeletons with a warm shimmer (`--surface-raised` → `--border`, 1.2 s linear, stopped under reduced motion). During refetches the previous data stays visible (`keepPreviousData`) with a subtle 1 px progress bar at the top of the page.
11. **Celebrate.** `celebrate(kind)` fires a canvas confetti burst (lazy-loaded `canvas-confetti`, about 900 ms, brand colors) plus a toast. It is skipped under reduced motion, which shows only the toast. Triggers:
    - a card's `amount_due` becomes 0 after recording a payment
    - the first expense ever
    - viewing a past month whose Available ended ≥ 0 with every budget ≤ 100 % (once per month, remembered in localStorage)
    - finishing onboarding
12. **Feedback details.**
    - Buttons scale to 0.97 on press, 120 ms.
    - Tabs and segmented controls use a sliding pill indicator (Motion `layoutId`).
    - Toasts come from the bottom on mobile and the top-right on desktop, styled with the brand theme.
13. **Credit card tiles.** On the cards page, credit cards render as physical-card shapes (aspect 1.586):
    - background gradient from the card's color, the bank name, and "···· 4242" in a monospace-feel tabular font
    - network glyph text (VISA / Mastercard / AMEX)
    - a utilization bar at the bottom
    - on desktop, a hover lift of −2 px with a stronger shadow.
14. **Icon picker.** Categories choose from a curated set of about 40 Lucide icons in `web/src/lib/category-icons.ts`: `{ key, Icon, labelKey }`. Unknown icon keys fall back to `Tag`. The existing API `icon` string field stores the key; default categories already use keys like `utensils`, `car`, `home`, `zap`, `heart-pulse`, `film`, `repeat`, `percent`, `tag`, `briefcase`, `plus`.
15. **Illustrations.** Five small inline-SVG line illustrations in brand colors: empty expenses, empty month, no cards, no recurring, all caught up. Each is a component under `web/src/components/illustrations/`, `aria-hidden`, and lazy-loaded where large.

## 5. Guided first-run

- **Trigger:** status is authenticated, the user has 0 income sources, and `localStorage["fin:onboarding-skipped:<userId>"]` is not set. The (app) layout then redirects to `/[locale]/welcome`.
- **Steps**, each a full-screen card with a progress bar, "Atrás" (back), "Saltar" (skip) and "Continuar" (continue):
  1. **Income:**
     - name, prefilled "Salario" / "Salary"
     - amount entered on the keypad
     - payday as a day chip 1–31, with 15 and 30 highlighted
     - Creates an income source starting this month.
  2. **Fixed payments:**
     - Suggestion chips: Renta, Luz, Agua, Internet, Teléfono, Netflix, Gimnasio, Seguro.
     - Tapping a chip opens an inline amount + day row. Several can be added.
     - Each creates a fixed payment in a matching default category.
    - Categories are matched by their `icon` key, not by name, because names differ per locale: Renta→`home`; Luz, Agua, Internet, Teléfono→`zap`; Netflix→`repeat`; Gimnasio→`heart-pulse`; Seguro→`tag`.
    - If no category has that icon, the first expense category is used.
  3. **Cards (optional):**
     - nickname, type (Crédito / Débito), last 4, and for credit cards the statement day and due day
     - "Agregar otra" (add another) or "Terminar" (finish).
- **Finish:** navigate to the dashboard, where the hero counts up from 0, and `celebrate("welcome")`.
- **Skip:** sets the localStorage flag and goes to the dashboard. The dashboard then shows a dismissible "Completa tu configuración" (finish your setup) insight until an income source exists.

## 6. Smart insights

Pure functions in `web/src/lib/insights.ts` take already-fetched data and return `Insight[]`:

```ts
type Insight = {
  id: string;
  kind: "category_change" | "card_due" | "budget" | "overdue" | "streak" | "setup";
  tone: "info" | "good" | "warn" | "critical";
  icon: LucideIcon;
  messageKey: string;
  values: Record<string, string | number>;
  href?: string;
  priority: number;
};
```

Rules (priority high to low):

1. `overdue`: pending fixed payments with `due_date` < today (from upcoming). Tone critical.
2. `card_due`: a card with `amount_due` > 0 and a due date within 3 days (from cards overview). Tone warn.
3. `budget`: a budget with pct > 100 is critical; 80 ≤ pct ≤ 100 is warn. This matches the budget meters' `budgetStatus`.
4. `category_change`: compare expense-category spending month-to-date with the same day-range last month (breakdown by category for both ranges). Emit when |Δ| ≥ 20 % and the current amount is ≥ 1 % of income. Only the largest increase and the largest decrease are shown. An increase is warn, a decrease is good.
5. `streak`: consecutive days up to yesterday where daily expenses ≤ the current safe-to-spend per day (from the day series). Emit when ≥ 3. Tone good.
6. `setup`: onboarding was skipped and there is no income source.

- **Display:** at most 3, sorted by priority. Each insight can be dismissed until tomorrow (`localStorage` key per insight id + date). Horizontal snap-scroll row on mobile, stacked column on desktop.
- **Data:** the only extra requests are the previous-month-range breakdown and the day series for the last 14 days, both through existing hooks.

## 7. Faster entry

- **Recents:** `useRecents()` keeps the last used category ids (max 12) and a per-category last card, in `localStorage` keyed by user id, updated on every successful expense create.
- **Description suggestion:** while typing a description (≥ 3 characters), search `/expenses?q=` (debounced 300 ms, limit 5). If the top result's category differs from the current one, show a chip "¿Categoría: Comida?" (suggest category: Food) that sets the category when tapped.
- **Repetir:** a "Repetir" (repeat) action on an expense row (menu and swipe-left) opens QuickAdd prefilled with the same amount, category, card and description, dated today.

## 8. Screen-by-screen

- **Dashboard order:** Greeting → HeroAvailable → Insights → KpiChips → Spending chart (with period tabs) → Upcoming → Breakdowns → Budgets → Card debt.
- **Expenses:** grouped by day with sticky day headers (sum per day), SwipeRows, filter chips row, empty illustration.
- **Month:** HeroAvailable for that month, sections with collapse/expand, SwipeRows (swipe right to mark paid or received).
- **Recurring:** tinted tiles per template, "Cada mes el día 15" (every month on day 15), and a small timeline dot showing the next occurrence.
- **Cards:** physical-card tiles; the detail page has a statement card with the cycle switcher (a segmented pill with a sliding indicator), plus lists.
- **Categories:** a grid of tiles with the icon picker, and budget progress on each tile.
- **Settings:** grouped cards, with the theme chooser as three visual swatches (light / dark / system).
- **Auth:**
  - split layout on desktop: brand panel with gradient and illustration on the left, form on the right
  - single column on mobile
  - the logo mark is a terracotta rounded square with an "F" and a teal dot.

## 9. Accessibility, performance, testing

- **Accessibility:**
  - Focus rings: 2 px `--focus` with an offset of 2.
  - All swipe and gesture actions have menu or button equivalents.
  - Confetti is `aria-hidden`, and toasts announce the message (`role="status"`).
  - The count-up exposes the final value to screen readers (`aria-label` on the static final value, with the animated digits `aria-hidden`).
  - The keypad has a full keyboard path: digits typed on a physical keyboard work, and Backspace works.
- **Performance:**
  - Motion via `LazyMotion` + `domAnimation`.
  - `canvas-confetti` and the illustrations loaded with `dynamic()`.
  - Fonts via `next/font`, Latin subset, `display: swap`.
  - Only transform and opacity are animated.
  - Budget: no route JS increase > 60 KB gzip over the current build.
- **Tests (Vitest):**
  - insights rules (each rule plus prioritization, with fixed dates)
  - keypad reducer (digits, 00, backspace, max)
  - `useCountUp` (reduced motion → final value immediately)
  - `useUndoableDelete` (undo cancels, timeout commits, navigation commits)
  - `useRecents`
  - token contrast pairs
  - onboarding redirect conditions
- **Tests (Playwright):**
  - onboarding happy path and skip
  - quick add via keypad (3 taps + amount)
  - swipe-to-delete with undo (touch emulation) and the menu alternative
  - insights render for seeded data
  - 360 px overflow on all pages
  - reduced-motion run (`reducedMotion: "reduce"`) still passes the happy path
  - screenshot snapshots (dashboard, cards, quick add) in light and dark, with tolerance.

## 10. Out of scope

- Server-side insights or push notifications
- AI features
- Native apps
- Sound effects
- Custom illustrations beyond the five listed
- Bank sync
- Animated charts beyond the entry and period transitions
