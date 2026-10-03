const NAME = "fin_session";

/** A non-secret cookie that tells the edge proxy a session probably exists. */
export function setSessionHint(on: boolean) {
  if (typeof document === "undefined") return;
  document.cookie = on
    ? `${NAME}=1; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax`
    : `${NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function hasSessionHint(): boolean {
  return typeof document !== "undefined" && document.cookie.split("; ").some((c) => c === `${NAME}=1`);
}

export const SESSION_HINT_COOKIE = NAME;
