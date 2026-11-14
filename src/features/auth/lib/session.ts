import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ACCESS_COOKIE, ACCESS_MAX_AGE_S, accessCookie, accessCookieUser, isAllowed, siteGate } from "@/lib/site-access";

const COOKIE = "medpath_session";
/** Readable by JS so the static header can show "Account". Carries no secret; auth uses COOKIE only. */
export const SIGNED_IN_FLAG = "medpath_signed_in";
const MAX_AGE_S = ACCESS_MAX_AGE_S; // 30 days, like the access cookie

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Creates a session for the user and sets the cookie. The DB only ever sees the token's hash. An allowlisted user also
 * gets the seatora_access cookie that src/middleware.ts checks (only while the gate is on).
 */
export async function createSession({ id: userId, email }: { id: string; email: string }) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: { id: hashToken(token), userId, expiresAt: new Date(Date.now() + MAX_AGE_S * 1000) },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
  (await cookies()).set(SIGNED_IN_FLAG, "1", {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
  const gate = siteGate();
  if (gate.state === "on" && isAllowed(email, gate.allowlist)) {
    (await cookies()).set(ACCESS_COOKIE, await accessCookie(gate.key, userId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_MAX_AGE_S,
    });
  }
}

/**
 * The signed-in user, or null. Expired sessions are treated as signed out, and so are accounts not on the allowlist:
 * only allowlisted accounts can sign in, so this covers sessions from before the lock or an email since removed.
 */
export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    // Prune this user's expired sessions as they're found.
    await db.session.deleteMany({ where: { userId: session.userId, expiresAt: { lt: new Date() } } });
    return null;
  }
  return isAllowed(session.user.email) ? session.user : null;
}

export async function deleteSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(COOKIE);
  jar.delete(SIGNED_IN_FLAG);
  jar.delete(ACCESS_COOKIE);
}

/**
 * Decide access, checked on the server (defense in depth behind src/middleware.ts): a valid access cookie, and a signed-in
 * (so still allowlisted) user who is that cookie's user. False whenever the gate isn't on, even in development.
 */
export async function hasSiteAccess() {
  const gate = siteGate();
  if (gate.state !== "on") return false;
  const userId = await accessCookieUser((await cookies()).get(ACCESS_COOKIE)?.value, gate.key);
  if (!userId) return false;
  return (await getCurrentUser())?.id === userId;
}

/** For Decide Server Actions, which can be POSTed to any route: what the middleware lets in (open only with the gate off). */
export async function canUseDecide() {
  return siteGate().state === "off" || hasSiteAccess();
}
