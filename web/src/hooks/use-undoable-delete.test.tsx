import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUndoableDelete } from "./use-undoable-delete";

const toastMock = vi.hoisted(() => Object.assign(vi.fn<(label: string, opts: { action: { onClick: () => void } }) => string>(() => "tid"), { error: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/lib/api/error-messages", () => ({ useErrorMessage: () => () => "err" }));

describe("useUndoableDelete", () => {
  beforeEach(() => { vi.useFakeTimers(); toastMock.mockClear(); toastMock.error.mockClear(); toastMock.dismiss.mockClear(); });
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
  it("two concurrent pending deletes both reach remove", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableDelete({ remove, delayMs: 5000 }));
    act(() => { result.current.request(1, "a"); result.current.request(2, "b"); });
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith(1);
    expect(remove).toHaveBeenCalledWith(2);
  });

  it("a double request for the same id sends a single DELETE", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableDelete({ remove, delayMs: 5000 }));
    act(() => { result.current.request(7, "a"); result.current.request(7, "a"); });
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("a flush failure on unmount shows an error toast", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("boom"));
    const { result, unmount } = renderHook(() => useUndoableDelete({ remove, delayMs: 5000 }));
    act(() => result.current.request(8, "x"));
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(toastMock.error).toHaveBeenCalledWith("err");
  });

  it("dismisses the undo toast on commit and on flush", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useUndoableDelete({ remove, delayMs: 5000 }));
    act(() => result.current.request(1, "a"));
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(toastMock.dismiss).toHaveBeenCalledWith("tid");
    toastMock.dismiss.mockClear();
    act(() => result.current.request(2, "b"));
    unmount();
    expect(toastMock.dismiss).toHaveBeenCalledWith("tid");
  });
});
