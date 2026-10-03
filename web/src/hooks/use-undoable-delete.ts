"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage } from "@/lib/api/error-messages";

type Pending = { timer: ReturnType<typeof setTimeout>; toastId: string | number };

/** Optimistic delete with an undo window; the API call happens when the window closes or on unmount. */
export function useUndoableDelete({ remove, delayMs = 5000 }: { remove: (id: number) => Promise<unknown>; delayMs?: number }) {
  const t = useTranslations("common");
  const errMsg = useErrorMessage();
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const pending = useRef(new Map<number, Pending>());
  const removeRef = useRef(remove);
  const errMsgRef = useRef(errMsg);
  useLayoutEffect(() => { removeRef.current = remove; errMsgRef.current = errMsg; });

  const unhide = useCallback((id: number) => setHidden((h) => { const n = new Set(h); n.delete(id); return n; }), []);

  /** Runs the API delete; on failure the row comes back (unless unmounted) and a global toast explains. */
  const run = useCallback((id: number, restore: boolean) => {
    void new Promise((resolve) => resolve(removeRef.current(id)))
      .catch((e: unknown) => {
        if (restore) unhide(id);
        toast.error(errMsgRef.current(e));
      });
  }, [unhide]);

  const cancel = useCallback((id: number) => {
    const p = pending.current.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    toast.dismiss(p.toastId);
    pending.current.delete(id);
  }, []);

  const request = useCallback((id: number, label: string) => {
    cancel(id); // a repeated request must not schedule a second DELETE
    setHidden((h) => new Set(h).add(id));
    const timer = setTimeout(() => {
      cancel(id);
      run(id, true);
    }, delayMs);
    const toastId = toast(label, {
      duration: delayMs,
      action: {
        label: t("undo"),
        onClick: () => { cancel(id); unhide(id); },
      },
    });
    pending.current.set(id, { timer, toastId });
  }, [cancel, delayMs, run, t, unhide]);

  useEffect(() => {
    const map = pending.current;
    const flush = () => {
      for (const id of [...map.keys()]) {
        cancel(id);
        run(id, false);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [cancel, run]);

  return { hidden, request };
}
