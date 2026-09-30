import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { TemplateForm } from "./template-form";

vi.mock("@/lib/query/hooks", () => ({
  useCategories: () => ({ data: [{ id: 5, name: "Vivienda", kind: "expense", color: "#8b5cf6", icon: "home" }] }),
  usePaymentMethods: () => ({ data: [] }),
  useMe: () => ({ data: { currency: "MXN" } }),
}));

describe("TemplateForm", () => {
  it("validates the day of month", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TemplateForm kind="income" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Nombre"), "Salario");
    await userEvent.type(screen.getByLabelText("Monto"), "25000");
    await userEvent.clear(screen.getByLabelText("Día del mes"));
    await userEvent.type(screen.getByLabelText("Día del mes"), "32");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Día entre 1 y 31")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an end month before the start month", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <TemplateForm kind="income" initial={{ name: "Salario", amount: 2500000, start_month: "2026-05", end_month: "2026-03" }} onSubmit={onSubmit} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("El mes final no puede ser anterior al de inicio")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows server field errors localized, never the API's English text", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(422, "validation_failed", "invalid input", { name: "must be 1-80 characters", start_month: "is required" }),
    );
    renderWithProviders(<TemplateForm kind="income" initial={{ name: "Salario", amount: 2500000, start_month: "2026-05" }} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Valor inválido")).toBeInTheDocument();
    expect(screen.getByText("Requerido")).toBeInTheDocument();
    expect(screen.queryByText("must be 1-80 characters")).not.toBeInTheDocument();
  });

  it("submits a fixed payment with cents and months", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <TemplateForm kind="fixed" initial={{ category_id: 5, start_month: "2026-03" }} onSubmit={onSubmit} />,
    );
    await userEvent.type(screen.getByLabelText("Nombre"), "Renta");
    await userEvent.type(screen.getByLabelText("Monto"), "10,000");
    await userEvent.clear(screen.getByLabelText("Día del mes"));
    await userEvent.type(screen.getByLabelText("Día del mes"), "31");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Renta", amount: 1000000, day_of_month: 31, start_month: "2026-03", end_month: null,
        category_id: 5, payment_method_id: null, active: true,
      }),
    );
  });
});
