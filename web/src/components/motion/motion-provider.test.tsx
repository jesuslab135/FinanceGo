import { render, screen, waitFor } from "@testing-library/react";
import { m } from "motion/react";
import { describe, expect, it } from "vitest";
import { MotionProvider } from "./motion-provider";

describe("MotionProvider", () => {
  it("renders m.* statically, then animates once the lazily loaded features arrive", async () => {
    render(
      <MotionProvider>
        <m.div data-testid="box" initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ duration: 0 }}>hi</m.div>
      </MotionProvider>,
    );
    // Content is in the DOM immediately (static render with the initial style), not blocked on the feature chunk.
    expect(screen.getByTestId("box")).toHaveTextContent("hi");
    await waitFor(() => expect(screen.getByTestId("box").style.opacity).toBe("0.5"));
  });
});
