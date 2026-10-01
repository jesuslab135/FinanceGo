import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Summary } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { HeroAvailable } from "./hero-available";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));
vi.mock("motion/react", async (o) => ({ ...(await o<typeof import("motion/react")>()), useReducedMotion: () => true }));

const s: Summary = {
  month: "2026-03", currency: "MXN", income: 3000000, fixed_committed: 1000000, fixed_paid: 0, saved: 0, saved_planned: 0, saved_deposited: 0, saved_withdrawn: 0, installments: 0,
  spent: 751950, available: 1248050, budgets: [], safe_to_spend_per_day: 73414, days_remaining: 17,
};

describe("HeroAvailable", () => {
  it("shows the amount, per-day hint and the brand gradient", () => {
    const { container } = renderWithProviders(<HeroAvailable summary={s} />);
    expect(screen.getByLabelText("$12,480.50")).toBeInTheDocument();
    expect(screen.getByText(/734\.14 al día · 17 días/)).toBeInTheDocument();
    expect(container.querySelector("[data-tone='brand']")).not.toBeNull();
  });
  it("renders the cents smaller (full white, not dimmed) and shows the final value immediately under reduced motion", () => {
    renderWithProviders(<HeroAvailable summary={s} />);
    const el = screen.getByLabelText("$12,480.50");
    expect(el.textContent).toBe("$12,480.50");
    const cents = el.querySelector("[class*=\"0.75em\"]");
    expect(cents?.textContent).toBe(".50");
    expect(el.querySelector(".opacity-60")).toBeNull();
  });
  it("overspent: critical tone with icon and label, not color alone", () => {
    const { container } = renderWithProviders(<HeroAvailable summary={{ ...s, available: -20000, safe_to_spend_per_day: 0 }} />);
    expect(screen.getByText("Sobregirado")).toBeInTheDocument();
    expect(container.querySelector("[data-tone='critical'] svg")).not.toBeNull();
  });
});
