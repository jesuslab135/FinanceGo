import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeterFill } from "./meter";

vi.mock("motion/react", async (o) => ({ ...(await o<typeof import("motion/react")>()), useReducedMotion: () => true }));

describe("MeterFill", () => {
  it("renders the final width immediately under reduced motion", () => {
    const { container } = render(<MeterFill pct={40} className="bg-chart-1" />);
    expect((container.firstChild as HTMLElement).style.width).toBe("40%");
  });
});
