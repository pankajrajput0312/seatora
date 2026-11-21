"use server";

import { clientIp, track } from "@/features/funnel/service";
import { accountOf } from "@/features/whatsapp/account";
import { allow } from "@/lib/rate-limit";
import { isMember } from "@/lib/site-access";
import { createSession } from "./lib/session";
import { phoneLoginOn } from "./lib/phone-login";
import { verifyPhoneToken } from "./lib/phone-token";

/**
 * "Continue with mobile number", last step: the Firebase ID token of the number she just confirmed by SMS. Signs her in
 * to that number's account (made now if new; the same account WhatsApp sign-in uses).
 */
export async function signInWithPhone(idToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!phoneLoginOn()) return { ok: false, error: "Mobile number sign-in isn't available." };
  if (!allow(`phone-login:${await clientIp()}`, 10)) return { ok: false, error: "Too many attempts. Please wait a minute." };
  const phone = typeof idToken === "string" && idToken.length < 4096 ? await verifyPhoneToken(idToken) : null;
  if (!phone) return { ok: false, error: "That sign-in didn't go through. Please try again." };
  const user = await accountOf(phone.slice(1), null, "phone");
  if (!isMember(user.email)) return { ok: false, error: "This account doesn't have access." };
  await createSession(user);
  await track("signin_done", { userId: user.id, meta: { via: "phone" } });
  return { ok: true };
}
