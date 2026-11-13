"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";
import { dummyHash, hashPassword, verifyPassword } from "./lib/password";
import { createSession, deleteSession } from "./lib/session";
import { signInSchema, signUpSchema, type SignInInput, type SignUpInput } from "./validations";

export type AuthResult = { ok: false; error: string };

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

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
    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    // Always run scrypt (against a dummy hash for unknown emails) so timing doesn't reveal accounts.
    const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await dummyHash));
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();

    // Same message for unknown email, wrong password and locked account.
    if (!user || !valid || locked) {
      if (user && !locked) {
        const failed = user.failedLogins + 1;
        await db.user.update({
          where: { id: user.id },
          data: failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: failed },
        });
      }
      return { ok: false, error: "Incorrect email or password. After 5 failed attempts, sign-in is paused for 15 minutes." };
    }
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
