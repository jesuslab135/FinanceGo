import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("hides what is typed until asked to show it, and hides it again", async () => {
    renderWithProviders(<PasswordInput aria-label="Contraseña" />);
    const input = screen.getByLabelText("Contraseña");
    await userEvent.type(input, "secreto123");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("secreto123");
    await userEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("the toggle never submits the form", async () => {
    let submitted = false;
    renderWithProviders(<form onSubmit={(e) => { e.preventDefault(); submitted = true; }}><PasswordInput aria-label="Contraseña" /></form>);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(submitted).toBe(false);
  });
});
