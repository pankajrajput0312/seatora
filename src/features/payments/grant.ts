import "server-only";
import type { Prisma } from "@prisma/client";
import type { Plan } from "./plans";

// The Season Pass runs to the end of the counselling season (env override for a later season).
export const SEASON_PASS_UNTIL = new Date(process.env.SEASON_PASS_UNTIL || "2027-03-31T23:59:59+05:30");

/**
 * What a paid plan unlocks: Premium until the season ends (User.premiumUntil, read by effectivePlan). Runs in the same
 * transaction that marks the payment paid, once per payment. Never shortens a later date set on the admin page.
 */
export async function grantPlan(userId: string, plan: Plan, tx: Prisma.TransactionClient) {
  if (plan !== "season_pass") return;
  await tx.user.updateMany({
    where: { id: userId, OR: [{ premiumUntil: null }, { premiumUntil: { lt: SEASON_PASS_UNTIL } }] },
    data: { premiumUntil: SEASON_PASS_UNTIL },
  });
  console.info(JSON.stringify({ event: "plan_granted", userId, plan }));
}
