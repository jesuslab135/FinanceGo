import { differenceInCalendarDays } from "date-fns";
import type { BreakdownItem, CardSummary, SeriesPoint, Summary, UpcomingItem } from "@/lib/api/types";
import { parseISODate, toISODate } from "@/lib/dates";

export type Insight = {
  id: string;
  kind: "overdue" | "card_due" | "budget" | "category_change" | "streak" | "setup";
  tone: "info" | "good" | "warn" | "critical";
  messageKey: string;
  values: Record<string, string | number>;
  href?: string;
  priority: number;
};

export type InsightInput = {
  today: Date; summary?: Summary; upcoming: UpcomingItem[]; cards: CardSummary[];
  catNow: BreakdownItem[]; catPrev: BreakdownItem[]; daily: SeriesPoint[];
  hasIncome: boolean; onboardingSkipped: boolean;
};

export function computeInsights(i: InsightInput, fmt: (cents: number) => string): Insight[] {
  const out: Insight[] = [];
  const todayISO = toISODate(i.today);

  const overdue = i.upcoming.filter((u) => u.type === "fixed" && u.overdue);
  if (overdue.length) {
    out.push({ id: `overdue-${todayISO}`, kind: "overdue", tone: "critical", messageKey: "insights.overdue",
      values: { count: overdue.length, name: overdue[0].name }, href: `/month/${todayISO.slice(0, 7)}`, priority: 100 });
  }

  if (i.onboardingSkipped && !i.hasIncome) {
    out.push({ id: "setup", kind: "setup", tone: "info", messageKey: "insights.setup", values: {}, href: "/welcome", priority: 95 });
  }

  for (const c of i.cards) {
    const days = differenceInCalendarDays(parseISODate(c.due_on), i.today);
    if (c.amount_due > 0 && days >= 0 && days <= 3) {
      out.push({ id: `card-${c.payment_method_id}-${c.due_on}`, kind: "card_due", tone: "warn", messageKey: "insights.cardDue",
        values: { name: c.nickname, amount: fmt(c.amount_due), days }, href: `/cards/${c.payment_method_id}`, priority: 90 });
    }
  }

  // Thresholds mirror budgetStatus: over is pct > 100, near is 80..100.
  const budgets = i.summary?.budgets ?? [];
  const over = [...budgets].filter((b) => b.pct > 100).sort((a, b) => b.pct - a.pct)[0];
  const near = [...budgets].filter((b) => b.pct >= 80 && b.pct <= 100).sort((a, b) => b.pct - a.pct)[0];
  if (over) out.push({ id: `budget-over-${over.category_id}`, kind: "budget", tone: "critical", messageKey: "insights.budgetOver", values: { name: over.name, pct: over.pct }, href: "/categories", priority: 80 });
  if (near) out.push({ id: `budget-near-${near.category_id}`, kind: "budget", tone: "warn", messageKey: "insights.budgetNear", values: { name: near.name, pct: near.pct }, href: "/categories", priority: 70 });

  // Day 1-2 have too little data to compare; no income means the 1% floor is meaningless.
  const income = i.summary?.income ?? 0;
  if (i.today.getDate() >= 3 && income > 0) {
    const prev = new Map(i.catPrev.map((c) => [c.id, c.amount]));
    let up: { name: string; pct: number } | null = null;
    let down: { name: string; pct: number } | null = null;
    for (const c of i.catNow) {
      const p = c.id != null ? prev.get(c.id) ?? 0 : 0;
      if (p <= 0) continue;
      const pct = Math.round(((c.amount - p) / p) * 100);
      if (Math.abs(pct) < 20 || Math.max(c.amount, p) < income * 0.01) continue;
      if (pct > 0 && (!up || pct > up.pct)) up = { name: c.name, pct };
      if (pct < 0 && (!down || -pct > down.pct)) down = { name: c.name, pct: -pct };
    }
    if (up) out.push({ id: `cat-up-${up.name}-${todayISO}`, kind: "category_change", tone: "warn", messageKey: "insights.categoryUp", values: up, href: "/expenses", priority: 60 });
    if (down) out.push({ id: `cat-down-${down.name}-${todayISO}`, kind: "category_change", tone: "good", messageKey: "insights.categoryDown", values: down, href: "/expenses", priority: 40 });
  }

  const safe = i.summary?.safe_to_spend_per_day;
  if (safe != null && safe > 0) {
    const days = [...i.daily].filter((d) => d.start < todayISO).sort((a, b) => (a.start < b.start ? 1 : -1));
    let streak = 0;
    for (const d of days) {
      if (d.expenses <= safe) streak++;
      else break;
    }
    if (streak >= 3) out.push({ id: `streak-${todayISO}`, kind: "streak", tone: "good", messageKey: "insights.streak", values: { days: streak }, priority: 30 });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 3);
}
