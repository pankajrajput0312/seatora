import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

// "Continue with WhatsApp": the browser gets a code and a cookie; she sends the code to Seatora's number; the webhook
// links the challenge to the sender's account; the browser holding the cookie signs in, once. Only hashes are stored.

/** On only with WHATSAPP_LOGIN=1 (Vercel env): the button, the action and the status route. */
export const whatsappLoginOn = () => process.env.WHATSAPP_LOGIN === "1";
export const WA_LOGIN_COOKIE = "wa_login";
export const WA_LOGIN_TTL_MS = 10 * 60_000;
export const WA_NUMBER = "917011488467";

/** A–Z and 2–9 without I, O (look like 1, 0): 32 symbols, so a byte mod 32 is unbiased. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from(randomBytes(8), (b) => ALPHABET[b % 32]).join("");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const loginMessage = (code: string) => `Log in to Seatora · code ${code}`;
export const waLink = (code: string) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(loginMessage(code))}`;

/**
 * The code in a WhatsApp message: the prefilled "Log in to Seatora · code X" (`full`), or the code alone (only counts
 * if a challenge has it: an eight-letter word must still reach the assistant).
 */
export function parseLoginCode(text: string): { code: string; full: boolean } | null {
  const full = /log\s*in\s+to\s+seatora.*code\s*([A-Z2-9]{8})\b/i.exec(text);
  if (full) return { code: full[1].toUpperCase(), full: true };
  const bare = /^\s*([A-HJ-NP-Z2-9]{8})\s*$/.exec(text);
  return bare ? { code: bare[1], full: false } : null;
}

/** A new challenge: the code to show and send, and the cookie token for this browser. */
export async function startChallenge(now = new Date()) {
  const code = newCode();
  const token = randomBytes(32).toString("base64url");
  await db.loginChallenge.create({ data: { codeHash: sha(code), browserHash: sha(token), expiresAt: new Date(now.getTime() + WA_LOGIN_TTL_MS) } });
  // Old challenges go as new ones come (the table stays tiny).
  await db.loginChallenge.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } });
  return { code, token };
}

/** From the webhook: the sender's account claims the code. "none" = no challenge has it (a bare code may be a word). */
export async function linkChallenge(code: string, userId: string, phone: string, now = new Date()): Promise<"linked" | "expired" | "none"> {
  const c = await db.loginChallenge.findUnique({ where: { codeHash: sha(code) } });
  if (!c) return "none";
  if (c.expiresAt <= now || c.consumedAt || (c.userId && c.userId !== userId)) return "expired";
  await db.loginChallenge.update({ where: { id: c.id }, data: { userId, phone } });
  return "linked";
}

/** From the browser's poll: its challenge's state; "ok" consumes it (one sign-in per challenge). */
export async function finishChallenge(token: string, now = new Date()): Promise<{ state: "pending" | "expired" } | { state: "ok"; userId: string }> {
  const c = await db.loginChallenge.findUnique({ where: { browserHash: sha(token) } });
  if (!c || c.consumedAt || c.expiresAt <= now) return { state: "expired" };
  if (!c.userId) return { state: "pending" };
  // Atomic: two polls at once sign in only once.
  const { count } = await db.loginChallenge.updateMany({ where: { id: c.id, consumedAt: null }, data: { consumedAt: now } });
  return count ? { state: "ok", userId: c.userId } : { state: "expired" };
}
