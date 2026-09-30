import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);
const PUBLIC = new Set(["/login", "/register"]);

/** Locale routing plus a cheap redirect when no session hint exists. The API remains the real gate. */
export function proxy(req: NextRequest) {
  const [, first, ...rest] = req.nextUrl.pathname.split("/");
  if ((routing.locales as readonly string[]).includes(first)) {
    const sub = `/${rest.join("/")}`;
    if (sub !== "/" && !PUBLIC.has(sub) && !req.cookies.has("fin_session")) {
      return NextResponse.redirect(new URL(`/${first}/login`, req.url));
    }
  }
  return intl(req);
}

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };
