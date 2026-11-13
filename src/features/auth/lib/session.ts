import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE = "medpath_session";
/** Readable by JS so the static header can show "Account". Carries no secret; auth uses COOKIE only. */
export const SIGNED_IN_FLAG = "medpath_signed_in";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a session for `userId` and sets the cookie. The DB only ever sees the token's hash. */
export async function createSession(userId: string) {
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
  (await cookies()).set(SIGNED_IN_FLAG, "1", { sameSite: "lax", path: "/", maxAge: MAX_AGE_S });
}

/** The signed-in user, or null. Expired sessions are treated as signed out. */
export async function getCurrentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function deleteSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(COOKIE);
  jar.delete(SIGNED_IN_FLAG);
}
