"use client";
import { format } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryTile } from "@/components/common/category-tile";
import { ListRow } from "@/components/common/list-row";
import { useFormatMoney } from "@/components/common/money";
import { QueryError } from "@/components/common/query-error";
import { RowMenu } from "@/components/common/row-menu";
import { ListSkeleton } from "@/components/common/skeletons";
import { SwipeRow } from "@/components/common/swipe-row";
import { GoalCard } from "@/components/savings/goal-card";
import { SavingsSheet, type SheetState } from "@/components/savings/savings-sheet";
import { Button } from "@/components/ui/button";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { Link } from "@/i18n/navigation";
import { useErrorMessage } from "@/lib/api/error-messages";
import type { AccountMovement } from "@/lib/api/types";
import { parseISODate } from "@/lib/dates";
import { useAccountMovements, useDeleteMovement, useDeleteValuation, useSavingsAccount, useValuations } from "@/lib/query/hooks";

export default function SavingsAccountPage() {
  const id = Number(useParams<{ id: string }>().id);
  const t = useTranslations();
  const fmt = useFormatMoney();
  const locale = useLocale();
  const errMsg = useErrorMessage();
  const detail = useSavingsAccount(id);
  const movements = useAccountMovements(id);
  const valuations = useValuations(id);
  const delMove = useDeleteMovement();
  const delVal = useDeleteValuation();
  const { hidden, request } = useUndoableDelete({ remove: (mid) => delMove.mutateAsync(mid) });
  const [sheet, setSheet] = useState<SheetState>(null);
  const day = (iso: string) => format(parseISODate(iso), "d MMM yyyy", { locale: locale === "en" ? enUS : es });

  if (detail.isPending) return <ListSkeleton rows={6} />;
  if (!detail.data) return <QueryError error={detail.error} />;
  const { account: a, goals } = detail.data;

  const side = (m: AccountMovement) =>
    m.kind === "transfer" ? (m.account_id === id ? "transfer_out" : "transfer_in") : m.kind;
  const sign = (m: AccountMovement) => (side(m) === "deposit" || side(m) === "transfer_in" ? "+" : "−");
  const iconOf = (m: AccountMovement) => (m.kind === "transfer" ? ArrowLeftRight : m.kind === "deposit" ? ArrowDownLeft : ArrowUpRight);
  const visible = (movements.data ?? []).filter((m) => !hidden.has(m.id));

  return (
    <div className="space-y-6">
      <Link href="/savings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"><ArrowLeft className="size-4" /> {t("savings.title")}</Link>
      <header className="space-y-3 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">{a.name}</h1>
            <p className="text-sm text-muted-foreground">{a.institution} · {t(`savings.kinds.${a.kind}`)}</p>
          </div>
          <Button variant="ghost" size="icon" className="size-11" aria-label={t("savings.editAccount")} onClick={() => setSheet({ type: "account", account: a })}><Pencil /></Button>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["savings.balance", a.balance], ["savings.putIn", a.put_in], ["savings.gain", a.gain]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{t(k)}</dt><dd className="num font-display text-lg font-bold">{fmt(v)}</dd></div>
          ))}
          {a.estimated_yield != null && a.estimated_yield > 0 && (
            <div><dt className="text-xs text-muted-foreground">{t("savings.form.rate")}</dt><dd className="num text-sm">{t("savings.estimated", { amount: fmt(a.estimated_yield) })}</dd></div>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button size="touch" onClick={() => setSheet({ type: "movement", accountId: id })}><Plus /> {t("savings.movement")}</Button>
          <Button size="touch" variant="outline" onClick={() => setSheet({ type: "valuation", account: a })}><TrendingUp /> {t("savings.updateValue")}</Button>
        </div>
      </header>

      {goals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("savings.goals")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {goals.map((g) => (
              <GoalCard key={g.id} goal={g}
                onContribute={(x) => setSheet({ type: "movement", accountId: id, goalId: x.id, kind: "deposit" })}
                onOpen={(x) => setSheet({ type: "goal", goal: x })} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("savings.movements")}</h2>
        {movements.isPending ? <ListSkeleton /> : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("savings.noMovements")}</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((m) => {
              const actions = [
                { label: t("common.edit"), icon: Pencil, onSelect: () => setSheet({ type: "movement", movement: m }) },
                { label: t("common.delete"), icon: Trash2, destructive: true, onSelect: () => request(m.id, t("common.deleted")) },
              ];
              return (
                <li key={m.id}>
                  <SwipeRow actions={actions}>
                    <ListRow
                      leading={<CategoryTile Icon={iconOf(m)} color={a.color} />}
                      title={t(`savings.movementKinds.${side(m)}`)}
                      meta={<span className="text-xs text-muted-foreground">{day(m.occurred_on)}{m.note ? ` · ${m.note}` : ""}</span>}
                      amount={<span className="num font-semibold">{sign(m)}{fmt(m.amount)}</span>}
                      trailing={<RowMenu actions={actions} rowId={m.id} />}
                    />
                  </SwipeRow>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(valuations.data ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{t("savings.valuations")}</h2>
          <ul className="space-y-2">
            {(valuations.data ?? []).map((v) => (
              <li key={v.valued_on}>
                <ListRow
                  leading={<CategoryTile Icon={TrendingUp} color={a.color} />}
                  title={fmt(v.value)} meta={<span className="text-xs text-muted-foreground">{day(v.valued_on)}</span>}
                  trailing={<RowMenu rowId={v.valued_on} actions={[{ label: t("common.delete"), icon: Trash2, destructive: true,
                    onSelect: () => void delVal.mutateAsync({ accountId: id, date: v.valued_on }).catch((e) => toast.error(errMsg(e))) }]} />}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <SavingsSheet state={sheet} onChange={setSheet} />
    </div>
  );
}
