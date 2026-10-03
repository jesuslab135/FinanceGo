"use client";

import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { Check, Pencil, SkipForward, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ListRow } from "@/components/common/list-row";
import { Money } from "@/components/common/money";
import { ResponsiveDialog } from "@/components/common/responsive-dialog";
import { RowMenu, type RowAction } from "@/components/common/row-menu";
import { SwipeRow } from "@/components/common/swipe-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Entry } from "@/lib/api/types";
import { parseISODate } from "@/lib/dates";
import { useUpdateEntry } from "@/lib/query/hooks";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { entryActions } from "./entry-actions";
import { EntryForm } from "./entry-form";
import { useErrorMessage } from "@/lib/api/error-messages";

export function EntryRow({ entry }: { entry: Entry }) {
  const t = useTranslations("month");
  const tc = useTranslations("common");
  const errMsg = useErrorMessage();
  const locale = useLocale();
  // Touch screens and narrow windows get the menu: inline buttons would push the name and date off the row.
  const coarse = useMediaQuery("(pointer: coarse), (max-width: 767px)");
  const update = useUpdateEntry();
  const [editing, setEditing] = useState(false);
  const due = format(parseISODate(entry.due_date), "EEE d MMM", { locale: locale === "en" ? enUS : es });

  // Status-only change: settled_on is omitted so the server defaults it (today for paid/received).
  // Guarded by isPending so swipe and menu actions behave like the disabled desktop buttons.
  const setStatus = (status: string) => {
    if (update.isPending) return;
    update.mutate(
      { id: entry.id, amount: entry.amount, status, payment_method_id: entry.payment_method_id ?? undefined },
      { onError: (e) => toast.error(errMsg(e)) },
    );
  };

  const all = entryActions(entry);
  const isPrimary = (key: string) => key === "markPaid" || key === "markReceived";
  const first = all[0];
  const primary = isPrimary(first.key) ? first : undefined;
  const secondary = all.filter((a) => !isPrimary(a.key));
  const iconFor = (key: string) => (key === "skip" ? SkipForward : Undo2);

  // Swipe-left actions; the RowMenu repeats them and adds the primary status action.
  const swipeActions: RowAction[] = [
    ...(entry.kind !== "installment" ? [{ label: tc("edit"), icon: Pencil, onSelect: () => setEditing(true) }] : []),
    ...secondary.map((a) => ({ label: t(a.key), icon: iconFor(a.key), onSelect: () => setStatus(a.status) })),
  ];
  const menuActions: RowAction[] = [
    ...(primary ? [{ label: t(primary.key), icon: Check, onSelect: () => setStatus(primary.status) }] : []),
    ...swipeActions,
  ];

  const trailing = (
    <div className="flex shrink-0 items-center gap-1">
      <Badge variant={entry.status === "pending" ? "outline" : "secondary"}>{t(`status.${entry.status}`)}</Badge>
      {coarse ? (
        <RowMenu actions={menuActions} />
      ) : (
        <>
          {all.map((a) => (
            <Button key={a.key} size="sm" variant={isPrimary(a.key) ? "default" : "ghost"} disabled={update.isPending} onClick={() => setStatus(a.status)}>
              {t(a.key)}
            </Button>
          ))}
          {entry.kind !== "installment" && (
            <Button size="icon" variant="ghost" aria-label={tc("edit")} onClick={() => setEditing(true)}><Pencil /></Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <li>
      <SwipeRow actions={swipeActions} primary={primary && { label: t(primary.key), onRun: () => setStatus(primary.status) }}>
        <ListRow
          muted={entry.status === "skipped"}
          title={<span className={cn(entry.status === "skipped" && "line-through")}>{entry.name}</span>}
          meta={`${t(entry.kind === "income" ? "arrives" : "due", { date: due })}${entry.edited ? ` · ${t("edited")}` : ""}`}
          amount={<Money cents={entry.amount} />}
          trailing={trailing}
        />
      </SwipeRow>
      <ResponsiveDialog open={editing} onOpenChange={setEditing} title={t("editEntry")}>
        <EntryForm entry={entry} onDone={() => setEditing(false)} />
      </ResponsiveDialog>
    </li>
  );
}
