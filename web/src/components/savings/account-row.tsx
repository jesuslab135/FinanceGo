"use client";
import { Landmark } from "lucide-react";
import { useTranslations } from "next-intl";
import { CategoryTile } from "@/components/common/category-tile";
import { ListRow } from "@/components/common/list-row";
import { useFormatMoney } from "@/components/common/money";
import { RowMenu, type RowAction } from "@/components/common/row-menu";
import { Link } from "@/i18n/navigation";
import type { SavingsAccount } from "@/lib/api/types";
import { useToday } from "@/hooks/use-today";
import { daysSince } from "@/lib/savings";

export function AccountRow({ account: a, href, actions }: { account: SavingsAccount; href: string; actions: RowAction[] }) {
  const t = useTranslations("savings");
  const fmt = useFormatMoney();
  const today = useToday();
  const gain = a.gain_pct;
  return (
    <ListRow
      muted={a.archived_on != null}
      leading={<CategoryTile Icon={Landmark} color={a.color} />}
      title={<Link href={href} className="hover:underline">{a.name}</Link>}
      meta={
        <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{a.institution} · {t(`kinds.${a.kind}`)}</span>
          {a.estimated_yield != null && a.estimated_yield > 0 && <span>{t("estimated", { amount: fmt(a.estimated_yield) })}</span>}
          {a.stale && <span className="font-medium text-foreground">{t("stale", { days: daysSince(a.anchor_date, today) })}</span>}
        </span>
      }
      amount={
        <span className="flex flex-col items-end">
          <span className="num font-semibold">{fmt(a.balance)}</span>
          {gain != null && (
            <span className="num text-xs text-muted-foreground">
              {gain >= 0 ? "+" : "−"}{Math.abs(gain).toFixed(2)}%
            </span>
          )}
        </span>
      }
      trailing={<RowMenu actions={actions} rowId={a.id} />}
    />
  );
}
