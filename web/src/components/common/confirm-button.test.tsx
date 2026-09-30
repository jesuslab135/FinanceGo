import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ConfirmButton } from "./confirm-button";

describe("ConfirmButton", () => {
  it("describes a delete by default", async () => {
    renderWithProviders(<ConfirmButton onConfirm={vi.fn()}><button>x</button></ConfirmButton>);
    await userEvent.click(screen.getByRole("button", { name: "x" }));
    expect(await screen.findByText("Esta acción no se puede deshacer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("uses custom action, cancel and description text", async () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmButton onConfirm={onConfirm} actionLabel="Cancelar plan" cancelLabel="Conservar plan" description="Dejan de cobrarse">
        <button>x</button>
      </ConfirmButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "x" }));
    expect(await screen.findByText("Dejan de cobrarse")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conservar plan" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar plan" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
