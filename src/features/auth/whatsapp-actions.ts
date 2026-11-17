"use server";

import { cookies } from "next/headers";
import { clientIp } from "@/features/funnel/service";
import { allow } from "@/lib/rate-limit";
import { startChallenge, WA_LOGIN_COOKIE, WA_LOGIN_TTL_MS, waLink, whatsappLoginOn } from "./lib/whatsapp-login";

/** "Continue with WhatsApp": a new code for this browser (cookie wa_login) and the wa.me link that sends it. */
export async function startWhatsAppLogin(): Promise<{ ok: true; code: string; url: string } | { ok: false; error: string }> {
  if (!whatsappLoginOn()) return { ok: false, error: "WhatsApp sign-in isn't available." };
  // Generous per IP (hostels share one), as sign-in: a code a minute is plenty for a person.
  if (!allow(`wa-login:${await clientIp()}`, 10)) return { ok: false, error: "Too many attempts. Please wait a minute." };
  const { code, token } = await startChallenge();
  (await cookies()).set(WA_LOGIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: WA_LOGIN_TTL_MS / 1000 });
  return { ok: true, code, url: waLink(code) };
}
