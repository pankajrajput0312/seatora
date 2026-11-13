"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";
import { hashPassword, verifyPassword } from "./lib/password";
import { createSession, deleteSession } from "./lib/session";
import { signInSchema, signUpSchema, type SignInInput, type SignUpInput } from "./validations";

export type AuthResult = { ok: false; error: string };

async function rateLimited(kind: string) {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip ? !allow(`${kind}:${ip}`, 10) : false;
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
    // Same message for unknown email and wrong password.
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return { ok: false, error: "Incorrect email or password." };
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
