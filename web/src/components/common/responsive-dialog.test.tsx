import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ResponsiveDialog } from "./responsive-dialog";

const media = vi.hoisted(() => ({ desktop: true }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => media.desktop }));

describe("ResponsiveDialog", () => {
  afterEach(() => vi.restoreAllMocks());

  for (const desktop of [true, false]) {
    it(`has a description and a translated close button (${desktop ? "dialog" : "sheet"})`, () => {
      media.desktop = desktop;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      renderWithProviders(<ResponsiveDialog open onOpenChange={() => {}} title="Nuevo gasto"><p>body</p></ResponsiveDialog>);
      const dialog = screen.getByRole("dialog", { name: "Nuevo gasto" });
      expect(dialog).toHaveAccessibleDescription("Presiona Escape para cerrar.");
      expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
      expect(warn.mock.calls.flat().join(" ")).not.toMatch(/Description/);
    });
  }
});
