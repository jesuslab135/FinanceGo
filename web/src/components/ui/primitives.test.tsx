import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { Input } from "./input";
import { Select, SelectTrigger, SelectValue } from "./select";
import { Tabs, TabsList, TabsTrigger } from "./tabs";

// jsdom cannot evaluate `(pointer: coarse)` or :focus-visible, so these pin the utility classes that
// implement the spec: a 2px --focus outline at offset 2, and a 44px floor on touch screens.
const FOCUS = ["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-(--focus)"];
const expectSpecFocus = (el: HTMLElement) => {
  for (const c of FOCUS) expect(el).toHaveClass(c);
  expect(el.className).not.toMatch(/(^|\s)outline-none(\s|$)/);
  expect(el.className).not.toMatch(/focus-visible:ring-/);
};

describe("shared primitives", () => {
  it.each(["default", "sm", "lg"] as const)("Button size %s has a 44px touch floor, the spec focus outline and a 10px radius", (size) => {
    render(<Button size={size}>Go</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveClass("pointer-coarse:min-h-11");
    // rounded-md is --radius-md (10px); sm keeps shadcn's min(--radius-md, 12px), also 10px.
    expect(b.className).toMatch(/(^|\s)rounded-(md|\[min\(var\(--radius-md\),12px\)\])(\s|$)/);
    expect(b.className).not.toMatch(/translate-y-px/);
    expectSpecFocus(b);
  });

  it.each(["icon", "icon-sm", "icon-lg"] as const)("Button size %s is at least 44x44 on touch", (size) => {
    render(<Button size={size} aria-label="x" />);
    const b = screen.getByRole("button");
    expect(b).toHaveClass("pointer-coarse:min-h-11", "pointer-coarse:min-w-11");
  });

  it("a caller's larger size is not shrunk on touch (floor, not a fixed height)", () => {
    render(<Button className="size-14">+</Button>);
    const b = screen.getByRole("button");
    expect(b).toHaveClass("size-14");
    expect(b.className).not.toMatch(/pointer-coarse:(h|size)-/);
  });

  it("Input has the touch floor, spec focus outline and 10px radius", () => {
    render(<Input aria-label="n" />);
    const i = screen.getByRole("textbox");
    expect(i).toHaveClass("pointer-coarse:min-h-11", "rounded-md");
    expectSpecFocus(i);
  });

  it("SelectTrigger has the touch floor, spec focus outline and 10px radius", () => {
    render(<Select><SelectTrigger aria-label="s"><SelectValue /></SelectTrigger></Select>);
    const t = screen.getByRole("combobox");
    expect(t).toHaveClass("pointer-coarse:min-h-11", "rounded-md");
    expectSpecFocus(t);
  });

  it("TabsTrigger has the spec focus outline", () => {
    render(<Tabs defaultValue="a"><TabsList><TabsTrigger value="a">A</TabsTrigger></TabsList></Tabs>);
    expectSpecFocus(screen.getByRole("tab"));
  });
});
