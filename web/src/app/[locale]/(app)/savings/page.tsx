"use client";
import { Archive, ArchiveRestore, Pencil, Plus, ShieldCheck, Trash2, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { QueryError } from "@/components/common/query-error";
import { ChartSkeleton, HeroSkeleton, ListSkeleton } from "@/components/common/skeletons";
import { AccountRow } from "@/components/savings/account-row";
import { AllocationBar } from "@/components/savings/allocation-bar";
import { GoalCard } from "@/components/savings/goal-card";
import { InsuranceBanner } from "@/components/savings/insurance-banner";
import { NetWorthHero } from "@/components/savings/net-worth-hero";
import { SavingsChart } from "@/components/savings/savings-chart";
import { SavingsSheet, type SheetState } from "@/components/savings/savings-sheet";
import { Button } from "@/components/ui/button";
import { useSetAccountArchived } from "@/hooks/use-set-account-archived";
import { useToday } from "@/hooks/use-today";
import { useErrorMessage } from "@/lib/api/error-messages";
import type { SavingsAccount } from "@/lib/api/types";
import { useDeleteSavingsAccount, useSavingsAccounts, useSavingsGoals, useSavingsOverview, useSavingsSeries } from "@/lib/query/hooks";
import { monthsWindow } from "@/lib/savings";

export default function SavingsPage() {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const today = useToday();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [showArchived, setShowArchived] = useState(false);
  const overview = useSavingsOverview();
  const accounts = useSavingsAccounts(true); // archived too: the empty state and the toggle depend on all of them
  const goals = useSavingsGoals();
  const w = monthsWindow(today, 12);
  const series = useSavingsSeries(w.from, w.to);
  const remove = useDeleteSavingsAccount();

  const setArchived = useSetAccountArchived();
  const actionsFor = (a: SavingsAccount) => [
    { label: t("savings.updateValue"), icon: TrendingUp, onSelect: () => setSheet({ type: "valuation", account: a }) },
    { label: t("common.edit"), icon: Pencil, onSelect: () => setSheet({ type: "account", account: a }) },
    a.archived_on == null
      ? { label: t("savings.archive"), icon: Archive, onSelect: () => void setArchived(a, true) }
      : { label: t("savings.unarchive"), icon: ArchiveRestore, onSelect: () => void setArchived(a, false) },
    ...(!a.has_history ? [{ label: t("common.delete"), icon: Trash2, destructive: true,
      onSelect: () => remove.mutateAsync(a.id).catch((err) => toast.error(errMsg(err))) }] : []),
  ];

  const empty = accounts.data?.length === 0;
  const shownAccounts = (accounts.data ?? []).filter((a) => showArchived || a.archived_on == null);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("savings.title")}</h1>
        {!empty && (
          <div className="flex flex-wrap gap-2">
            <Button size="touch" variant="outline" onClick={() => setSheet({ type: "account" })}><Plus /> {t("savings.newAccount")}</Button>
            <Button size="touch" onClick={() => setSheet({ type: "goal" })}><Plus /> {t("savings.newGoal")}</Button>
          </div>
        )}
      </div>

      {overview.isPending ? <HeroSkeleton /> : overview.data ? <NetWorthHero overview={overview.data} /> : <QueryError error={overview.error} />}
      {overview.data && <InsuranceBanner warnings={overview.data.insurance_warnings} />}

      {empty ? (
        <EmptyState action={
          <div className="flex flex-col gap-2">
            <Button size="touch" onClick={() => setSheet({ type: "account" })}><Plus /> {t("savings.newAccount")}</Button>
            <Button size="touch" variant="outline" onClick={() => setSheet({ type: "account" })}><ShieldCheck /> {t("savings.emergencyCta")}</Button>
          </div>
        }>{t("savings.empty")}</EmptyState>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">{t("savings.goals")}</h2>
            {goals.isPending ? <ListSkeleton rows={2} /> : goals.error ? <QueryError error={goals.error} /> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(goals.data ?? []).map((g) => (
                  <GoalCard key={g.id} goal={g}
                    onContribute={(x) => setSheet({ type: "movement", accountId: x.account_id, goalId: x.id, kind: "deposit" })}
                    onOpen={(x) => setSheet({ type: "goal", goal: x })} />
                ))}
                <button type="button" onClick={() => setSheet({ type: "goal", emergency: true })}
                  className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-input p-4 text-sm text-muted-foreground hover:bg-muted">
                  <ShieldCheck className="size-5" aria-hidden /> {t("savings.emergencyCta")}
                </button>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{t("savings.accounts")}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)} aria-pressed={showArchived}>{t("savings.archived")}</Button>
            </div>
            {accounts.isPending ? <ListSkeleton /> : accounts.error ? <QueryError error={accounts.error} /> : (
              <ul className="space-y-2">
                {shownAccounts.map((a) => (
                  <li key={a.id}><AccountRow account={a} href={`/savings/accounts/${a.id}`} actions={actionsFor(a)} /></li>
                ))}
              </ul>
            )}
          </section>

          {series.isPending ? <ChartSkeleton /> : series.data ? <SavingsChart points={series.data} /> : <QueryError error={series.error} />}
          {overview.data && <AllocationBar slices={overview.data.allocation} />}
        </>
      )}

      <SavingsSheet state={sheet} onChange={setSheet} />
    </div>
  );
}
