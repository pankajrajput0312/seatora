import "server-only";
import { getCurrentUser } from "@/features/auth/lib/session";
import { db } from "@/lib/db";
import { COUNTED, effectivePlan, istDay, type Account, type Capped, type Counted, type Effective } from "./plans";

// Usage counting, in Postgres so every server instance shares it. Server-side only: nothing the browser sends is trusted.
// UsageDaily: one atomic upsert per use. UsageDistinct (institutes): one row per thing opened per day. Both are keyed by
// a subject: a user id, or "aid:<device>" for the Free plan's per-device count.

/** `device`: refused because this device (seatora_aid) has used today's Free allowance across its accounts. */
export type Check = { allowed: boolean; used: number; limit: number; resetAt: Date; device?: boolean };
const SQL_MAX = 2_147_483_647; // Infinity in an INTEGER comparison

const accountOf = (userId: string) => db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, premiumUntil: true } });

/**
 * Counts one use of `feature` today (IST) if it is within the account's plan; `key` makes it a distinct count (opening
 * the same institute again is free and always allowed). Over the limit nothing is counted. `account`: the user's role
 * and premiumUntil when the caller already has them (saves a read).
 * `aid` (the seatora_aid cookie): on the Free plan the device is counted too, as the subject "aid:<aid>" with the same
 * limits, so free accounts on one browser share one allowance. Premium (paid, claimed, the free period) and staff never are.
 */
export async function checkAndCount(userId: string, feature: Counted, key?: string, opts: { account?: Account; now?: Date; aid?: string | null } = {}): Promise<Check> {
  const now = opts.now ?? new Date();
  const account = opts.account ?? (await accountOf(userId));
  const eff = effectivePlan(account, now);
  if (opts.aid && eff.plan === "FREE") {
    // ponytail: the device goes first, so a use the device refuses counts for neither; one the account then refuses
    // still spends a device slot (one account at its own cap, on a second device). One SQL statement if that matters.
    const d = await checkAndCount(`aid:${opts.aid}`, feature, key, { account, now });
    if (!d.allowed) return { ...d, device: true };
  }
  const limit = eff.limits[feature];
  const { day, resetAt } = istDay(now);
  const cap = Math.min(limit, SQL_MAX);
  if (key !== undefined) {
    // ponytail: count-then-insert lets two parallel first views past the last slot (limit + 1); fine for page views.
    const [r] = await db.$queryRaw<{ inserted: bigint; seen: boolean; used: bigint }[]>`
      WITH cur AS (SELECT count(*) AS n FROM "UsageDistinct" WHERE "userId" = ${userId} AND "day" = ${day}::date AND "feature" = ${feature}),
      ins AS (
        INSERT INTO "UsageDistinct" ("userId", "day", "feature", "key")
        SELECT ${userId}, ${day}::date, ${feature}, ${key} WHERE (SELECT n FROM cur) < ${cap}
        ON CONFLICT DO NOTHING RETURNING 1
      )
      SELECT (SELECT count(*) FROM ins) AS inserted,
        EXISTS (SELECT 1 FROM "UsageDistinct" WHERE "userId" = ${userId} AND "day" = ${day}::date AND "feature" = ${feature} AND "key" = ${key}) AS seen,
        (SELECT n FROM cur) AS used`;
    const inserted = Number(r.inserted) > 0;
    return { allowed: inserted || r.seen, used: Number(r.used) + (inserted ? 1 : 0), limit, resetAt };
  }
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "UsageDaily" ("userId", "day", "feature", "count") SELECT ${userId}, ${day}::date, ${feature}, 1 WHERE ${cap} > 0
    ON CONFLICT ("userId", "day", "feature") DO UPDATE SET "count" = "UsageDaily"."count" + 1 WHERE "UsageDaily"."count" < ${cap}
    RETURNING "count"`;
  if (rows.length) return { allowed: true, used: rows[0].count, limit, resetAt };
  return { allowed: false, used: (await usageToday(userId, now))[feature], limit, resetAt };
}

/** Today's (IST) counts per counted feature. */
export async function usageToday(userId: string, now = new Date()): Promise<Record<Counted, number>> {
  const { day } = istDay(now);
  const rows = await db.$queryRaw<{ feature: string; n: bigint }[]>`
    SELECT "feature", "count"::bigint AS n FROM "UsageDaily" WHERE "userId" = ${userId} AND "day" = ${day}::date
    UNION ALL SELECT "feature", count(*) FROM "UsageDistinct" WHERE "userId" = ${userId} AND "day" = ${day}::date GROUP BY "feature"`;
  const out = Object.fromEntries(COUNTED.map((f) => [f, 0])) as Record<Counted, number>;
  for (const r of rows) if (r.feature in out) out[r.feature as Counted] = Number(r.n);
  return out;
}

/** The signed-in user and the plan they get now; null signed out. */
export async function currentPlan(now = new Date()): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; eff: Effective } | null> {
  const user = await getCurrentUser();
  return user && { user, eff: effectivePlan(user, now) };
}

/** A cap of the signed-in user's plan (csv, compare, reports, choiceLists); 0 signed out. */
export async function planCap(feature: Capped) {
  return (await currentPlan())?.eff.limits[feature] ?? 0;
}

/** A cap of a user's plan by id (tools that only have the id). */
export async function planCapFor(userId: string, feature: Capped) {
  return effectivePlan(await accountOf(userId)).limits[feature];
}

/** 403 for an API route whose feature the plan doesn't include. */
export const planRequired = (what: string) =>
  Response.json(
    { ok: false, error: { code: "plan_required", message: `${what} is part of the Seatora Season Pass. See /pricing.` } },
    { status: 403, headers: { "Cache-Control": "private, no-store" } },
  );
