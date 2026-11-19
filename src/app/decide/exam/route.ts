import { NextResponse, type NextRequest } from "next/server";
import { staffUser } from "@/features/auth/lib/session";
import { getCollege } from "@/features/decide/service";
import { profileParamKeys } from "@/features/decide/profile";
import { DEFAULT_EXAM, EXAM_COOKIE, examCookie, isExam } from "@/features/exams/keys";
import { safeNext } from "@/lib/site-access";

// A Decide page asked with ?exam= by a browser without the staff cookie lands here (src/middleware.ts), and so does
// staff's exam switcher: `k` the exam, `next` the page as asked. Staff (OWNER, ADMIN) get the seatora_exam cookie and go
// on to `next` with ?exam=k kept (none for NEET PG); an institute page the exam doesn't have opens its institutes list.
// Everyone else goes on to `next` without ?exam=, and without its profile params when they were another exam's (a
// NEET SS link must not become a NEET PG profile).
export async function GET(req: NextRequest) {
  const asked = req.nextUrl.searchParams.get("k");
  const k = isExam(asked) ? asked : null;
  const to = new URL(safeNext(req.nextUrl.searchParams.get("next")), "http://x");
  const staff = !!k && !!(await staffUser().catch(() => null));
  to.searchParams.delete("exam");
  if (staff && k !== DEFAULT_EXAM) to.searchParams.set("exam", k);
  if (!staff && k && k !== DEFAULT_EXAM) for (const p of profileParamKeys) to.searchParams.delete(p);
  // Staff switching on an institute page: that institute where the exam has it, else the exam's institutes.
  const slug = staff ? /^\/decide\/institutes\/([^/]+)$/.exec(to.pathname)?.[1] : undefined;
  if (slug && !(await getCollege(decodeURIComponent(slug), k!).catch(() => null))) {
    to.pathname = "/decide/institutes";
    to.searchParams.delete("tab");
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const res = NextResponse.redirect(new URL(to.pathname + to.search, host ? `${proto}://${host}` : req.url), 303);
  res.headers.set("Cache-Control", "private, no-store");
  if (staff) res.cookies.set(EXAM_COOKIE, k!, examCookie());
  // Anyone else's seatora_exam (made up: only staff are ever given one) goes, so it can't keep sending them here.
  else if (req.cookies.get(EXAM_COOKIE)) res.cookies.set(EXAM_COOKIE, "", { ...examCookie(), maxAge: 0 });
  return res;
}
