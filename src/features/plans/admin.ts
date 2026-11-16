import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { effectivePlan, istDay, type Role } from "./plans";

// Reads for /decide/admin (owner and admins only; the page checks). Counts and emails, never residents' names.

export const ADMIN_PAGE_SIZE = 50;
/** Days of history in the totals. */
const DAYS = 14;

/** One page of accounts, newest first; `q` matches email or name (any case). With today's usage and last activity. */
export async function listUsers(q: string | undefined, page: number, now = new Date()) {
  const where: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {};
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: { id: true, email: true, name: true, role: true, premiumUntil: true, createdAt: true, notes: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
    }),
  ]);
  const ids = users.map((u) => u.id);
  const { day } = istDay(now);
  const [sessions, usage] = ids.length
    ? await Promise.all([
        db.session.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { createdAt: true } }),
        db.$queryRaw<{ userId: string; feature: string; today: bigint | null; last: Date }[]>`
          SELECT "userId", "feature", sum("count") FILTER (WHERE "day" = ${day}::date)::bigint AS today, max("day") AS last
          FROM "UsageDaily" WHERE "userId" IN (${Prisma.join(ids)}) GROUP BY 1, 2
          UNION ALL SELECT "userId", "feature", count(*) FILTER (WHERE "day" = ${day}::date), max("day")
          FROM "UsageDistinct" WHERE "userId" IN (${Prisma.join(ids)}) GROUP BY 1, 2`,
      ])
    : [[], []];
  const signedIn = new Map(sessions.map((s) => [s.userId, s._max.createdAt]));
  return {
    total,
    rows: users.map((u) => {
      const mine = usage.filter((x) => x.userId === u.id);
      const lastUse = mine.reduce<Date | null>((a, x) => (!a || x.last > a ? x.last : a), null);
      const lastSignIn = signedIn.get(u.id) ?? null;
      const counts = Object.fromEntries(mine.map((x) => [x.feature, Number(x.today ?? 0)]));
      return {
        ...u,
        plan: effectivePlan(u, now),
        lastActive: [lastUse, lastSignIn].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
        today: counts,
      };
    }),
  };
}

/** Totals for the last DAYS IST days: accounts by role, sign-ups per day, uses per feature per day, Ask tokens and cost per day. */
export async function adminTotals() {
  const [byRole, signups, usage, ask] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    db.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*) AS n FROM "User"
      WHERE "createdAt" >= (now() AT TIME ZONE 'UTC') - make_interval(days => ${DAYS}::int) GROUP BY 1 ORDER BY 1 DESC`,
    db.$queryRaw<{ day: Date; feature: string; n: bigint; users: bigint }[]>`
      SELECT "day", "feature", sum("count")::bigint AS n, count(*) AS users FROM "UsageDaily" WHERE "day" >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ${DAYS}::int AND "userId" NOT LIKE 'aid:%' GROUP BY 1, 2
      UNION ALL SELECT "day", "feature", count(*), count(DISTINCT "userId") FROM "UsageDistinct" WHERE "day" >= (now() AT TIME ZONE 'Asia/Kolkata')::date - ${DAYS}::int AND "userId" NOT LIKE 'aid:%' GROUP BY 1, 2
      ORDER BY 1 DESC, 2`,
    db.$queryRaw<{ day: Date; runs: bigint; input: bigint; output: bigint; cacheRead: bigint; cacheWrite: bigint }[]>`
      SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*) AS runs, sum("inputTokens")::bigint AS input,
        sum("outputTokens")::bigint AS output, sum("cacheReadTokens")::bigint AS "cacheRead", sum("cacheWriteTokens")::bigint AS "cacheWrite"
      FROM "AskLog" WHERE "createdAt" >= (now() AT TIME ZONE 'UTC') - make_interval(days => ${DAYS}::int) GROUP BY 1 ORDER BY 1 DESC`,
  ]);
  return {
    byRole: Object.fromEntries(byRole.map((r) => [r.role, r._count._all])) as Partial<Record<Role, number>>,
    signups: signups.map((r) => ({ day: r.day, n: Number(r.n) })),
    usage: usage.map((r) => ({ day: r.day, feature: r.feature, n: Number(r.n), users: Number(r.users) })),
    ask: ask.map((r) => {
      const t = { runs: Number(r.runs), input: Number(r.input), output: Number(r.output), cacheRead: Number(r.cacheRead), cacheWrite: Number(r.cacheWrite) };
      return { day: r.day, ...t, usd: askCostUsd(t) };
    }),
  };
}

/** List prices (docs/ASK_SEATORA.md "Cost"): $4 in, $20 out, $0.20 cache read, $5 cache write per million tokens. */
export const askCostUsd = (t: { input: number; output: number; cacheRead: number; cacheWrite: number }) =>
  (t.input * 4 + t.output * 20 + t.cacheRead * 0.2 + t.cacheWrite * 5) / 1e6;
