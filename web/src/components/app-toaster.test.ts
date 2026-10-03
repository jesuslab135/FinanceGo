import { describe, expect, it } from "vitest";
import { MOBILE_TOAST_OFFSET, toastPlacement } from "./app-toaster";

describe("toastPlacement", () => {
  it("puts toasts at the bottom on phones, above the bottom nav", () => {
    expect(toastPlacement(false)).toEqual({
      position: "bottom-center",
      offset: { bottom: MOBILE_TOAST_OFFSET },
      mobileOffset: { bottom: MOBILE_TOAST_OFFSET },
    });
  });
  it("puts toasts top-right on desktop", () => {
    expect(toastPlacement(true)).toEqual({ position: "top-right" });
  });
});
