import { cookies } from "next/headers";
import { createSession } from "@/features/auth/lib/session";
import { finishChallenge, WA_LOGIN_COOKIE, whatsappLoginOn } from "@/features/auth/lib/whatsapp-login";
import { track } from "@/features/funnel/service";
import { db } from "@/lib/db";
import { isMember } from "@/lib/site-access";

// The sign-in page polls this every 2 s while she sends the code from WhatsApp: {pending}, {expired}, or {ok} once the
// webhook has linked her account (this browser's wa_login cookie is the only way in; it signs in once).

export const dynamic = "force-dynamic";
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  if (!whatsappLoginOn()) return json({ expired: true }, 404);
  const jar = await cookies();
  const token = jar.get(WA_LOGIN_COOKIE)?.value;
  if (!token) return json({ expired: true });
  const r = await finishChallenge(token);
  if (r.state === "pending") return json({ pending: true });
  jar.delete(WA_LOGIN_COOKIE);
  if (r.state !== "ok") return json({ expired: true });
  const user = await db.user.findUnique({ where: { id: r.userId } });
  if (!user || !isMember(user.email)) return json({ expired: true, error: "This account doesn't have access." });
  await createSession(user);
  await track("signin_done", { userId: user.id, meta: { via: "whatsapp" } });
  return json({ ok: true });
}
