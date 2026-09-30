"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
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

  const download = async (kind: "expenses" | "entries") => {
    const path = kind === "expenses" ? "/export/expenses.csv" : "/export/entries.csv";
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

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
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
      <Card>
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
      <Card>
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
        </CardContent>
      </Card>
      <Card className="border-destructive/50">
        <CardHeader><CardTitle className="text-destructive">{t("settings.danger")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={deleteAccount} className="space-y-3" noValidate>
            <p className="text-sm text-muted-foreground">{t("settings.deleteWarning")}</p>
            <Label htmlFor="d-pass">{t("settings.confirmPassword")}</Label>
            <Input id="d-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!deleteError} />
            <FieldError message={deleteError} />
            <Button type="submit" variant="destructive" disabled={!password}>{t("settings.deleteAccount")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
