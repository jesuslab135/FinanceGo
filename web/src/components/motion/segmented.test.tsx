import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Segmented } from "./segmented";

const options = [{ value: "day", label: "Día" }, { value: "week", label: "Semana" }, { value: "month", label: "Mes" }];

describe("Segmented", () => {
  it("is a radiogroup with the current value checked and arrow-key navigation", async () => {
    const onChange = vi.fn();
    renderWithProviders(<Segmented ariaLabel="Periodo" value="week" options={options} onChange={onChange} />);
    expect(screen.getByRole("radiogroup", { name: "Periodo" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Semana" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Mes" }));
    expect(onChange).toHaveBeenCalledWith("month");
    screen.getByRole("radio", { name: "Semana" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("day");
  });
});

describe("Segmented Home/End", () => {
  it("selects first and last option", async () => {
    const onChange = vi.fn();
    renderWithProviders(<Segmented ariaLabel="Periodo" value="week" options={options} onChange={onChange} />);
    screen.getByRole("radio", { name: "Semana" }).focus();
    await userEvent.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("month");
    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("day");
  });
});
