import "server-only";
import type { Plan } from "./plans";

/**
 * What a paid plan unlocks. Called once per payment, by whichever of verify or the webhook marks it paid first.
 * For now the Payment row (status paid) is the record of access; hasPaid() reads it.
 */
export async function grantPlan(userId: string, plan: Plan) {
  // TODO: premiumUntil will be set on merge with the User.role/User.premiumUntil branch.
  console.info(JSON.stringify({ event: "plan_granted", userId, plan }));
}
