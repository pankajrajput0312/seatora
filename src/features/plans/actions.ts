"use server";

import { getCurrentUser } from "@/features/auth/lib/session";
import { claimFreePass } from "./claim";

/** "Upgrade to Season Pass, free till 20 Nov" (claim.ts). No input. */
export async function claimFreeSeasonPass(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to upgrade." };
  return (await claimFreePass(user.id)) ? { ok: true } : { ok: false, error: "The free period has ended." };
}
