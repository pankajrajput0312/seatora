import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessCookieUser, siteGate } from "@/lib/site-access";

// Access gate for /decide and /api/v1: a valid seatora_access cookie, which only an allowlisted sign-in sets.
// Server Actions can be POSTed to any route, so Decide actions re-check access themselves. See docs/ARCHITECTURE.md "Access gate".

let warned = false;

export async function middleware(req: NextRequest) {
  const api = req.nextUrl.pathname.startsWith("/api/");
  const gate = siteGate();
  if (gate.state !== "on") {
    if (!warned) {
      warned = true;
      if (gate.state === "off") console.warn("SITE_ACCESS_SECRET and SEATORA_ALLOWED_EMAILS are not set: /decide and /api/v1 are OPEN (development only).");
      else console.error("SITE_ACCESS_SECRET (32+ characters) and SEATORA_ALLOWED_EMAILS are both required: denying /decide and /api/v1.");
    }
    if (gate.state === "off") return privateNext();
    return api ? denied(503, "access_unconfigured", "Access is not configured.") : redirect(req, "/login?error=unavailable");
  }

  if (await accessCookieUser(req.cookies.get(ACCESS_COOKIE)?.value, gate.key)) return privateNext();
  if (api) return denied(401, "unauthorized", "Sign in with an allowed account.");
  return redirect(req, `/login?${new URLSearchParams({ next: req.nextUrl.pathname + req.nextUrl.search })}`);
}

// Private responses are per user: no shared cache may keep them (this overrides the pages' and API's s-maxage).
function privateNext() {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

function denied(status: 401 | 503, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "private, no-store" } });
}

// On the host the browser asked for (next start builds nextUrl from its own hostname).
function redirect(req: NextRequest, path: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const res = NextResponse.redirect(new URL(path, host ? `${proto}://${host}` : req.url), 307);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const config = {
  matcher: ["/decide/:path*", "/api/v1/:path*"],
};
