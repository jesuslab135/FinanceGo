"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/common/confirm-button";
import { FieldError } from "@/components/common/field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { ApiError, toApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-provider";
import { toISODate } from "@/lib/dates";
import { saveBlob } from "@/lib/download";
import { CURRENCIES, timezones } from "@/lib/locale-options";
import { useMe, useUpdateMe } from "@/lib/query/hooks";
import { fieldMessageKey, localizeFields, useErrorMessage } from "@/lib/api/error-messages";

const cardCls = "rounded-2xl shadow-card ring-0";

const THEMES = [
  { value: "light", key: "nav.themeLight", preview: "#f8f0f2" },
  { value: "dark", key: "nav.themeDark", preview: "#1d1519" },
  { value: "system", key: "nav.themeSystem", preview: "linear-gradient(90deg, #f8f0f2 50%, #1d1519 50%)" },
] as const;

/** Persisted by next-themes (localStorage + class on <html>, applied before paint); "system" is the default. */
function ThemeChooser() {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  // next-themes only knows the stored choice on the client; render the default until then to match the server HTML.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  // An unknown stored value (older build, hand-edited storage) falls back to "system" so one radio stays tabbable.
  const current = mounted && THEMES.some((o) => o.value === theme) ? theme : "system";
  const move = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = THEMES[(i + step + THEMES.length) % THEMES.length];
    setTheme(next.value);
    document.getElementById(`theme-${next.value}`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={t("settings.theme")} className="grid grid-cols-3 gap-3">
      {THEMES.map((o, i) => (
        <button
          key={o.value}
          id={`theme-${o.value}`}
          type="button"
          role="radio"
          aria-checked={current === o.value}
          tabIndex={current === o.value ? 0 : -1}
          onClick={() => setTheme(o.value)}
          onKeyDown={(e) => move(e, i)}
          className={`flex min-h-11 flex-col items-center gap-2 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${current === o.value ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}
        >
          <span aria-hidden className="block h-12 w-full max-w-20 rounded-xl border border-foreground/15" style={{ background: o.preview }} />
          {t(o.key)}
        </button>
      ))}
    </div>
  );
}

const selectCls = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

export default function SettingsPage() {
  const t = useTranslations();
  const errMsg = useErrorMessage();
  const { data: me } = useMe();
  const { setUser, logout } = useAuth();
  const updateMe = useUpdateMe();
  const router = useRouter();
  const [draft, setDraft] = useState<Partial<{ name: string; currency: string; locale: string; timezone: string }>>({});
  const profile = {
    name: me?.name ?? "", currency: me?.currency ?? "MXN", locale: me?.locale ?? "es", timezone: me?.timezone ?? "UTC", ...draft,
  };
  const setProfile = (p: typeof profile) => setDraft(p);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(toISODate(new Date()));
  const [password, setPassword] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      const u = await updateMe.mutateAsync(profile);
      setUser(u);
      toast.success(t("common.saved"));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(localizeFields(err.fields, t));
      else toast.error(errMsg(err));
    }
  };

  const download = async (kind: "expenses" | "entries" | "savings") => {
    const path = ({ expenses: "/export/expenses.csv", entries: "/export/entries.csv", savings: "/export/savings.csv" } as const)[kind];
    setExporting(true);
    try {
      const { data, error, response } = await api.GET(path, { params: { query: { from, to } }, parseAs: "blob" });
      if (!response.ok || !data) {
        let body: unknown = error;
        const raw: unknown = error;
        if (raw instanceof Blob) {
          try { body = JSON.parse(await raw.text()); } catch { body = undefined; }
        }
        return toast.error(errMsg(toApiError(response.status, body)));
      }
      saveBlob(data as Blob, `${kind}_${from}_${to}.csv`);
    } finally {
      setExporting(false);
    }
  };

  // Runs only from the confirmation dialog, never straight from the form.
  const deleteAccount = async () => {
    setDeleteError(undefined);
    const { error, response } = await api.DELETE("/me", { body: { password } });
    if (!response.ok) {
      const err = toApiError(response.status, error);
      return setDeleteError(err.fields.password ? t(fieldMessageKey(err.fields.password)) : errMsg(err));
    }
    await logout();
    router.replace("/register");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      <Card className={cardCls}>
        <CardHeader><CardTitle>{t("settings.theme")}</CardTitle></CardHeader>
        <CardContent><ThemeChooser /></CardContent>
      </Card>
      <Card className={cardCls}>
        <CardHeader><CardTitle>{t("settings.profile")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2" noValidate>
            <div className="space-y-2">
              <Label htmlFor="p-name">{t("auth.name")}</Label>
              <Input id="p-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} aria-invalid={!!errors.name} />
              <FieldError message={errors.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-currency">{t("auth.currency")}</Label>
              <select id="p-currency" className={selectCls} value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-locale">{t("settings.language")}</Label>
              <select id="p-locale" className={selectCls} value={profile.locale} onChange={(e) => setProfile({ ...profile, locale: e.target.value })}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-tz">{t("auth.timezone")}</Label>
              <Input id="p-tz" list="p-tz-list" value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} aria-invalid={!!errors.timezone} />
              <datalist id="p-tz-list">{timezones().map((z) => <option key={z} value={z} />)}</datalist>
              <FieldError message={errors.timezone} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={updateMe.isPending}>{t("common.save")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className={cardCls}>
        <CardHeader><CardTitle>{t("settings.export")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4 sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="x-from">{t("common.from")}</Label>
            <Input id="x-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="x-to">{t("common.to")}</Label>
            <Input id="x-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="outline" disabled={exporting} onClick={() => download("expenses")}>{t("settings.exportExpenses")}</Button>
          <Button variant="outline" disabled={exporting} onClick={() => download("entries")}>{t("settings.exportEntries")}</Button>
          <Button variant="outline" disabled={exporting} onClick={() => download("savings")}>{t("settings.exportSavings")}</Button>
        </CardContent>
      </Card>
      <Card className="rounded-2xl shadow-card ring-1 ring-destructive/40">
        <CardHeader><CardTitle className="text-destructive">{t("settings.danger")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(e) => e.preventDefault()} className="space-y-3" noValidate>
            <p className="text-sm text-muted-foreground">{t("settings.deleteWarning")}</p>
            <Label htmlFor="d-pass">{t("settings.confirmPassword")}</Label>
            <Input id="d-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!deleteError} />
            <FieldError message={deleteError} />
            <ConfirmButton onConfirm={deleteAccount} actionLabel={t("settings.deleteAccount")} description={t("settings.deleteWarning")}>
              <Button type="button" variant="destructive" disabled={!password}>{t("settings.deleteAccount")}</Button>
            </ConfirmButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
