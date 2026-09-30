"use client";

import { Plus } from "lucide-react";
import { m, useAnimationControls, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { QuickAddFlow } from "@/components/quick-add/quick-add-flow";
import { Button } from "@/components/ui/button";
import type { ExpenseInput } from "@/lib/api/types";
import { duration } from "@/lib/motion";

/** `variant="none"` renders no trigger; drive it with `open` / `onOpenChange` (used by "Repetir"). */
export function QuickAdd({ variant, prefill, open, onOpenChange }: {
  variant: "fab" | "button" | "none";
  prefill?: Partial<ExpenseInput>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations();
  const reduce = useReducedMotion();
  const pulse = useAnimationControls();
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = (o: boolean) => { setInner(o); onOpenChange?.(o); };
  return (
    <>
      {variant === "fab" && (
        <Button asChild size="icon" className="-mt-6 size-14 rounded-full shadow-lg">
          <m.button type="button" aria-label={t("nav.quickAdd")} animate={pulse} onClick={() => setOpen(true)}>
            <Plus className="size-6" />
          </m.button>
        </Button>
      )}
      {variant === "button" && <Button className="w-full" onClick={() => setOpen(true)}><Plus /> {t("nav.quickAdd")}</Button>}
      <ResponsiveDialog open={isOpen} onOpenChange={setOpen} title={t("expenses.new")}>
        <QuickAddFlow
          prefill={prefill}
          onDone={() => {
            setOpen(false);
            if (!reduce) void pulse.start({ scale: [1, 1.12, 1], transition: { duration: duration.small } });
          }}
        />
      </ResponsiveDialog>
    </>
  );
}
