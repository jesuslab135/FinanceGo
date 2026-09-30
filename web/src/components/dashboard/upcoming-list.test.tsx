import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { UpcomingList } from "./upcoming-list";

vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
const mutate = vi.fn();
vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  useUpcoming: () => ({
    data: [{ type: "fixed", entry_id: 7, payment_method_id: 3, name: "Renta", date: "2026-10-05", amount: 1200000, overdue: false }],
  }),
  useUpdateEntry: () => ({ mutate, isPending: false }),
}));

describe("UpcomingList", () => {
  it("marks a fixed entry paid without settled_on", () => {
    renderWithProviders(<UpcomingList />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar pagado" }));
    const payload = mutate.mock.calls[0][0];
    expect(payload).toEqual({ id: 7, amount: 1200000, status: "paid", payment_method_id: 3 });
    expect("settled_on" in payload).toBe(false);
  });
});
