import "server-only";
import { getCurrentUser } from "@/features/auth/lib/session";
import { isAllowed, parseAllowlist } from "@/lib/site-access";
import { askConfig } from "./config";

/**
 * While ASK_ENABLED=1: the signed-in owner (role OWNER, or SEATORA_OWNER_EMAILS as isOwner()), or with ASK_FOR_MEMBERS=1
 * any signed-in member (their plan's daily questions apply, features/plans). Else null. Every Ask page and the API
 * answer 404 on null, so nobody else learns the feature exists.
 */
export async function askUser() {
  if (!askConfig().enabled) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  if (process.env.ASK_FOR_MEMBERS === "1" || user.role === "OWNER") return user;
  return isAllowed(user.email, parseAllowlist(process.env.SEATORA_OWNER_EMAILS)) ? user : null;
}
