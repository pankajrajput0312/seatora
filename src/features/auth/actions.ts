"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { clientIp, deviceAid, ipHash, track } from "@/features/funnel/service";
import { REF_COOKIE } from "@/features/referrals/lib";
import { referrerByCode } from "@/features/referrals/service";
import { allow, isLimited, reset } from "@/lib/rate-limit";
import { inviteMatches, isAllowed, isMember, openAccess, parseAllowlist, safeNext } from "@/lib/site-access";
import { dummyHash, hashPassword, verifyPassword } from "./lib/password";
import { createSession, currentSessionId, deleteSession, getCurrentUser } from "./lib/session";
import {
  changePasswordSchema,
  openSignUpSchema,
  signInSchema,
  signUpSchema,
  type ChangePasswordInput,
  type SignInInput,
  type SignUpInput,
} from "./validations";

export type AuthResult = { ok: false; error: string };

// Two layers against password guessing:
// - per account + IP: 5 failures per 15 min. Targets one attacker without locking the real user out elsewhere.
// - per account, any IP: 20 failures -> 15 min lock. Backstop against distributed guessing (atomic in the DB).
const PAIR_LIMIT = 5;
const PAIR_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LIMIT = 20;
const LOCK_MS = 15 * 60 * 1000;
// Accounts created per IP per hour (on top of rateLimited): sign-up is open to anyone with SEATORA_OPEN_ACCESS=1.
const SIGNUPS_PER_HOUR = 5;
// Accounts one device (the seatora_aid cookie) may create in 30 days: SIGNUP_PER_DEVICE, default 3 (docs/FUNNEL.md).
// Not by IP: hostels and colleges share one.
const DEVICE_WINDOW_MS = 30 * 86_400_000;
const signupsPerDevice = () => {
  const n = Number(process.env.SIGNUP_PER_DEVICE);
  return Number.isInteger(n) && n > 0 ? n : 3;
};

async function rateLimited(kind: string) {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
  // Generous per IP (hostels and colleges share IPs); per-account lockout stops brute force.
  return ip ? !allow(`${kind}:${ip}`, 30) : false;
}

/** A wrong password: counts for the account + IP pair (in memory) and the account (atomic in the DB, can lock it). */
async function recordFailure(pairKey: string, userId?: string) {
  allow(pairKey, PAIR_LIMIT, PAIR_WINDOW_MS);
  if (!userId) return;
  // Atomic increment, so parallel guesses can't overwrite each other's count.
  const { failedLogins } = await db.user.update({
    where: { id: userId },
    data: { failedLogins: { increment: 1 } },
    select: { failedLogins: true },
  });
  if (failedLogins >= ACCOUNT_LIMIT) {
    await db.user.updateMany({
      where: { id: userId, failedLogins: { gte: ACCOUNT_LIMIT } },
      data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
    });
  }
}

