import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ResponsiveDialog } from "./responsive-dialog";

const media = vi.hoisted(() => ({ desktop: true }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => media.desktop }));

describe("ResponsiveDialog", () => {
  afterEach(() => vi.restoreAllMocks());

  for (const desktop of [true, false]) {
    it(`has a description and an accessible title (${desktop ? "dialog" : "drawer"})`, () => {
      media.desktop = desktop;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      renderWithProviders(<ResponsiveDialog open onOpenChange={() => {}} title="Nuevo gasto"><p>body</p></ResponsiveDialog>);
      const dialog = screen.getByRole("dialog", { name: "Nuevo gasto" });
      expect(dialog).toHaveAccessibleDescription("Presiona Escape para cerrar.");
      expect(screen.getByText("body")).toBeInTheDocument();
      expect(warn.mock.calls.flat().join(" ")).not.toMatch(/Description/);
    });
  }

  it("desktop dialog keeps a translated close button and no grab handle", () => {
    media.desktop = true;
    renderWithProviders(<ResponsiveDialog open onOpenChange={() => {}} title="Nuevo gasto"><p>body</p></ResponsiveDialog>);
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
    expect(screen.queryByTestId("drawer-handle")).not.toBeInTheDocument();
  });

  it("mobile drawer renders a grab handle", () => {
    media.desktop = false;
    renderWithProviders(<ResponsiveDialog open onOpenChange={() => {}} title="Nuevo gasto"><p>body</p></ResponsiveDialog>);
    const handle = screen.getByTestId("drawer-handle");
    expect(handle).toHaveAttribute("data-slot", "drawer-handle");
  });

  it("size=full still renders a drawer", () => {
    media.desktop = false;
    renderWithProviders(<ResponsiveDialog open onOpenChange={() => {}} title="Nuevo gasto" size="full"><p>body</p></ResponsiveDialog>);
    expect(screen.getByRole("dialog", { name: "Nuevo gasto" })).toBeInTheDocument();
    expect(screen.getByTestId("drawer-handle")).toBeInTheDocument();
  });
});
