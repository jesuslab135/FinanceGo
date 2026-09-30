import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CardSummary, PaymentMethod } from "@/lib/api/types";
import { renderWithProviders } from "@/test/render";
import { cardPalette } from "@/lib/contrast";
import { CardTile } from "./card-tile";

vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));
vi.mock("motion/react", async (o) => ({ ...(await o<typeof import("motion/react")>()), useReducedMotion: () => true }));

const credit: PaymentMethod = {
  id: 1, nickname: "BBVA Oro", type: "credit", network: "visa", last4: "4242", color: "#1f4ea8", active: true, opening_balance: 0,
};
const summary: CardSummary = {
  payment_method_id: 1, nickname: "BBVA Oro", color: "#1f4ea8", current_balance: 90000, credit_limit: 5000000,
  amount_due: 40000, due_on: "2026-04-05", cycle: "2026-03",
};

describe("CardTile", () => {
  it("renders a credit card like a physical card", () => {
    const { container } = renderWithProviders(<CardTile pm={credit} summary={summary} />);
    expect(screen.getByText("BBVA Oro")).toBeInTheDocument();
    expect(screen.getByText("···· 4242")).toBeInTheDocument();
    expect(screen.getByText("VISA")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "90000");
    expect(screen.getByText(/\$400\.00/)).toBeInTheDocument();
    // jsdom normalizes #1f4ea8 to rgb(31, 78, 168)
    expect((container.firstChild as HTMLElement).getAttribute("style")).toContain("rgb(31, 78, 168)");
    expect((container.firstChild as HTMLElement).getAttribute("style")).toContain("linear-gradient");
  });

  it("renders no meter for a debit card", () => {
    renderWithProviders(<CardTile pm={{ ...credit, type: "debit", network: undefined }} />);
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.getByText("Débito")).toBeInTheDocument();
  });

  it("picks dark ink on light colors and white on dark ones, keeping a dark color unchanged", () => {
    expect(cardPalette("#fafafa")).toEqual({ from: "#fafafa", ink: "#2a1d14" });
    expect(cardPalette("#1f4ea8")).toEqual({ from: "#1f4ea8", ink: "#ffffff" });
  });
});
