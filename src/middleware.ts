import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_EXAM, EXAM_COOKIE, EXAM_HEADER, examCookie, isExam } from "@/features/exams/keys";
import { AID_COOKIE, AID_MAX_AGE_S, isAid, isBot } from "@/features/funnel/lib";
import { ACCESS_COOKIE, accessCookieUser, siteGate } from "@/lib/site-access";

// Two jobs. 1. The seatora_aid device cookie (docs/FUNNEL.md) on page requests that lack it, bots aside; it is also put
// on this request, so the page or route handler sees it the first time. A Decide request's exam is its URL's ?exam=
// (none: NEET PG), handed to the page as the x-seatora-exam request header (only staff's pages heed it:
// features/exams/active.tsx). A browser without the seatora_exam cookie (which app/decide/exam/route.ts sets for staff
// only) is sent through that route first: staff come back with it, everyone else to the page without ?exam= (and
// without another exam's profile params). 2. The access gate for /decide and /api/v1: a
// valid seatora_access cookie, which only a member's sign-in sets (any account with SEATORA_OPEN_ACCESS=1, else an
// allowlisted one). Server Actions can be POSTed to any route, so Decide actions re-check access themselves. See
// docs/ARCHITECTURE.md "Access gate".

let warned = false;

export async function middleware(req: NextRequest) {
  const api = req.nextUrl.pathname.startsWith("/api/");
  const aid = !api && !isAid(req.cookies.get(AID_COOKIE)?.value) && !isBot(req.headers.get("user-agent")) ? newAid() : null;
  if (aid) req.cookies.set(AID_COOKIE, aid);
  req.headers.delete(EXAM_HEADER); // only this middleware sets it
  const decide = req.nextUrl.pathname.startsWith("/decide") && req.nextUrl.pathname !== "/decide/exam";
  const exam = decide ? req.nextUrl.searchParams.get("exam") : null;
  const known = req.cookies.get(EXAM_COOKIE)?.value;
  // ?exam= without the staff cookie (or an exam that isn't one): through /decide/exam first.
  if (exam != null && !(isExam(exam) && isExam(known))) return withAid(redirect(req, `/decide/exam?${new URLSearchParams({ k: exam, next: req.nextUrl.pathname + req.nextUrl.search })}`), aid);
  // Bare /decide (Home, nothing asked) in a staff browser last on another exam: that exam's Home. Members never have
  // the cookie (only the route sets it, for staff); one made up only names an exam the page then ignores (active.tsx).
  if (req.nextUrl.pathname === "/decide" && !req.nextUrl.search && isExam(known) && known !== DEFAULT_EXAM) return withAid(redirect(req, `/decide?exam=${known}`), aid);
  if (exam != null) req.headers.set(EXAM_HEADER, exam);
  const res = await gate(req, api);
  // Staff's cookie follows the exam their URL names (a link, Back): the last one used.
  if (exam != null && exam !== known) res.cookies.set(EXAM_COOKIE, exam, examCookie());
  return withAid(res, aid);
}

const withAid = (res: NextResponse, aid: string | null) => {
  if (aid) res.cookies.set(AID_COOKIE, aid, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: AID_MAX_AGE_S });
  return res;
};

async function gate(req: NextRequest, api: boolean) {
  const path = req.nextUrl.pathname;
  if (!path.startsWith("/decide") && !path.startsWith("/api/v1")) return next(req);
  const gate = siteGate();
  if (gate.state !== "on") {
    if (!warned) {
      warned = true;
      if (gate.state === "off") console.warn("SITE_ACCESS_SECRET and SEATORA_ALLOWED_EMAILS are not set: /decide and /api/v1 are OPEN (development only).");
      else console.error("SITE_ACCESS_SECRET (32+ characters) and SEATORA_ALLOWED_EMAILS (or SEATORA_OPEN_ACCESS=1) are required: denying /decide and /api/v1.");
    }
    if (gate.state === "off") return pass(req, api);
    return api ? denied(503, "access_unconfigured", "Access is not configured.") : redirect(req, "/login?error=unavailable");
  }

  if (await accessCookieUser(req.cookies.get(ACCESS_COOKIE)?.value, gate.key)) return pass(req, api);
  if (api) return denied(401, "unauthorized", gate.open ? "Sign in to use the Decide API." : "Sign in with an allowed account.");
  return redirect(req, `/login?${new URLSearchParams({ next: req.nextUrl.pathname + req.nextUrl.search })}`);
}

/** 16 random bytes, base64url (22 characters). */
function newAid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** On, with this request's (maybe new) cookies. */
const next = (req: NextRequest) => NextResponse.next({ request: { headers: req.headers } });

// The API is read-only: any other method gets the JSON error envelope (405), not Next's empty one. Pages pass (Server Actions POST).
function pass(req: NextRequest, api: boolean) {
  if (api && !["GET", "HEAD", "OPTIONS"].includes(req.method)) return denied(405, "method_not_allowed", "The Decide API is read-only: use GET.", { Allow: "GET, HEAD" });
  // Private responses are per user: no shared cache may keep them (this overrides the pages' and API's s-maxage).
  const res = next(req);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

function denied(status: 401 | 405 | 503, code: string, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
}

// On the host the browser asked for (next start builds nextUrl from its own hostname).
function redirect(req: NextRequest, path: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const res = NextResponse.redirect(new URL(path, host ? `${proto}://${host}` : req.url), 307);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

// Pages and route handlers (not Next's assets, files with an extension, or /api other than /api/v1), and all of the
// gated paths whatever their names.
export const config = {
  matcher: ["/((?!_next/|api/|.*\\.[\\w]+$).*)", "/decide/:path*", "/api/v1/:path*"],
};
