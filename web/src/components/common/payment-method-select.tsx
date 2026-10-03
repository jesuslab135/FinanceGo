"use client";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePaymentMethods } from "@/lib/query/hooks";

const NONE = "none";

export function PaymentMethodSelect({ value, onChange, id, creditOnly, allowNone = true, invalid }: {
  value: number | null | undefined; onChange: (v: number | null) => void; id?: string; creditOnly?: boolean; allowNone?: boolean; invalid?: boolean;
}) {
  const t = useTranslations("expenses");
  const { data = [] } = usePaymentMethods();
  const list = data.filter((p) => (p.active || p.id === value) && (!creditOnly || p.type === "credit"));
  return (
    <Select value={value ? String(value) : allowNone ? NONE : undefined} onValueChange={(v) => onChange(v === NONE ? null : Number(v))}>
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{t("noMethod")}</SelectItem>}
        {list.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            {p.nickname}{p.last4 ? ` ···· ${p.last4}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
