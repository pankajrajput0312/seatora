"use server";

import { getCurrentUser } from "@/features/auth/lib/session";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";
import { upiSchema } from "./lib";
import { quote } from "./service";

export type Applied = { ok: true; amount: number; inviter: string; code: string } | { ok: false; error: string };

/** Checkout's "Have a referral code?": her price with that code (the order route checks it again). 10 tries a minute. */
export async function applyReferralCode(code: string): Promise<Applied> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!allow(`ref-apply:${user.id}`, 10, 60_000)) return { ok: false, error: "Too many tries. Wait a minute and try again." };
  const q = await quote(user.id, typeof code === "string" ? code.slice(0, 20) : "");
  return q.referrerId && q.inviter ? { ok: true, amount: q.amount, inviter: q.inviter, code: code.trim().toUpperCase() } : { ok: false, error: q.error ?? "That referral code isn't valid." };
}

/** /decide/refer's UPI ID form (components/upi-form.tsx). */
export async function savePayoutUpi(raw: string): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in again to save your UPI ID." };
  const upi = upiSchema.safeParse(raw);
  if (!upi.success) return { ok: false, message: upi.error.issues[0]?.message ?? "Enter a UPI ID like name@bank" };
  await db.user.update({ where: { id: user.id }, data: { payoutUpi: upi.data } });
  return { ok: true, message: "UPI ID saved." };
}
