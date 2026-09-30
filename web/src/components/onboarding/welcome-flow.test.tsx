import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toMonthKey } from "@/lib/dates";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { WelcomeFlow } from "./welcome-flow";

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  celebrate: vi.fn(),
  createIncome: vi.fn(),
  updateIncome: vi.fn(),
  createFixed: vi.fn(),
  createCard: vi.fn(),
  writeJSON: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: h.replace }), usePathname: () => "/welcome" }));
vi.mock("@/lib/celebrate", () => ({ celebrate: h.celebrate }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: 7 } }) }));
vi.mock("@/lib/storage", async (orig) => ({ ...(await orig<typeof import("@/lib/storage")>()), writeJSON: h.writeJSON }));
vi.mock("@/lib/query/hooks", () => ({
  useMe: () => ({ data: { currency: "MXN" } }),
  useCategories: () => ({
    isPending: false,
    data: [
      { id: 1, name: "Comida", kind: "expense", color: "#d9602f", icon: "utensils" },
      { id: 2, name: "Vivienda", kind: "expense", color: "#8b5cf6", icon: "home" },
      { id: 9, name: "Salario", kind: "income", color: "#22c55e", icon: "briefcase" },
    ],
  }),
  useCreateIncomeSource: () => ({ mutateAsync: h.createIncome }),
  useUpdateIncomeSource: () => ({ mutateAsync: h.updateIncome }),
  useCreateFixedPayment: () => ({ mutateAsync: h.createFixed }),
  useUpdateFixedPayment: () => ({ mutateAsync: vi.fn() }),
  useDeactivateFixedPayment: () => ({ mutateAsync: vi.fn() }),
  useCreatePaymentMethod: () => ({ mutateAsync: h.createCard }),
}));

describe("WelcomeFlow", () => {
  beforeEach(() => {
    Object.values(h).forEach((f) => f.mockReset());
    h.createIncome.mockResolvedValue({ id: 100 });
    h.createFixed.mockResolvedValue({ id: 200 });
    h.createCard.mockResolvedValue({ id: 300 });
  });

  it("walks income, fixed payment and finish, saving integer cents", async () => {
    renderWithProviders(<WelcomeFlow />);
    expect(screen.getByRole("img", { name: "Paso 1 de 3" })).toBeInTheDocument();
    await userEvent.keyboard("2500000");
    expect(screen.getByRole("status")).toHaveTextContent("$25,000.00");
    await userEvent.click(screen.getByRole("button", { name: "15" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() =>
      expect(h.createIncome).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Salario", amount: 2500000, day_of_month: 15, start_month: toMonthKey(new Date()), category_id: 9, active: true, end_month: null }),
      ),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Renta" }));
    await userEvent.type(screen.getByLabelText("Renta: Monto"), "10,000");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() =>
      expect(h.createFixed).toHaveBeenCalledWith(expect.objectContaining({ name: "Renta", amount: 1000000, day_of_month: 1, category_id: 2, payment_method_id: null })),
    );

    expect(await screen.findByRole("heading", { name: "Tus tarjetas (opcional)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Terminar" }));
    expect(h.replace).toHaveBeenCalledWith("/dashboard");
    expect(h.celebrate).toHaveBeenCalledWith("welcome", expect.any(String));
  });

  it("does not create a second income when coming back to step 1", async () => {
    h.updateIncome.mockResolvedValue({ id: 100 });
    renderWithProviders(<WelcomeFlow />);
    await userEvent.keyboard("100");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByRole("heading", { name: "Tus pagos fijos" });
    await userEvent.click(screen.getByRole("button", { name: "Atrás" }));
    await screen.findByRole("heading", { name: "¿Cuánto ganas al mes?" });
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(h.updateIncome).toHaveBeenCalledWith(expect.objectContaining({ id: 100, amount: 100 })));
    expect(h.createIncome).toHaveBeenCalledTimes(1);
  });

  it("requires an amount before continuing", async () => {
    renderWithProviders(<WelcomeFlow />);
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/monto válido/)).toBeInTheDocument();
    expect(h.createIncome).not.toHaveBeenCalled();
  });

  it("puts a server field error under its fixed-payment row and keeps the user there", async () => {
    h.createFixed.mockRejectedValue(new ApiError(400, "validation_failed", "bad", { amount: "must be between 1 and 999999999999 cents" }));
    renderWithProviders(<WelcomeFlow />);
    await userEvent.keyboard("100");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Luz" }));
    await userEvent.type(screen.getByLabelText("Luz: Monto"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/monto válido/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tus pagos fijos" })).toBeInTheDocument();
  });

  it("adds a card, listing it as a tile", async () => {
    renderWithProviders(<WelcomeFlow />);
    await userEvent.keyboard("100");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByRole("heading", { name: "Tus pagos fijos" });
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.type(await screen.findByLabelText("Alias"), "BBVA");
    await userEvent.type(screen.getByLabelText("Últimos 4 dígitos"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(h.createCard).toHaveBeenCalledWith(expect.objectContaining({ nickname: "BBVA", type: "credit", last4: "1234", statement_day: 1, payment_due_day: 20 })));
    expect(await screen.findByText("···· 1234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar otra" })).toBeInTheDocument();
  });

  it("Saltar on step 1 writes the skip flag and leaves for the dashboard", async () => {
    renderWithProviders(<WelcomeFlow />);
    await userEvent.click(screen.getByRole("button", { name: "Saltar" }));
    expect(h.writeJSON).toHaveBeenCalledWith("fin:onboarding-skipped:7", true);
    expect(h.replace).toHaveBeenCalledWith("/dashboard");
    expect(h.createIncome).not.toHaveBeenCalled();
  });
});
