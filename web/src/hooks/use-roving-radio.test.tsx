import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useRovingRadio } from "./use-roving-radio";

function Group({ selectOnMove, columns, onPick }: { selectOnMove?: boolean; columns?: number; onPick?: (v: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  const values = ["a", "b", "c", "d", "e"];
  const { groupRef, itemProps } = useRovingRadio({
    values, value, selectOnMove, columns: columns ? () => columns : undefined,
    onChange: (v) => { setValue(v); onPick?.(v); },
  });
  return (
    <div ref={groupRef} role="radiogroup" aria-label="g">
      {values.map((v, i) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => setValue(v)} {...itemProps(i)}>{v}</button>
      ))}
    </div>
  );
}

const tabbable = () => screen.getAllByRole("radio").filter((r) => r.tabIndex === 0).map((r) => r.textContent);

describe("useRovingRadio", () => {
  it("has exactly one tab stop, the first radio when nothing is selected", () => {
    render(<Group />);
    expect(tabbable()).toEqual(["a"]);
  });

  it("arrows move focus and select, wrapping in a single row; Home/End jump", () => {
    render(<Group />);
    const [a] = screen.getAllByRole("radio");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "e" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "e" })).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(screen.getByRole("radio", { name: "a" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("radio", { name: "e" })).toHaveFocus();
    expect(tabbable()).toEqual(["e"]);
  });

  it("moves by rows in a grid and stops at the edges", () => {
    render(<Group columns={2} />);
    const [a] = screen.getAllByRole("radio");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: "c" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(screen.getByRole("radio", { name: "a" })).toHaveFocus();
  });

  it("with selectOnMove off, arrows only move focus (and the tab stop), never select", () => {
    const onPick = vi.fn();
    render(<Group selectOnMove={false} onPick={onPick} />);
    const [a] = screen.getAllByRole("radio");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "b" })).toHaveFocus();
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "b" })).toHaveAttribute("aria-checked", "false");
    expect(tabbable()).toEqual(["b"]);
  });
});
