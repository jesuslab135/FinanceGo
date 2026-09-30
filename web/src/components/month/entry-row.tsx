"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Entry } from "@/lib/api/types";
import { parseISODate } from "@/lib/dates";
import { useUpdateEntry } from "@/lib/query/hooks";
import { cn } from "@/lib/utils";
import { entryActions } from "./entry-actions";
import { EntryForm } from "./entry-form";

export function EntryRow({ entry }: { entry: Entry }) {
  const t = useTranslations("month");
  const tc = useTranslations("common");
  const locale = useLocale();
  const update = useUpdateEntry();
  const [editing, setEditing] = useState(false);
  const due = format(parseISODate(entry.due_date), "d MMM", { locale: locale === "en" ? enUS : es });

  // Status-only change: settled_on is omitted so the server defaults it (today for paid/received).
  const setStatus = (status: string) =>
    update.mutate(
      { id: entry.id, amount: entry.amount, status, payment_method_id: entry.payment_method_id ?? undefined },
      { onError: (e) => toast.error(e.message) },
    );

  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3", entry.status === "skipped" && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", entry.status === "skipped" && "line-through")}>{entry.name}</p>
        <p className="text-xs text-muted-foreground">
          {t("due", { date: due })}
          {entry.edited && ` · ${t("edited")}`}
        </p>
      </div>
      <Badge variant={entry.status === "pending" ? "outline" : "secondary"}>{t(`status.${entry.status}`)}</Badge>
      <Money cents={entry.amount} className="w-28 text-right font-medium" />
      <div className="flex gap-1">
        {entryActions(entry).map((a) => (
          <Button key={a.key} size="sm" variant={a.key === "markPaid" || a.key === "markReceived" ? "default" : "ghost"} disabled={update.isPending} onClick={() => setStatus(a.status)}>
            {t(a.key)}
          </Button>
        ))}
        {entry.kind !== "installment" && (
          <Button size="icon" variant="ghost" aria-label={tc("edit")} onClick={() => setEditing(true)}><Pencil /></Button>
        )}
      </div>
      <ResponsiveDialog open={editing} onOpenChange={setEditing} title={t("editEntry")}>
        <EntryForm entry={entry} onDone={() => setEditing(false)} />
      </ResponsiveDialog>
    </li>
  );
}
