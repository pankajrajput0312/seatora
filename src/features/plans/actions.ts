"use server";

import { getCurrentUser } from "@/features/auth/lib/session";
import { claimFreePass } from "./claim";
import { passState, shortDate } from "./plans";
import { currentPlan, usageToday } from "./usage";

/** `upgrade`: the chip's pill ("Upgrade free" in the free period, "Upgrade" after), null when she has the Season Pass. */
export type PlanChipData = { plan: string; usage: string; title: string; upgrade: string | null };

/** The "Your plan" chip (components/plan-chip.tsx): the plan and today's institutes. Null signed out. */
export async function myPlan(): Promise<PlanChipData | null> {
  try {
    const me = await currentPlan();
    if (!me) return null;
    const { eff, user } = me;
    const used = await usageToday(user.id);
    const s = passState(user);
    const plan = {
      staff: user.role === "OWNER" ? "Owner" : "Admin",
      pass: "Season Pass",
      claimed: `Season Pass · free till ${shortDate(s.until ?? new Date())}`,
      claimable: `Free till ${shortDate(s.until ?? new Date())}`,
      free: "Free",
    }[s.state];
    const of = (n: number, lim: number) => (lim === Infinity ? `${n}` : `${n}/${lim}`);
    const usage = `${of(used.institutes, eff.limits.institutes)} ${used.institutes === 1 && eff.limits.institutes === Infinity ? "institute" : "institutes"} today`;
    const title = `${plan}. Today: institutes ${of(used.institutes, eff.limits.institutes)}, residents searches ${of(used.residents, eff.limits.residents)}.`;
    return { plan, usage, title, upgrade: s.state === "claimable" ? "Upgrade free" : s.state === "free" ? "Upgrade" : null };
  } catch (e) {
    console.error("[plans] chip", e);
    return null;
  }
}

/** "Upgrade to Season Pass, free till 20 Nov" (claim.ts). No input. */
export async function claimFreeSeasonPass(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to upgrade." };
  return (await claimFreePass(user.id)) ? { ok: true } : { ok: false, error: "The free period has ended." };
}
