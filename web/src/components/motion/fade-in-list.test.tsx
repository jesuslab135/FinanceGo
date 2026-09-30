import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MotionProvider } from "./motion-provider";

const reduce = vi.hoisted(() => ({ value: true }));
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => reduce.value }));

import { FadeInItem, FadeInList } from "./fade-in-list";

const ui = (withRow: boolean) => (
  <MotionProvider>
    <FadeInList>{withRow ? <FadeInItem key="a">row</FadeInItem> : null}</FadeInList>
  </MotionProvider>
);

// Items added after mount are the ones that animate in (AnimatePresence initial={false}).
describe("FadeInList", () => {
  it("shows an added row in its final state immediately under reduced motion", () => {
    reduce.value = true;
    const { rerender } = render(ui(false));
    rerender(ui(true));
    const li = screen.getByText("row");
    expect(li.style.opacity === "" || li.style.opacity === "1").toBe(true);
  });

  it("starts an added row hidden when motion is allowed", () => {
    reduce.value = false;
    const { rerender } = render(ui(false));
    rerender(ui(true));
    expect(screen.getByText("row").style.opacity).toBe("0");
  });
});
