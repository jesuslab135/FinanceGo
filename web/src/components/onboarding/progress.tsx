"use client";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Three dots, the current one elongated. The group carries the text alternative ("Paso 2 de 3"). */
export function Progress({ step, total = 3 }: { step: number; total?: number }) {
  const t = useTranslations("welcome");
  return (
    <div role="img" aria-label={t("progress", { n: step })} className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("h-2 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none", i + 1 === step ? "w-6 bg-brand" : i + 1 < step ? "w-2 bg-brand/60" : "w-2 bg-muted")}
        />
      ))}
    </div>
  );
}

/** Back (hidden on the first step) on the left, the primary action on the right; every target is at least 44px. */
export function StepActions({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  const t = useTranslations("welcome");
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {onBack ? <Button type="button" variant="ghost" className="min-h-11 px-4" onClick={onBack}>{t("back")}</Button> : <span />}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
