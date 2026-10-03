import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { Category, PaymentMethod } from "@/lib/api/types";
import { CardChips } from "./card-chips";
import { CategoryGrid } from "./category-grid";

const cats = [
  { id: 1, name: "Comida", kind: "expense", color: "#d9602f", icon: "utensils" },
  { id: 2, name: "Transporte", kind: "expense", color: "#0a8a74", icon: "car" },
  { id: 3, name: "Hogar", kind: "expense", color: "#8a7766", icon: "home" },
  { id: 4, name: "Salud", kind: "expense", color: "#6b5a4c", icon: "heart-pulse" },
  { id: 5, name: "Ocio", kind: "expense", color: "#4a3a2e", icon: "tag" },
] as Category[];
const methods = [
  { id: 7, nickname: "BBVA", type: "credit", last4: "1234", active: true },
  { id: 8, nickname: "Nu", type: "debit", active: true },
] as PaymentMethod[];

describe("CategoryGrid keyboard", () => {
  it("is one tab stop; arrows move focus by cell and row without selecting; Enter selects", () => {
    const onSelect = vi.fn();
    renderWithProviders(<CategoryGrid categories={cats} recent={[]} value={null} onSelect={onSelect} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "ArrowDown" });
    expect(radios[4]).toHaveFocus(); // 4 columns: one row down
    fireEvent.keyDown(radios[4], { key: "ArrowLeft" });
    expect(radios[3]).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(radios[3]); // Enter/Space on a <button> dispatches click
    expect(onSelect).toHaveBeenCalledWith(radios.indexOf(radios[3]) + 1);
  });

  it("marks the selected category with a fill, not the focus-ring color", () => {
    renderWithProviders(<CategoryGrid categories={cats} recent={[]} value={2} onSelect={vi.fn()} />);
    const sel = screen.getByRole("radio", { name: /Transporte/ });
    expect(sel).toHaveAttribute("aria-checked", "true");
    expect(sel).toHaveClass("bg-primary/12");
    expect(sel.className).not.toMatch(/ring-/);
    expect(sel.tabIndex).toBe(0);
  });
});

describe("CardChips keyboard", () => {
  it("is one tab stop on the selected chip; arrows select the next chip and wrap", () => {
    const onChange = vi.fn();
    renderWithProviders(<CardChips methods={methods} value={8} onChange={onChange} />);
    const nu = screen.getByRole("radio", { name: "Nu" });
    expect(screen.getAllByRole("radio").filter((r) => r.tabIndex === 0)).toEqual([nu]);
    nu.focus();
    fireEvent.keyDown(nu, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(null); // wraps to "Sin método"
    expect(screen.getAllByRole("radio")[0]).toHaveFocus();
    fireEvent.keyDown(screen.getAllByRole("radio")[0], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(7);
  });
});
