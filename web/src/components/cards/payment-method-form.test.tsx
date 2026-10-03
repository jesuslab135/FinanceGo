import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PaymentMethodForm } from "./payment-method-form";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));

describe("PaymentMethodForm", () => {
  it("rejects anything but exactly 4 digits for last4", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PaymentMethodForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Alias"), "Nómina");
    await userEvent.type(screen.getByLabelText("Últimos 4 dígitos"), "12a4");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Exactamente 4 dígitos")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("limits last4 input length and never offers a full-number field", () => {
    renderWithProviders(<PaymentMethodForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Últimos 4 dígitos")).toHaveAttribute("maxLength", "4");
    expect(screen.queryByLabelText(/número|number|cvv/i)).toBeNull();
  });

  it("builds a credit card payload with cents and cycle days", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<PaymentMethodForm initial={{ type: "credit" }} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Alias"), "BBVA Oro");
    await userEvent.type(screen.getByLabelText("Últimos 4 dígitos"), "4242");
    await userEvent.type(screen.getByLabelText("Límite de crédito"), "50,000");
    await userEvent.clear(screen.getByLabelText("Día de corte"));
    await userEvent.type(screen.getByLabelText("Día de corte"), "15");
    await userEvent.clear(screen.getByLabelText("Día límite de pago"));
    await userEvent.type(screen.getByLabelText("Día límite de pago"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const v = onSubmit.mock.calls[0][0];
    expect(v).toMatchObject({
      nickname: "BBVA Oro", type: "credit", last4: "4242", credit_limit: 5000000,
      statement_day: 15, payment_due_day: 5, opening_balance: 0,
    });
    expect(v.opening_balance_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("debit cards hide and null the credit fields", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<PaymentMethodForm initial={{ type: "debit" }} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText("Día de corte")).toBeNull();
    await userEvent.type(screen.getByLabelText("Alias"), "Nómina");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        type: "debit", credit_limit: null, statement_day: null, payment_due_day: null, opening_balance: 0, opening_balance_date: null,
      }),
    );
  });
});

describe("PaymentMethodForm editing", () => {
  it("keeps the type of an existing card when submitting", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<PaymentMethodForm initial={{ id: 3, type: "debit", nickname: "Nómina", color: "#64748b" }} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: "debit" });
  });
});
