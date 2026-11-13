"use server";

import { db } from "@/lib/db";
import { waitlistSchema, type WaitlistInput } from "./validations";

export type WaitlistResult = { ok: true } | { ok: false; error: string };

export async function joinWaitlist(input: WaitlistInput): Promise<WaitlistResult> {
  const parsed = waitlistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { website, ...entry } = parsed.data;
  // Pretend success to bots so they don't retry.
  if (website) return { ok: true };

  try {
    // Re-joining with the same email just updates the year; no duplicate error for the user.
    await db.waitlistEntry.upsert({
      where: { email: parsed.data.email },
      create: entry,
      update: { examYear: entry.examYear },
    });
    return { ok: true };
  } catch (err) {
    console.error("joinWaitlist failed", err);
    return { ok: false, error: "We couldn't save your sign-up. Please try again in a moment." };
  }
}
