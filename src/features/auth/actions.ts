"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { allow, isLimited, reset } from "@/lib/rate-limit";
import { dummyHash, hashPassword, verifyPassword } from "./lib/password";
import { createSession, deleteSession } from "./lib/session";
import { signInSchema, signUpSchema, type SignInInput, type SignUpInput } from "./validations";

export type AuthResult = { ok: false; error: string };

// Two layers against password guessing:
// - per account + IP: 5 failures per 15 min. Targets one attacker without locking the real user out elsewhere.
// - per account, any IP: 20 failures -> 15 min lock. Backstop against distributed guessing (atomic in the DB).
const PAIR_LIMIT = 5;
const PAIR_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LIMIT = 20;
const LOCK_MS = 15 * 60 * 1000;

async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function rateLimited(kind: string) {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
  // Generous per IP (hostels and colleges share IPs); per-account lockout stops brute force.
  return ip ? !allow(`${kind}:${ip}`, 30) : false;
}

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  if (await rateLimited("signup")) return { ok: false, error: "Too many attempts. Please wait a minute." };
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const user = await db.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) },
    });
    await createSession(user.id);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "An account with this email already exists. Try signing in." };
    }
    console.error("signUp failed", err);
    return { ok: false, error: "We couldn't create your account. Please try again." };
  }
  redirect("/account");
}

export async function signIn(input: SignInInput): Promise<AuthResult> {
  if (await rateLimited("signin")) return { ok: false, error: "Too many attempts. Please wait a minute." };
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const pairKey = `signin-fail:${parsed.data.email}:${await clientIp()}`;
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    // Always run scrypt (against a dummy hash for unknown emails) so timing doesn't reveal accounts.
    const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await dummyHash));
    const blocked =
      isLimited(pairKey, PAIR_LIMIT) || (!!user?.lockedUntil && user.lockedUntil > new Date());

    // Same message for unknown email, wrong password and blocked attempts.
    if (!user || !valid || blocked) {
      if (!valid) {
        allow(pairKey, PAIR_LIMIT, PAIR_WINDOW_MS);
        if (user) {
          // Atomic increment, so parallel guesses can't overwrite each other's count.
          const { failedLogins } = await db.user.update({
            where: { id: user.id },
            data: { failedLogins: { increment: 1 } },
            select: { failedLogins: true },
          });
          if (failedLogins >= ACCOUNT_LIMIT) {
            await db.user.updateMany({
              where: { id: user.id, failedLogins: { gte: ACCOUNT_LIMIT } },
              data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
            });
          }
        }
      }
      return { ok: false, error: "Incorrect email or password. Too many failed attempts pause sign-in for a few minutes." };
    }
    reset(pairKey);
    if (user.failedLogins || user.lockedUntil) {
      await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    await createSession(user.id);
  } catch (err) {
    console.error("signIn failed", err);
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }
  redirect("/account");
}

export async function signOut() {
  await deleteSession();
  redirect("/");
}
