import { beforeEach, describe, expect, it, vi } from "vitest";

const confettiMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn() }));
vi.mock("canvas-confetti", () => ({ default: confettiMock }));
vi.mock("sonner", () => ({ toast: toastMock }));

import type { Summary } from "@/lib/api/types";
import { celebrate, shouldCelebrateMonth } from "./celebrate";

const s = (over: Partial<Summary>): Summary => ({ month: "2026-02", currency: "MXN", income: 1, fixed_committed: 0, fixed_paid: 0, saved: 0, saved_planned: 0, saved_deposited: 0, saved_withdrawn: 0, installments: 0, spent: 0, available: 100, budgets: [], ...over });

describe("celebrate", () => {
  beforeEach(() => { confettiMock.mockReset(); toastMock.success.mockReset(); });
  it("toasts and bursts confetti", async () => {
    await celebrate("cardPaidOff", "¡Tarjeta al corriente!", { reduceMotion: false });
    expect(toastMock.success).toHaveBeenCalledWith("¡Tarjeta al corriente!");
    expect(confettiMock).toHaveBeenCalled();
  });
  it("reduced motion: toast only", async () => {
    await celebrate("welcome", "¡Listo!", { reduceMotion: true });
    expect(toastMock.success).toHaveBeenCalled();
    expect(confettiMock).not.toHaveBeenCalled();
  });
  it("reads the OS preference when no option is given", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    await celebrate("welcome", "¡Listo!");
    vi.unstubAllGlobals();
    expect(toastMock.success).toHaveBeenCalled();
    expect(confettiMock).not.toHaveBeenCalled();
  });
  it("only past months that ended ≥0 with all budgets ≤100%", () => {
    expect(shouldCelebrateMonth(s({}), "2026-03")).toBe(true);
    expect(shouldCelebrateMonth(s({ month: "2026-03" }), "2026-03")).toBe(false);
    expect(shouldCelebrateMonth(s({ available: -1 }), "2026-03")).toBe(false);
    expect(shouldCelebrateMonth(s({ budgets: [{ category_id: 1, name: "a", color: "", limit: 1, spent: 2, pct: 200 }] }), "2026-03")).toBe(false);
    expect(shouldCelebrateMonth(s({ income: 0 }), "2026-03")).toBe(false);
  });
});
