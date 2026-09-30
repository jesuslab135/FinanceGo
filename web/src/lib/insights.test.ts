import { describe, expect, it } from "vitest";
import type { Summary } from "@/lib/api/types";
import { computeInsights, type InsightInput } from "./insights";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const summary: Summary = {
  month: "2026-03", currency: "MXN", income: 3000000, fixed_committed: 0, fixed_paid: 0, installments: 0, spent: 0,
  available: 3000000, budgets: [], safe_to_spend_per_day: 50000, days_remaining: 17,
};
const base: InsightInput = {
  today: new Date(2026, 2, 15), summary, upcoming: [], cards: [], catNow: [], catPrev: [], daily: [], hasIncome: true, onboardingSkipped: false,
};

describe("computeInsights", () => {
  it("nothing to say → empty", () => {
    expect(computeInsights(base, fmt)).toEqual([]);
  });

  it("overdue fixed payments rank first (critical)", () => {
    const r = computeInsights({ ...base, upcoming: [
      { type: "fixed", date: "2026-03-10", name: "Luz", amount: 50000, overdue: true, entry_id: 1 },
      { type: "fixed", date: "2026-03-12", name: "Agua", amount: 30000, overdue: true, entry_id: 2 },
    ] }, fmt);
    expect(r[0]).toMatchObject({ kind: "overdue", tone: "critical", values: { count: 2, name: "Luz" } });
  });

  it("card due within 3 days", () => {
    const r = computeInsights({ ...base, cards: [
      { payment_method_id: 7, nickname: "BBVA", color: "#000", current_balance: 90000, amount_due: 40000, due_on: "2026-03-17", cycle: "2026-03" },
      { payment_method_id: 8, nickname: "Nu", color: "#000", current_balance: 1, amount_due: 100, due_on: "2026-03-30", cycle: "2026-03" },
    ] }, fmt);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "card_due", tone: "warn", values: { name: "BBVA", amount: "$400.00", days: 2 }, href: "/cards/7" });
  });

  it("budgets: over is critical, near is warn", () => {
    const r = computeInsights({ ...base, summary: { ...summary, budgets: [
      { category_id: 1, name: "Comida", color: "#f00", limit: 100000, spent: 120000, pct: 120 },
      { category_id: 2, name: "Ocio", color: "#0f0", limit: 100000, spent: 85000, pct: 85 },
    ] } }, fmt);
    expect(r.map((i) => [i.kind, i.tone])).toEqual([["budget", "critical"], ["budget", "warn"]]);
  });

  it("budget boundaries match budgetStatus: 79 silent, 80 and 100 warn, 101 critical", () => {
    const at = (pct: number) => computeInsights({ ...base, summary: { ...summary, budgets: [
      { category_id: 1, name: "X", color: "", limit: 100, spent: pct, pct }] } }, fmt).map((i) => i.tone);
    expect(at(79)).toEqual([]);
    expect(at(80)).toEqual(["warn"]);
    expect(at(100)).toEqual(["warn"]);
    expect(at(101)).toEqual(["critical"]);
  });

  it("category change: biggest increase and decrease ≥20% and ≥1% of income", () => {
    const r = computeInsights({ ...base,
      catNow: [{ id: 1, name: "Comida", color: "", amount: 360000 }, { id: 2, name: "Ocio", color: "", amount: 50000 }, { id: 3, name: "Café", color: "", amount: 20000 }],
      catPrev: [{ id: 1, name: "Comida", color: "", amount: 300000 }, { id: 2, name: "Ocio", color: "", amount: 100000 }, { id: 3, name: "Café", color: "", amount: 1000 }],
    }, fmt);
    // Café +1900% but 20000 < 1% of income (30000) → excluded.
    expect(r.find((i) => i.messageKey === "insights.categoryUp")?.values).toMatchObject({ name: "Comida", pct: 20 });
    expect(r.find((i) => i.messageKey === "insights.categoryDown")?.values).toMatchObject({ name: "Ocio", pct: 50 });
  });

  it("day 1: no category comparison and no division by zero", () => {
    const r = computeInsights({ ...base, today: new Date(2026, 2, 1),
      catNow: [{ id: 1, name: "Comida", color: "", amount: 500000 }], catPrev: [{ id: 1, name: "Comida", color: "", amount: 0 }] }, fmt);
    expect(r.filter((i) => i.kind === "category_change")).toEqual([]);
  });

  it("day 1 with a real previous amount still does not compare", () => {
    const r = computeInsights({ ...base, today: new Date(2026, 2, 1),
      catNow: [{ id: 1, name: "Comida", color: "", amount: 500000 }], catPrev: [{ id: 1, name: "Comida", color: "", amount: 100000 }] }, fmt);
    expect(r.filter((i) => i.kind === "category_change")).toEqual([]);
  });

  it("no income: no category insights", () => {
    const r = computeInsights({ ...base, summary: { ...summary, income: 0 },
      catNow: [{ id: 1, name: "Comida", color: "", amount: 500000 }], catPrev: [{ id: 1, name: "Comida", color: "", amount: 100000 }] }, fmt);
    expect(r.filter((i) => i.kind === "category_change")).toEqual([]);
  });

  it("streak: consecutive days up to yesterday under safe-to-spend", () => {
    const daily = ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14", "2026-03-15"].map((d, i) => ({
      start: d, expenses: i === 0 ? 90000 : 10000, committed: 0,
    }));
    const r = computeInsights({ ...base, daily }, fmt);
    expect(r[0]).toMatchObject({ kind: "streak", tone: "good", values: { days: 4 } }); // 11,12,13,14 (today excluded)
  });

  it("setup reminder when onboarding skipped and no income; max 3 results", () => {
    const r = computeInsights({ ...base, hasIncome: false, onboardingSkipped: true, upcoming: [
      { type: "fixed", date: "2026-03-10", name: "Luz", amount: 1, overdue: true, entry_id: 1 }],
      summary: { ...summary, budgets: [
        { category_id: 1, name: "A", color: "", limit: 1, spent: 2, pct: 200 },
        { category_id: 2, name: "B", color: "", limit: 10, spent: 9, pct: 90 }] } }, fmt);
    expect(r).toHaveLength(3);
    expect(r.map((i) => i.kind)).toEqual(["overdue", "setup", "budget"]);
  });

  it("streak needs at least one day with spending", () => {
    const daily = ["2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14"].map((d) => ({ start: d, expenses: 0, committed: 0 }));
    expect(computeInsights({ ...base, daily }, fmt)).toEqual([]);
  });

  it("overdue link points at the month of the overdue item", () => {
    const r = computeInsights({ ...base, upcoming: [{ type: "fixed", date: "2026-02-27", name: "Luz", amount: 1, overdue: true, entry_id: 1 }] }, fmt);
    expect(r[0].href).toBe("/month/2026-02");
  });

  it("degrades per input: an unavailable input hides only the insights that need it", () => {
    const upcoming = [{ type: "fixed", date: "2026-03-10", name: "Luz", amount: 1, overdue: true, entry_id: 1 }];
    const budgets = [{ category_id: 1, name: "A", color: "", limit: 1, spent: 2, pct: 200 }];
    const r = computeInsights({ ...base, upcoming, summary: { ...summary, budgets }, daily: undefined, cards: undefined, catNow: undefined, catPrev: undefined }, fmt);
    expect(r.map((i) => i.kind)).toEqual(["overdue", "budget"]);
    const r2 = computeInsights({ ...base, upcoming: undefined, summary: { ...summary, budgets } }, fmt);
    expect(r2.map((i) => i.kind)).toEqual(["budget"]);
    const r3 = computeInsights({ ...base, summary: undefined, hasIncome: undefined, onboardingSkipped: true, upcoming }, fmt);
    expect(r3.map((i) => i.kind)).toEqual(["overdue"]);
  });
});
