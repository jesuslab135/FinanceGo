import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUndoableDelete } from "./use-undoable-delete";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: Object.assign(toastMock, { error: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/lib/api/error-messages", () => ({ useErrorMessage: () => () => "err" }));

describe("useUndoableDelete", () => {
  beforeEach(() => { vi.useFakeTimers(); toastMock.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("hides immediately and deletes after the delay", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableDelete({ remove, delayMs: 5000 }));
    act(() => result.current.request(3, "Eliminado"));
    expect(result.current.hidden.has(3)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(remove).toHaveBeenCalledWith(3);
  });

  it("undo restores the row and never calls the API", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableDelete({ remove, delayMs: 5000 }));
    act(() => result.current.request(4, "Eliminado"));
    const undo = toastMock.mock.calls[0][1].action.onClick as () => void;
    act(() => undo());
    expect(result.current.hidden.has(4)).toBe(false);
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(remove).not.toHaveBeenCalled();
  });

  it("flushes pending deletes on unmount (navigating away)", () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useUndoableDelete({ remove, delayMs: 5000 }));
    act(() => result.current.request(9, "Eliminado"));
    unmount();
    expect(remove).toHaveBeenCalledWith(9);
  });

  it("restores the row if the delete fails", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useUndoableDelete({ remove, delayMs: 10 }));
    act(() => result.current.request(5, "Eliminado"));
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(result.current.hidden.has(5)).toBe(false);
  });
});
