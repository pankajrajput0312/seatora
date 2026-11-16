import { z } from "zod";
import { shortDate } from "@/features/plans/plans";
import { discountedPrice } from "@/features/referrals/lib";

// Season Pass coupons (docs/PAYMENTS.md "Coupons"): the rules, pure (coupons.test.ts). Reads and writes: service.ts.

export const couponCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "A code is 3–20 letters and digits.");

/** Her price with a coupon, paise: 100% off is 0 (free, no Razorpay); else rounded down to whole rupees, at least ₹1. */
export const couponPrice = (listPaise: number, percentOff: number) => (percentOff >= 100 ? 0 : Math.max(100, discountedPrice(listPaise, percentOff)));

type Coupon = { active: boolean; validUntil: Date | null; maxUses: number | null; uses: number; allowedEmail: string | null; percentOff: number };
/** Signed in: her email, whether she has used this coupon, whether she has any paid payment. */
type Buyer = { email: string; redeemed: boolean; paid: boolean } | null;

/** Why this coupon gives this buyer nothing now, or null. `freeUntil`: FREE_FOR_ALL_UNTIL while ahead (only 100% coupons then). */
export function couponError(c: Coupon, buyer: Buyer, now: Date, freeUntil: Date | null) {
  if (!c.active) return "This coupon isn't valid.";
  if (c.validUntil && c.validUntil <= now) return "This coupon has expired.";
  if (c.maxUses != null && c.uses >= c.maxUses) return "This coupon has been used up.";
  if (buyer && c.allowedEmail && c.allowedEmail !== buyer.email.toLowerCase()) return "This coupon is for another account.";
  if (buyer?.redeemed) return "You've already used this coupon.";
  if (buyer?.paid) return "Your Season Pass is already active.";
  if (freeUntil && c.percentOff < 100) return `This coupon works after ${shortDate(freeUntil)}.`;
  return null;
}

// The admin form (/decide/admin): empty optional fields are null.
const orNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const maxUses = z.preprocess(orNull, z.coerce.number().int().min(1).max(1_000_000).nullable());
const allowedEmail = z.preprocess((v) => orNull(v)?.toLowerCase() ?? null, z.email().max(200).nullable());
/** YYYY-MM-DD: valid through the end of that day in India. */
const validUntil = z.preprocess(orNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((d) => new Date(`${d}T23:59:59.999+05:30`)).nullable());

export const couponCreateSchema = z.object({
  code: couponCodeSchema,
  percentOff: z.coerce.number().int().min(1).max(100),
  maxUses,
  allowedEmail,
  validUntil,
  note: z.string().trim().max(500).default(""),
});

export const couponEditSchema = z.object({
  id: z.string().min(1).max(40),
  maxUses,
  allowedEmail,
  validUntil,
  /** Only from the Activate / Deactivate form, which changes nothing else. */
  active: z.enum(["0", "1"]).optional(),
});
