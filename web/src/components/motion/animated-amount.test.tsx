import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { AnimatedAmount } from "./animated-amount";

vi.mock("@/lib/query/hooks", () => ({ useMe: () => ({ data: { currency: "MXN" } }) }));
vi.mock("motion/react", async (orig) => {
  const mod = await orig<typeof import("motion/react")>();
  return { ...mod, useReducedMotion: () => true };
});

describe("AnimatedAmount", () => {
  it("exposes the final value to assistive tech", () => {
    renderWithProviders(<AnimatedAmount cents={1248050} />);
    expect(screen.getByLabelText("$12,480.50")).toBeInTheDocument();
  });

  it("with reduced motion shows the new value immediately on change", () => {
    const { rerender } = renderWithProviders(<AnimatedAmount cents={100} />);
    rerender(<AnimatedAmount cents={250000} />);
    const el = screen.getByLabelText("$2,500.00");
    expect(el.textContent).toContain("2,500.00");
  });
});
