"use server";

import { shortDate } from "./plans";
import { currentPlan, usageToday } from "./usage";

export type PlanChipData = { plan: string; usage: string; title: string };

/** The "Your plan" chip (components/plan-chip.tsx): the plan and today's institutes. Null signed out. */
export async function myPlan(): Promise<PlanChipData | null> {
  try {
    const me = await currentPlan();
    if (!me) return null;
    const { eff, user } = me;
    const used = await usageToday(user.id);
    const plan = user.role === "OWNER" ? "Owner" : user.role === "ADMIN" ? "Admin" : eff.plan === "PREMIUM" ? (eff.freeUntil ? "Free till " + shortDate(eff.freeUntil) : "Season Pass") : "Free";
    const of = (n: number, lim: number) => (lim === Infinity ? `${n}` : `${n}/${lim}`);
    const usage = `${of(used.institutes, eff.limits.institutes)} ${used.institutes === 1 && eff.limits.institutes === Infinity ? "institute" : "institutes"} today`;
    const title = `${plan}. Today: institutes ${of(used.institutes, eff.limits.institutes)}, residents searches ${of(used.residents, eff.limits.residents)}.`;
    return { plan, usage, title };
  } catch (e) {
    console.error("[plans] chip", e);
    return null;
  }
}
