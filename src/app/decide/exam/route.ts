import { NextResponse, type NextRequest } from "next/server";
import { staffUser } from "@/features/auth/lib/session";
import { EXAM_COOKIE, isExam } from "@/features/exams/keys";
import { safeNext } from "@/lib/site-access";

// ?exam= on any Decide page lands here (src/middleware.ts): `k` the exam asked, `next` the page without ?exam=. Staff
// (OWNER, ADMIN) get it as the seatora_exam cookie, which only their pages heed (features/exams/active.tsx); everyone
// else is sent on with nothing set. Either way, on to `next`.
export async function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get("k");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const res = NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), host ? `${proto}://${host}` : req.url), 303);
  res.headers.set("Cache-Control", "private, no-store");
  if (isExam(k) && (await staffUser().catch(() => null)))
    res.cookies.set(EXAM_COOKIE, k, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/decide", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
