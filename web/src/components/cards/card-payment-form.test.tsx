import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import es from "../../../messages/es.json";
import { CardPaymentForm } from "./card-payment-form";

const h = vi.hoisted(() => ({ mutateAsync: vi.fn(), celebrate: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/celebrate", () => ({ celebrate: h.celebrate }));
vi.mock("@/lib/query/hooks", () => ({ useCreateCardPayment: () => ({ mutateAsync: h.mutateAsync, isPending: false }), useMe: () => ({ data: { currency: "MXN" } }) }));
vi.mock("motion/react", async (o) => ({ ...(await o<typeof import("motion/react")>()), useReducedMotion: () => false }));

function setup(amountDue: number | null, defaultAmount = 50000) {
  const qc = new QueryClient();
  if (amountDue !== null) qc.setQueryData(["statement", 3, null], { amount_due: amountDue });
  render(
    <NextIntlClientProvider locale="es" messages={es} timeZone="America/Tijuana">
      <QueryClientProvider client={qc}>
        <CardPaymentForm cardId={3} cardName="BBVA" defaultAmount={defaultAmount} onDone={vi.fn()} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe("CardPaymentForm celebration", () => {
  beforeEach(() => { h.mutateAsync.mockReset().mockResolvedValue({}); h.celebrate.mockReset(); });

  it("celebrates when the refreshed statement owes nothing", async () => {
    setup(0);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.celebrate).toHaveBeenCalledWith("cardPaidOff", "¡BBVA al corriente! 🎉", { reduceMotion: false }));
  });

  it("stays quiet on a partial payment, or when nothing was due", async () => {
    setup(20000);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(h.celebrate).not.toHaveBeenCalled();
  });

  it("stays quiet when there was no amount due beforehand", async () => {
    setup(0, 0);
    await userEvent.type(screen.getByLabelText("Monto"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(h.celebrate).not.toHaveBeenCalled();
  });
});
