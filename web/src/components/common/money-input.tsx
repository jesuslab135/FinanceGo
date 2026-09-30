"use client";
import { forwardRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/query/hooks";

/** Free-text amount field; the form converts with parseMoney on submit. */
export const MoneyInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input>>(function MoneyInput(props, ref) {
  const currency = useMe().data?.currency ?? "MXN";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">{currency}</span>
      <Input ref={ref} inputMode="decimal" autoComplete="off" className="pl-12 tabular-nums" {...props} />
    </div>
  );
});