// SEATORA_OPEN_ACCESS=1: anyone may sign up, no invite code; an owner address (SEATORA_OWNER_EMAILS) can't be claimed,
// since nothing verifies the email. Otherwise invite-only: an allowlisted account (SEATORA_ALLOWED_EMAILS) with
// SEATORA_INVITE_CODE. Either way at most SIGNUPS_PER_HOUR tries reach the database per IP, and a device that made
// SIGNUP_PER_DEVICE accounts in 30 days makes no more. `next` is ?next= from the page.
// `ref`: the page's ?ref=; the seatora_ref cookie (/r/CODE) comes first. A real code's owner becomes her referredById.
export async function signUp(input: SignUpInput, next?: string, ref?: string): Promise<AuthResult> {
  if (await rateLimited("signup")) return { ok: false, error: "Too many attempts. Please wait a minute." };
  const open = openAccess();
  const parsed = open ? openSignUpSchema.safeParse(input) : signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (open) {
    if (isAllowed(parsed.data.email, parseAllowlist(process.env.SEATORA_OWNER_EMAILS))) {
      return { ok: false, error: "This email can't be used to sign up. Sign in instead." };
    }
  } else if (!isAllowed(parsed.data.email) || !(await inviteMatches("invite" in parsed.data ? parsed.data.invite : undefined))) {
    // One message for both, so it doesn't reveal which emails are allowlisted.
    return { ok: false, error: "That email and invite code don't match an invite. Buy the Season Pass on the Pricing page to get an access code." };
  }
  const aid = await deviceAid();
  const perDevice = signupsPerDevice();
  if (aid && (await db.user.count({ where: { signupAid: aid, createdAt: { gte: new Date(Date.now() - DEVICE_WINDOW_MS) } } })) >= perDevice) {
    return { ok: false, error: `This device already has ${perDevice} Seatora account${perDevice === 1 ? "" : "s"}. Sign in to one of them.` };
  }
  if (!allow(`signup-hour:${await clientIp()}`, SIGNUPS_PER_HOUR, 60 * 60 * 1000)) {
    return { ok: false, error: "Too many accounts from this network. Please try again in an hour." };
  }

  try {
    const referrer = await referrerByCode((await cookies()).get(REF_COOKIE)?.value ?? ref);
    const user = await db.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        createdVia: "signup",
        referredById: referrer?.id ?? null,
        signupAid: aid,
        signupIpHash: await ipHash(),
      },
    });
    await createSession(user);
    await track("signup_done", { userId: user.id, aid, meta: { referred: !!referrer } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "An account with this email already exists. Try signing in." };
    }
    console.error("signUp failed", err);
    return { ok: false, error: "We couldn't create your account. Please try again." };
  }
  redirect(safeNext(next));
}

export async function signIn(input: SignInInput, next?: string): Promise<AuthResult> {
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
      if (!valid) await recordFailure(pairKey, user?.id);
      return { ok: false, error: "Incorrect email or password. Too many failed attempts pause sign-in for a few minutes." };
    }
    reset(pairKey);
    if (user.failedLogins || user.lockedUntil) {
      await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    }
    // Only after the password checks out, so this reveals nothing to a guesser.
    if (!isMember(user.email)) return { ok: false, error: "This account doesn't have access." };
    await createSession(user);
    await track("signin_done", { userId: user.id });
  } catch (err) {
    console.error("signIn failed", err);
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }
  redirect(safeNext(next));
}

/** `field`: the error is about that field (the form marks it). */
export type ChangePasswordResult = { ok: true } | (AuthResult & { field?: "current" });

/**
 * For the signed-in user: checks the current password with the same limits as sign-in (the guesses share sign-in's
 * counters, so neither path gets extra tries), then saves the new hash and deletes every other session in one
 * transaction. This browser stays signed in.
 */
export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  if (await rateLimited("password")) return { ok: false, error: "Too many attempts. Please wait a minute." };
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const me = await getCurrentUser();
    const user = me && (await db.user.findUnique({ where: { id: me.id } }));
    if (!user) return { ok: false, error: "You're signed out. Sign in again to change your password." };
    const pairKey = `signin-fail:${user.email}:${await clientIp()}`;
    const valid = await verifyPassword(parsed.data.current, user.passwordHash);
    const blocked = isLimited(pairKey, PAIR_LIMIT) || (!!user.lockedUntil && user.lockedUntil > new Date());
    if (!valid || blocked) {
      if (!valid) await recordFailure(pairKey, user.id);
      return { ok: false, error: "Current password is incorrect. Too many failed attempts pause this for a few minutes.", field: "current" };
    }
    reset(pairKey);
    const passwordHash = await hashPassword(parsed.data.password);
    const keep = (await currentSessionId()) ?? "";
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } }),
      db.session.deleteMany({ where: { userId: user.id, id: { not: keep } } }),
    ]);
    return { ok: true };
  } catch (err) {
    console.error("changePassword failed", err);
    return { ok: false, error: "We couldn't change your password. Please try again." };
  }
}

export async function signOut() {
  await deleteSession();
  redirect("/");
}
