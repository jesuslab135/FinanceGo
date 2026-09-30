import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { CategoryForm } from "./category-form";

describe("CategoryForm", () => {
  it("requires a name", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<CategoryForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Requerido")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("locks the kind when editing and submits trimmed values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<CategoryForm initial={{ id: 3, name: "Comida", kind: "expense", color: "#f97316", icon: "utensils" }} onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Tipo")).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Nombre"));
    await userEvent.type(screen.getByLabelText("Nombre"), "  Súper ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: "Súper", kind: "expense", color: "#f97316", icon: "utensils" }));
  });
  it("submits the chosen icon", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<CategoryForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText("Nombre"), "Café");
    await userEvent.click(screen.getByRole("radio", { name: "Café" }));
    expect(screen.getByRole("radio", { name: "Café" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Café", icon: "coffee" })));
  });
  it("defaults a new category to the tag icon", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<CategoryForm onSubmit={onSubmit} />);
    expect(screen.getByRole("radiogroup", { name: "Ícono" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Otros" })).toBeChecked();
    await userEvent.type(screen.getByLabelText("Nombre"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ icon: "tag" })));
  });
});
