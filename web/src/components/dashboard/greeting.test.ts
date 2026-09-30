import { describe, expect, it } from "vitest";
import { firstName, greetingKey, greetingMessageKey } from "./greeting";

describe("greetingKey", () => {
  it.each([[5, "morning"], [11, "morning"], [12, "afternoon"], [18, "afternoon"], [19, "evening"], [2, "evening"]])("%i → %s", (h, k) => {
    expect(greetingKey(h)).toBe(k);
  });
});

describe("greetingMessageKey", () => {
  it("uses the nameless variant when the name is empty", () => {
    expect(greetingMessageKey(8, "")).toBe("morningNoName");
    expect(greetingMessageKey(14, "")).toBe("afternoonNoName");
    expect(greetingMessageKey(22, "")).toBe("eveningNoName");
    expect(greetingMessageKey(8, "Ana")).toBe("morning");
  });
});

describe("firstName", () => {
  it.each([["Carlos Ruiz", "Carlos"], ["sara", "sara"], ["  Ana   Maria ", "Ana"], ["Jesus", "Jesus"], ["   ", ""], [undefined, ""]])("%j → %j", (name, want) => {
    expect(firstName(name)).toBe(want);
  });
});
