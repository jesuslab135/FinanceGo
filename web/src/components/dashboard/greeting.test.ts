import { describe, expect, it } from "vitest";
import { greetingKey } from "./greeting";

describe("greetingKey", () => {
  it.each([[5, "morning"], [11, "morning"], [12, "afternoon"], [18, "afternoon"], [19, "evening"], [2, "evening"]])("%i → %s", (h, k) => {
    expect(greetingKey(h)).toBe(k);
  });
});
