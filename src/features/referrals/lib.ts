import { z } from "zod";

// The referral program (docs/REFERRALS.md): a friend who comes through her link gets 20% off her first Season Pass, and
// she gets 20% of what the friend actually paid, sent to her UPI. Pure, so tested (lib.test.ts).

export const REFERRAL_PERCENT = 20;
/** Set by /r/CODE: the code, for sign-up and checkout. httpOnly, 30 days. */
export const REF_COOKIE = "seatora_ref";
export const REF_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;

/** Codes are 6–8 of these (no 0/O, 1/I/L), so they read out and type cleanly. The DB has the same CHECK. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const referralCodeSchema = z.string().trim().toUpperCase().regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6,8}$/, "That referral code isn't valid.");

export const upiSchema = z
  .string()
  .trim()
  .max(100)
  .regex(/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,63}$/, "Enter a UPI ID like name@bank");

/** The friend's price: 20% off the list price, rounded down to whole rupees (49900 → 39900 paise). */
export const discountedPrice = (listPaise: number) => Math.floor((listPaise * (100 - REFERRAL_PERCENT)) / 10_000) * 100;

/** The referrer's share: 20% of what was actually paid, rounded down to the paisa (39900 → 7980). */
export const earningFor = (paidPaise: number) => Math.floor((paidPaise * REFERRAL_PERCENT) / 100);

/** ₹399, ₹79.80, ₹1,596. */
export const formatPaise = (p: number) =>
  `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "Rahul" from "Rahul Sharma": all a friend ever sees of the referrer (never the email). */
export const firstName = (name: string) => name.trim().split(/\s+/)[0]?.slice(0, 30) || "A friend";
