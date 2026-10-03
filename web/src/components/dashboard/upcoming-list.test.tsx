import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { UpcomingList } from "./upcoming-list";

vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
const mutate = vi.fn();
const useUpcoming = vi.fn();
const ROWS = [{ type: "fixed", entry_id: 7, payment_method_id: 3, name: "Renta", date: "2026-10-05", amount: 1200000, overdue: false }];
let result: { data?: unknown; error?: unknown; isPending: boolean } = { data: ROWS, isPending: false };
vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  useUpcoming: (days: number) => { useUpcoming(days); return result; },
  useUpdateEntry: () => ({ mutate, isPending: false }),
}));

describe("UpcomingList", () => {
  beforeEach(() => { result = { data: ROWS, isPending: false }; });

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

  it("shows a loading state, not 'all caught up', while the query is pending", () => {
    result = { data: undefined, isPending: true };
    renderWithProviders(<UpcomingList />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByText("Estás al día: nada por vencer pronto")).not.toBeInTheDocument();
  });

  it("shows the empty state only after an empty successful load", () => {
    result = { data: [], isPending: false };
    renderWithProviders(<UpcomingList />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Estás al día: nada por vencer pronto")).toBeInTheDocument();
  });
});
