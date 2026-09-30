"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage } from "@/lib/api/error-messages";

/** Optimistic delete with an undo window; the API call happens when the window closes or on unmount. */
export function useUndoableDelete({ remove, delayMs = 5000 }: { remove: (id: number) => Promise<unknown>; delayMs?: number }) {
  const t = useTranslations("common");
  const errMsg = useErrorMessage();
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const removeRef = useRef(remove);
  useLayoutEffect(() => { removeRef.current = remove; });

  const unhide = useCallback((id: number) => setHidden((h) => { const n = new Set(h); n.delete(id); return n; }), []);

  const commit = useCallback(async (id: number) => {
    timers.current.delete(id);
    try {
      await removeRef.current(id);
    } catch (e) {
      unhide(id);
      toast.error(errMsg(e));
    }
  }, [errMsg, unhide]);

  const request = useCallback((id: number, label: string) => {
    setHidden((h) => new Set(h).add(id));
    timers.current.set(id, setTimeout(() => void commit(id), delayMs));
    toast(label, {
      duration: delayMs,
      action: {
        label: t("undo"),
        onClick: () => {
          const tm = timers.current.get(id);
          if (tm) clearTimeout(tm);
          timers.current.delete(id);
          unhide(id);
        },
      },
    });
  }, [commit, delayMs, t, unhide]);

  useEffect(() => {
    const pending = timers.current;
    const flush = () => {
      for (const [id, tm] of pending) {
        clearTimeout(tm);
        void removeRef.current(id);
      }
      pending.clear();
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, []);

  return { hidden, request };
}
