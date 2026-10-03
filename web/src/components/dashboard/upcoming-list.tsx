"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { AlertTriangle, CreditCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { QueryError } from "@/components/common/query-error";
import { LoadingRows } from "@/components/common/skeletons";
import { Segmented } from "@/components/motion/segmented";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseISODate } from "@/lib/dates";
import { useUpcoming, useUpdateEntry } from "@/lib/query/hooks";
import { useErrorMessage } from "@/lib/api/error-messages";

export function UpcomingList() {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const locale = useLocale();
  const [days, setDays] = useState<7 | 30>(7);
  const { data, error, isPending } = useUpcoming(days);
  const update = useUpdateEntry();
  const day = (s: string) => format(parseISODate(s), "EEE d MMM", { locale: locale === "en" ? enUS : es });

  return (
    <section className="h-full space-y-3 rounded-2xl bg-card p-4 shadow-card md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold">{t("dashboard.upcoming")}</h2>
        <Segmented
          ariaLabel={t("dashboard.upcoming")}
          value={String(days) as "7" | "30"}
          onChange={(v) => setDays(v === "7" ? 7 : 30)}
          options={[{ value: "7", label: t("dashboard.next7") }, { value: "30", label: t("dashboard.next30") }]}
        />
      </div>
      {error ? (
        <QueryError error={error} />
      ) : isPending || !data ? (
        <LoadingRows />
      ) : data.length === 0 ? (
        <EmptyState illustration="caughtUp">{t("dashboard.allCaughtUp")}</EmptyState>
      ) : (
        <ul className="divide-y">
          {data.map((u, i) => (
            <li key={`${u.type}-${u.entry_id ?? u.payment_method_id}-${i}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1 basis-36">
                <p className="truncate font-medium">
                  {u.type === "card" && <CreditCard className="mr-1 inline size-3.5" aria-hidden />}
                  {u.type === "card" ? `${t("dashboard.cardDue")} · ${u.name}` : u.name}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {day(u.date)}
                  {u.overdue && (
                    <span className="flex items-center gap-1 font-medium text-destructive">
                      <AlertTriangle className="size-3" aria-hidden /> {t("dashboard.overdue")}
                    </span>
                  )}
                </p>
              </div>
              <Money cents={u.amount} className="font-medium" />
              {u.type === "fixed" && u.entry_id ? (
                <Button size="sm" variant="outline" disabled={update.isPending}
                  onClick={() => update.mutate(
                    { id: u.entry_id!, amount: u.amount, status: "paid", payment_method_id: u.payment_method_id ?? undefined },
                    { onSuccess: () => toast.success(t("common.saved")), onError: (e) => toast.error(errMsg(e)) },
                  )}>
                  {t("month.markPaid")}
                </Button>
              ) : u.type === "card" && u.payment_method_id != null ? (
                <Button asChild size="sm" variant="ghost"><Link href={`/cards/${u.payment_method_id}`}>{t("cards.recordPayment")}</Link></Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
