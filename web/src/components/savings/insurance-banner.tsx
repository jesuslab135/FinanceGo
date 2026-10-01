"use client";
import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatMoney } from "@/components/common/money";
import type { SavingsOverview } from "@/lib/api/types";

export function InsuranceBanner({ warnings }: { warnings: SavingsOverview["insurance_warnings"] }) {
  const t = useTranslations("savings");
  const fmt = useFormatMoney();
  return (
    <>
      {warnings.map((w) => (
        <div key={`${w.institution}-${w.kind}`} role="status"
          className="flex items-start gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--warning)_16%,var(--background))] p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{t("insuranceWarning", { total: fmt(w.total), institution: w.institution, fund: t(w.kind === "bank" ? "fundIPAB" : "fundPROSOFIPO"), limit: fmt(w.limit) })}</p>
        </div>
      ))}
    </>
  );
}
