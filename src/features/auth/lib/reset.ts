import "server-only";
import { randomBytes } from "node:crypto";
import { clientIp } from "@/features/funnel/service";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";
import { hashToken } from "./session";

// Password reset without email: the owner makes a link on /decide/admin and sends it to her (she asked from her account's
// email). One-time, an hour long; the DB only sees the token's hash, as with sessions.

export const RESET_TTL_MS = 60 * 60 * 1000;

/** /reset's views and submits per IP, together: 10 per 15 minutes; false once spent. */
export async function resetAllowed() {
  return allow(`reset:${await clientIp()}`, 10, 15 * 60 * 1000);
}

/**
 * A new token for the user and the writes that store it (her older links deleted, this one's hash saved), to run in the
 * caller's transaction beside its audit row.
 */
export function newResetToken(userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS);
  return {
    token,
    expiresAt,
    writes: [db.passwordReset.deleteMany({ where: { userId } }), db.passwordReset.create({ data: { id: hashToken(token), userId, expiresAt } })],
  };
}

/** Whose a token is while it is unused and unexpired, else null. Doesn't use it up. */
export async function resetTokenUser(token: string, now = new Date()) {
  const r = await db.passwordReset.findUnique({ where: { id: hashToken(token) }, select: { expiresAt: true, user: { select: { id: true, email: true } } } });
  return r && r.expiresAt > now ? r.user : null;
}

/**
 * Sets her new password with the token, once: deleting the row is the claim (of two requests at once only one deletes
 * it), an expired one is deleted too. Then the new hash, her lockout cleared, every session and any other link of hers
 * deleted. The user, or null for an unknown, used or expired token.
 */
export async function redeemResetToken(token: string, passwordHash: string, now = new Date()) {
  const id = hashToken(token);
  const row = await db.passwordReset.findUnique({ where: { id }, select: { userId: true } });
  if (!row) return null;
  const { count } = await db.passwordReset.deleteMany({ where: { id, expiresAt: { gt: now } } });
  if (!count) {
    await db.passwordReset.deleteMany({ where: { id } });
    return null;
  }
  const [user] = await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash, failedLogins: 0, lockedUntil: null }, select: { id: true, email: true } }),
    db.session.deleteMany({ where: { userId: row.userId } }),
    db.passwordReset.deleteMany({ where: { userId: row.userId } }),
  ]);
  return user;
}
