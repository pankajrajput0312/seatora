import "server-only";
import { getCurrentUser } from "@/features/auth/lib/session";
import { isAllowed, parseAllowlist } from "@/lib/site-access";
import { askConfig } from "./config";

/**
 * The signed-in owner (SEATORA_OWNER_EMAILS, as isOwner()) while ASK_ENABLED=1; else null. Every Ask page and the API
 * answer 404 on null, so nobody else learns the feature exists.
 */
export async function askUser() {
  if (!askConfig().enabled) return null;
  const owners = parseAllowlist(process.env.SEATORA_OWNER_EMAILS);
  if (!owners.length) return null;
  const user = await getCurrentUser();
  return user && isAllowed(user.email, owners) ? user : null;
}
