"use server";

import { getCurrentUser } from "@/features/auth/lib/session";
import { priceFor } from "@/features/payments/service";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";
import { upiSchema } from "./lib";

export type Applied = { ok: true; amount: number; inviter: string | null; coupon: string | null; code: string } | { ok: false; error: string };

/**
 * Checkout's "Have a coupon or invite code?": her price with that code, a coupon first, else a referral code (the order
 * route checks it again and charges). Shows the price only, even for a 100% coupon. 10 tries a minute.
 */
export async function applyCode(code: string): Promise<Applied> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!allow(`ref-apply:${user.id}`, 10, 60_000)) return { ok: false, error: "Too many tries. Wait a minute and try again." };
  const raw = typeof code === "string" ? code.trim().slice(0, 20) : "";
  const q = await priceFor(user.id, raw);
  if (q.error || !(q.couponId || q.referrerId)) return { ok: false, error: q.error ?? "This coupon or invite code isn't valid." };
  return { ok: true, amount: q.amount, inviter: q.inviter, coupon: q.coupon, code: raw.toUpperCase() };
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
