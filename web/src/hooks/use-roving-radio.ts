"use client";
import { useRef, useState, type KeyboardEvent } from "react";

/**
 * Roving tabindex for a `role="radiogroup"`: one tab stop, arrow keys move between the radios, Home/End jump
 * to the ends. A one-row group wraps around; a grid (`columns` > 1) moves by rows on Up/Down and stops at the edges.
 * `selectOnMove` (the ARIA radio default) checks the radio the arrows land on. Turn it off for a group whose selection
 * does something bigger, such as advancing to the next step: arrows then only move focus, and Enter/Space selects.
 */
export function useRovingRadio<V>({ values, value, onChange, columns, selectOnMove = true }: {
  values: readonly V[];
  value: V | null | undefined;
  onChange: (v: V) => void;
  /** Columns in a grid, read at key time (the group element is passed in, e.g. for computed styles). */
  columns?: (group: HTMLDivElement | null) => number;
  selectOnMove?: boolean;
}) {
  const group = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const selected = values.findIndex((v) => Object.is(v, value));
  const fallback = selected >= 0 ? selected : 0;
  const tabbable = !selectOnMove && focused !== null && focused < values.length ? focused : fallback;

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const last = values.length - 1;
    const cols = columns?.(group.current) ?? 1;
    const grid = cols > 1;
    const step = (d: number) => (grid ? Math.min(last, Math.max(0, i + d)) : (i + d + values.length) % values.length);
    let next: number;
    switch (e.key) {
      case "ArrowRight": next = step(1); break;
      case "ArrowLeft": next = step(-1); break;
      case "ArrowDown": next = step(grid ? cols : 1); break;
      case "ArrowUp": next = step(grid ? -cols : -1); break;
      case "Home": next = 0; break;
      case "End": next = last; break;
      default: return;
    }
    e.preventDefault();
    setFocused(next);
    if (selectOnMove) onChange(values[next]);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  const itemProps = (i: number) => ({
    tabIndex: i === tabbable ? 0 : -1,
    onKeyDown: (e: KeyboardEvent) => onKeyDown(e, i),
    onFocus: () => setFocused(i),
  });

  return { groupRef: group, itemProps };
}
