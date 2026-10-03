import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { DeleteCardButton } from "./delete-card-button";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/query/hooks", () => ({ useDeletePaymentMethod: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

describe("DeleteCardButton", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  it("deletes after confirmation and reports back", async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteCardButton id={7} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mocks.mutateAsync).toHaveBeenCalledWith(7);
  });

  it("suggests deactivating a card that is in use", async () => {
    mocks.mutateAsync.mockRejectedValue(new ApiError(409, "payment_method_in_use", "payment method is used by 3 records; deactivate it instead"));
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteCardButton id={7} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("Desactívalo")));
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
