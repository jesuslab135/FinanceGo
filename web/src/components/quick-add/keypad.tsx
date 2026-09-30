"use client";
import { Delete } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useFormatMoney } from "@/components/common/money";
import { duration } from "@/lib/motion";
import { keyFromKeyboard, pressKey, type KeypadKey } from "@/lib/keypad";

const KEY_CLASS =
  "flex min-h-14 min-w-11 items-center justify-center rounded-2xl bg-surface-raised font-display text-2xl transition-colors active:bg-muted";
const DIGITS: KeypadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"];

/** ATM-style amount entry. Also listens to the physical keyboard (digits, Backspace, Delete, Enter to submit). */
export function Keypad({ cents, onChange, onSubmit }: { cents: number; onChange: (cents: number) => void; onSubmit?: () => void }) {
  const t = useTranslations("quickAdd");
  const fmt = useFormatMoney();
  const reduce = useReducedMotion();
  const latest = useRef({ cents, onChange, onSubmit });
  useEffect(() => { latest.current = { cents, onChange, onSubmit }; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Enter") {
        // A focused button already activates itself on Enter.
        if (el?.tagName === "BUTTON" || el?.tagName === "A") return;
        e.preventDefault();
        latest.current.onSubmit?.();
        return;
      }
      const key = keyFromKeyboard(e.key);
      if (!key) return;
      e.preventDefault();
      latest.current.onChange(pressKey(latest.current.cents, key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const press = (k: KeypadKey) => onChange(pressKey(cents, k));
  return (
    <div className="space-y-4">
      <div className="flex min-h-16 items-center justify-center overflow-hidden" role="status" aria-live="polite" aria-label={t("amount")}>
        <m.span
          key={cents}
          className="num font-display text-5xl"
          initial={reduce ? false : { scale: 0.96 }}
          animate={{ scale: 1 }}
          transition={{ duration: duration.press }}
        >
          {fmt(cents)}
        </m.span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {DIGITS.map((k) => (
          <button key={k} type="button" className={KEY_CLASS} onClick={() => press(k)}>{k}</button>
        ))}
        <button type="button" className={KEY_CLASS} aria-label={t("backspace")} onClick={() => press("back")}>
          <Delete className="size-6" />
        </button>
      </div>
    </div>
  );
}
