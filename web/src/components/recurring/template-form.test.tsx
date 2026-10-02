import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { parseISODate } from "@/lib/dates";
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
    renderWithProviders(<TemplateForm kind="fixed" initial={{ category_id: 5 }} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Nombre"), "Renta");
    await userEvent.type(screen.getByLabelText("Monto"), "25000");
    await userEvent.clear(screen.getByLabelText("Día del mes"));
    await userEvent.type(screen.getByLabelText("Día del mes"), "32");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Día entre 1 y 31")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits an income paid every two weeks from a pay date", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<TemplateForm kind="income" initial={{ name: "Salario", amount: 800000, start_month: "2026-05" }} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Cada 2 semanas" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Elige una fecha de pago en el calendario")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    const friday = screen.getAllByRole("button", { name: /^viernes \d/ })[0];
    await userEvent.click(friday);
    expect(friday).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^viernes \d/, pressed: true }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Próximos pagos:/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 800000, frequency: "biweekly", second_day: null })),
    );
    expect(parseISODate(onSubmit.mock.calls[0][0].anchor_date).getDay()).toBe(5);
  });

  it("opens an existing schedule as it was saved", () => {
    renderWithProviders(
      <TemplateForm kind="income" initial={{ name: "Salario", amount: 800000, start_month: "2026-05", frequency: "semimonthly", day_of_month: 10, second_day: 25 }} onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Dos veces al mes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toEqual(["Dos veces al mes", "10", "25"]);
  });

  it("lets a monthly income fall on any day of the month", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<TemplateForm kind="income" initial={{ name: "Salario", amount: 800000, start_month: "2026-05" }} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "23" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ frequency: "monthly", day_of_month: 23, second_day: null, anchor_date: null })));
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
