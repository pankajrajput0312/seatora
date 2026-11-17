import { redirect } from "next/navigation";
import { createSession } from "@/features/auth/lib/session";
import { finishChallenge, whatsappLoginOn } from "@/features/auth/lib/whatsapp-login";
import { track } from "@/features/funnel/service";
import { db } from "@/lib/db";
import { isMember } from "@/lib/site-access";

// "Open Seatora" in the WhatsApp reply after she sends her login code: its one-time token (openToken) signs in whichever
// browser WhatsApp opens, then Home. Used or expired: Home all the same (sign-in if this browser isn't signed in).

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t");
  const r = whatsappLoginOn() && token ? await finishChallenge(token) : null;
  if (r?.state === "ok") {
    const user = await db.user.findUnique({ where: { id: r.userId } });
    if (user && isMember(user.email)) {
      await createSession(user);
      await track("signin_done", { userId: user.id, meta: { via: "whatsapp_link" } });
    }
  }
  redirect("/decide");
}
