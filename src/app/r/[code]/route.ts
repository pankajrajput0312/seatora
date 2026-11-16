import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/lib/session";
import { isBot } from "@/features/funnel/lib";
import { track } from "@/features/funnel/service";
import { REF_COOKIE, REF_COOKIE_MAX_AGE_S } from "@/features/referrals/lib";
import { referrerByCode } from "@/features/referrals/service";
import { allow } from "@/lib/rate-limit";

// GET /r/CODE, a referral link (docs/REFERRALS.md). A real code sets the seatora_ref cookie (httpOnly, 30 days) that
// sign-up and checkout read, then on to /signup?ref=CODE, or /pricing when already signed in. An unknown code goes on
// without the cookie, to /signup?invite=bad (it says the link isn't valid). 30 lookups a minute per IP. Records
// referral_link_open (docs/FUNNEL.md).
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`ref-link:${ip}`, 30, 60_000)) return new Response("Too many requests. Try again in a minute.", { status: 429, headers: { "Retry-After": "60" } });
  const ref = await referrerByCode((await params).code);
  const me = await getCurrentUser();
  if (!isBot(req.headers.get("user-agent"))) await track("referral_link_open", { userId: me?.id ?? null, meta: { valid: !!ref } }); // not link previews
  // A relative Location: the browser resolves it against the host it asked (next start doesn't know the public host).
  const res = new NextResponse(null, { status: 307, headers: { Location: me ? "/pricing" : ref ? `/signup?ref=${ref.code}` : "/signup?invite=bad", "Cache-Control": "private, no-store" } });
  if (ref) res.cookies.set(REF_COOKIE, ref.code, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: REF_COOKIE_MAX_AGE_S });
  return res;
}
