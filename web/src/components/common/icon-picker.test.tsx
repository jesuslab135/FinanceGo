import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { IconPicker } from "./icon-picker";

function Harness({ start = "utensils" }: { start?: string }) {
  const [v, setV] = useState(start);
  return <IconPicker value={v} onChange={setV} color="#f97316" />;
}

describe("IconPicker", () => {
  it("uses a roving tabindex on the selected item", () => {
    renderWithProviders(<Harness />);
    const radios = screen.getAllByRole("radio");
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Comida" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Comida" })).toBeChecked();
  });

  it("moves selection and focus with arrow keys, Home and End", async () => {
    renderWithProviders(<Harness />);
    screen.getByRole("radio", { name: "Comida" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    const coffee = screen.getByRole("radio", { name: "Café" });
    expect(coffee).toBeChecked();
    expect(coffee).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Comida" })).toBeChecked();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "Otros" })).toBeChecked();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "Comida" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Comida" })).not.toBeChecked();
    expect(screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });
});
