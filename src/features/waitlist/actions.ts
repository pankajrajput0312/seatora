"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { allow } from "@/lib/rate-limit";
import { waitlistSchema, type WaitlistInput } from "./validations";

export type WaitlistResult = { ok: true } | { ok: false; error: string };

export async function joinWaitlist(input: WaitlistInput): Promise<WaitlistResult> {
  // x-real-ip is set by Vercel and most proxies and can't be spoofed through them.
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
  // No IP: skip limiting rather than lock every visitor into one shared bucket.
  if (ip && !allow(`waitlist:${ip}`)) return { ok: false, error: "Too many attempts. Please wait a minute and try again." };

  const parsed = waitlistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { website, ...entry } = parsed.data;
  // Pretend success to bots so they don't retry.
  if (website) return { ok: true };

  try {
    // Existing emails are left untouched, so nobody can overwrite someone else's entry.
    await db.waitlistEntry.upsert({ where: { email: entry.email }, create: entry, update: {} });
    return { ok: true };
  } catch (err) {
    console.error("joinWaitlist failed", err);
    return { ok: false, error: "We couldn't save your sign-up. Please try again in a moment." };
  }
}
