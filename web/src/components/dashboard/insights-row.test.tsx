import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { toISODate } from "@/lib/dates";
import type { Insight } from "@/lib/insights";
import { InsightsRow } from "./insights-row";

vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const items: Insight[] = [
  { id: "a", kind: "budget", tone: "critical", messageKey: "insights.budgetOver", values: { name: "Comida", pct: 120 }, href: "/categories", priority: 80 },
  { id: "b", kind: "streak", tone: "good", messageKey: "insights.streak", values: { days: 4 }, priority: 30 },
];

describe("InsightsRow", () => {
  beforeEach(() => localStorage.clear());

  it("renders message, tone label and a View link", () => {
    renderWithProviders(<InsightsRow insights={items} />);
    expect(screen.getByText("Te pasaste del límite de Comida (120%)")).toBeInTheDocument();
    expect(screen.getByText("Urgente")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver" })).toHaveAttribute("href", "/categories");
  });

  it("dismiss persists for today, namespaced by user", () => {
    renderWithProviders(<InsightsRow insights={items} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Ocultar" })[0]);
    expect(JSON.parse(localStorage.getItem("fin:insights-dismissed:1")!)).toEqual({ a: toISODate(new Date()) });
  });

  it("stays hidden on remount after a dismissal today", () => {
    localStorage.setItem("fin:insights-dismissed:1", JSON.stringify({ a: toISODate(new Date()), b: toISODate(new Date()) }));
    const { container } = renderWithProviders(<InsightsRow insights={items} />);
    expect(container).toBeEmptyDOMElement();
  });
});
