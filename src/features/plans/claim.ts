import "server-only";
import { db } from "@/lib/db";
import { freeNow } from "./plans";

/**
 * "Upgrade to Season Pass, free till 20 Nov": premiumUntil = FREE_FOR_ALL_UNTIL while that is ahead, so she drops back to
 * Free when it passes. Never shortens a later date (a paid or granted pass), so a repeat changes nothing. No payment and
 * no table: a console event is the record. False once the free period is over.
 */
export async function claimFreePass(userId: string, now = new Date()) {
  const until = freeNow(now);
  if (!until) return false;
  const { count } = await db.user.updateMany({ where: { id: userId, OR: [{ premiumUntil: null }, { premiumUntil: { lt: until } }] }, data: { premiumUntil: until } });
  if (count) console.info(JSON.stringify({ event: "free_pass_claimed", userId, until }));
  return true;
}
