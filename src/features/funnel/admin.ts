import "server-only";
import { Prisma } from "@prisma/client";
import { effectivePlan, istDay } from "@/features/plans/plans";
import { db } from "@/lib/db";
import { funnel, STAGE_EVENTS } from "./lib";

// /decide/admin's Funnel, Possible duplicates and Errors (the page checks owner or admin). Counts and emails only.

export const RANGES = { today: "Today", "7d": "7 days", "30d": "30 days", all: "All" } as const;
export type Range = keyof typeof RANGES;

/** Start of a range: 00:00 IST today, 7 or 30 days back, or ever. */
export function rangeStart(range: Range, now = new Date()) {
  if (range === "all") return new Date(0);
  if (range === "today") return new Date(`${istDay(now).day}T00:00:00+05:30`);
  return new Date(now.getTime() - (range === "7d" ? 7 : 30) * 86_400_000);
}

const WHO = Prisma.sql`coalesce("userId", 'aid:' || "aid")`;
/** A UTC timestamp, as the timestamp(3) columns hold them (whatever the session's TimeZone). */
const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
const COUNTED = ["checkout_opened", "checkout_cancelled", "payment_failed", "payment_paid", "referral_link_open", "signup_done"];
type Counts = { events: number; people: number };

/** Everything the Funnel section shows for the range, and the last 14 IST days' funnel. */
export async function funnelReport(range: Range, now = new Date()) {
  const from = rangeStart(range, now);
  const since = utc(from);
  const since14 = utc(rangeStart("today", new Date(now.getTime() - 13 * 86_400_000)));
  // ponytail: the stages' distinct (name, account, device) rows come to the page; count them in SQL past ~100k people.
  const [people, byDay, counts, placements, paywall, paid, earned] = await Promise.all([
    db.$queryRaw<{ name: string; userId: string | null; aid: string | null }[]>`
      SELECT DISTINCT "name", "userId", "aid" FROM "FunnelEvent" WHERE "name" IN (${Prisma.join(STAGE_EVENTS)}) AND "at" >= ${since}`,
    db.$queryRaw<{ day: string; name: string; userId: string | null; aid: string | null }[]>`
      SELECT DISTINCT to_char(("at" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day, "name", "userId", "aid"
      FROM "FunnelEvent" WHERE "name" IN (${Prisma.join(STAGE_EVENTS)}) AND "at" >= ${since14}`,
    db.$queryRaw<({ name: string; refEvents: number; refPeople: number } & Counts)[]>`
      SELECT "name", count(*)::int AS events, count(DISTINCT ${WHO})::int AS people,
        count(*) FILTER (WHERE "meta"->>'referred' = 'true')::int AS "refEvents", count(DISTINCT ${WHO}) FILTER (WHERE "meta"->>'referred' = 'true')::int AS "refPeople"
      FROM "FunnelEvent" WHERE "name" IN (${Prisma.join(COUNTED)}) AND "at" >= ${since} GROUP BY 1`,
    db.$queryRaw<({ placement: string | null } & Counts)[]>`
      SELECT "placement", count(*)::int AS events, count(DISTINCT ${WHO})::int AS people
      FROM "FunnelEvent" WHERE "name" = 'upgrade_click' AND "at" >= ${since} GROUP BY 1 ORDER BY 2 DESC`,
    db.$queryRaw<({ feature: string | null } & Counts)[]>`
      SELECT "meta"->>'feature' AS feature, count(*)::int AS events, count(DISTINCT ${WHO})::int AS people
      FROM "FunnelEvent" WHERE "name" = 'paywall_shown' AND "at" >= ${since} GROUP BY 1 ORDER BY 2 DESC`,
    db.payment.aggregate({ where: { status: "paid", paidAt: { gte: from } }, _sum: { amount: true } }),
    db.referralEarning.aggregate({ where: { status: { not: "void" }, createdAt: { gte: from } }, _sum: { amount: true } }),
  ]);
  const of = (name: string): Counts => counts.find((r) => r.name === name) ?? { events: 0, people: 0 };
  const referred = (name: string): Counts => {
    const r = counts.find((x) => x.name === name);
    return { events: r?.refEvents ?? 0, people: r?.refPeople ?? 0 };
  };
  const days = [...new Set(byDay.map((r) => r.day))].sort().reverse();
  return {
    stages: funnel(people),
    placements,
    paywall,
    checkout: {
      opened: of("checkout_opened"),
      cancelled: of("checkout_cancelled"),
      failed: of("payment_failed"),
      paid: of("payment_paid"),
      revenue: paid._sum.amount ?? 0,
    },
    referrals: { opens: of("referral_link_open"), signups: referred("signup_done"), paid: referred("payment_paid"), earnings: earned._sum.amount ?? 0 },
    days: days.map((day) => ({ day, stages: funnel(byDay.filter((r) => r.day === day)) })),
  };
}

/**
 * Accounts that look like one person: the same sign-up device (seatora_aid), or the same network (hashed IP) with
 * sign-ups within 24 hours of each other. Newest first, 30 groups. Nothing is done to them automatically.
 */
export async function possibleDuplicates() {
  const groups = await db.$queryRaw<{ via: "device" | "network"; ids: string[]; latest: Date }[]>`
    SELECT 'device' AS via, array_agg("id" ORDER BY "createdAt") AS ids, max("createdAt") AS latest FROM "User"
    WHERE "signupAid" IS NOT NULL GROUP BY "signupAid" HAVING count(*) > 1
    UNION ALL
    SELECT 'network', array_agg(u."id" ORDER BY u."createdAt"), max(u."createdAt") FROM "User" u
    WHERE u."signupIpHash" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "User" v WHERE v."signupIpHash" = u."signupIpHash" AND v."id" <> u."id"
        AND v."createdAt" BETWEEN u."createdAt" - interval '24 hours' AND u."createdAt" + interval '24 hours')
    GROUP BY u."signupIpHash"
    ORDER BY 3 DESC LIMIT 30`;
  // The same accounts by device and by network: show once, as a device group.
  const seen = new Set<string>();
  const unique = groups.filter((g) => {
    const key = [...g.ids].sort().join();
    return !seen.has(key) && !!seen.add(key);
  });
  const users = await db.user.findMany({
    where: { id: { in: unique.flatMap((g) => g.ids) } },
    select: { id: true, email: true, createdAt: true, role: true, premiumUntil: true, payments: { where: { status: "paid" }, select: { id: true }, take: 1 } },
  });
  const byId = new Map(users.map((u) => [u.id, { ...u, plan: effectivePlan(u), paid: u.payments.length > 0 }]));
  return unique.map((g) => ({ via: g.via, users: g.ids.flatMap((id) => byId.get(id) ?? []) }));
}

/** Open error groups seen in the last 7 days, most frequent first (50). */
export const recentErrors = (now = new Date()) =>
  db.errorGroup.findMany({ where: { resolvedAt: null, lastAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, orderBy: [{ count: "desc" }, { lastAt: "desc" }], take: 50 });
