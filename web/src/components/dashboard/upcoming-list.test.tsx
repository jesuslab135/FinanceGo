import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { UpcomingList } from "./upcoming-list";

vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
const mutate = vi.fn();
const useUpcoming = vi.fn();
vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  useUpcoming: (days: number) => { useUpcoming(days); return { data: [{ type: "fixed", entry_id: 7, payment_method_id: 3, name: "Renta", date: "2026-10-05", amount: 1200000, overdue: false }] }; },
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

  it("shows the next 7 days by default and switches to 30", () => {
    useUpcoming.mockClear();
    renderWithProviders(<UpcomingList />);
    expect(useUpcoming).toHaveBeenLastCalledWith(7);
    expect(screen.getByRole("radio", { name: "7 días" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "30 días" }));
    expect(useUpcoming).toHaveBeenLastCalledWith(30);
    expect(screen.getByRole("radio", { name: "30 días" })).toHaveAttribute("aria-checked", "true");
  });
});
