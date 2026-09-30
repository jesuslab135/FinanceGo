import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { DeleteCardButton } from "./delete-card-button";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/query/hooks", () => ({ useDeletePaymentMethod: () => ({ mutate: mocks.mutate, isPending: false }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

type Callbacks = { onSuccess: () => void; onError: (e: Error) => void };

describe("DeleteCardButton", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  it("deletes after confirmation and reports back", async () => {
    mocks.mutate.mockImplementation((_id: number, cb: Callbacks) => cb.onSuccess());
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteCardButton id={7} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mocks.mutate).toHaveBeenCalledWith(7, expect.anything());
  });

  it("suggests deactivating a card that is in use", async () => {
    mocks.mutate.mockImplementation((_id: number, cb: Callbacks) =>
      cb.onError(new ApiError(409, "payment_method_in_use", "payment method is used by 3 records; deactivate it instead")),
    );
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteCardButton id={7} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Desactívalo")));
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
