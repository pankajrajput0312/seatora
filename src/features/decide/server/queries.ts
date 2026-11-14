import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ReachInput } from "../lib/reach";
import { optionId, rounds, type Allotment, type Category, type Cutoff, type Round } from "../types";
import type { Catalog } from "./catalog";

/** Filters pushed into SQL. `cs` = CollegeSpecialty ids; undefined means no restriction, [] means nothing. */
export type CutoffQuery = { cs?: string[]; quotas?: string[]; categories?: string[]; years?: number[] };
export type AllotmentQuery = { cs?: string[]; year?: number; round?: Round; quota?: string; category?: string; from?: number; to?: number };

/** MCC remark for the UI: R1/stray "allotted" and R2/R3 "fresh" are fresh allotments; "upgraded" moved up a seat. */
export const remarkOf = (status: string): Allotment["remark"] => (status === "upgraded" ? "Upgraded" : "Fresh");

const roundPos = (r: string) => rounds.indexOf(r as Round);
const memCs = (c: { college: string; degree: string; specialty: string }) => `${c.college}~${c.degree}~${c.specialty}`;
const sqlRounds = [...rounds] as string[];

const byYearRound = (a: Cutoff, b: Cutoff) => a.year - b.year || roundPos(a.round) - roundPos(b.round);

/**
 * "collegeSpecialtyId" IN ($1, …, $n), not = ANY($1): Postgres moves a prepared statement to a generic plan after five
 * runs, and for ANY($1) that plan assumes a short array, so her ~1,300-id read went from 30 to 120 ms once pages had
 * run it with 25 ids. A bound list tells even the generic plan how long it is.
 */
const csIn = (cs: string[]) => Prisma.sql`"collegeSpecialtyId" IN (${Prisma.join(cs)})`;

/** Cutoffs ordered by year, then round, so ties keep the earliest round. Sorted here, not in SQL (cheaper). */
export async function findCutoffs(cat: Catalog, q: CutoffQuery): Promise<Cutoff[]> {
  if (q.cs?.length === 0) return [];
  if (cat.mem) {
    const cs = q.cs && new Set(q.cs);
    return cat.mem.cutoffs.filter(
      (c) =>
        (!cs || cs.has(memCs(c))) &&
        (!q.quotas || q.quotas.includes(c.quota)) &&
        (!q.categories || q.categories.includes(c.category)) &&
        (!q.years || q.years.includes(c.year)),
    );
  }
  const where = [
    q.cs && csIn(q.cs),
    q.quotas && Prisma.sql`quota = ANY(${q.quotas})`,
    q.categories && Prisma.sql`category = ANY(${q.categories})`,
    q.years && Prisma.sql`"counsellingYear" = ANY(${q.years})`,
  ].filter((x): x is Prisma.Sql => !!x);
  const rows = await db.$queryRaw<{ cs: string; y: number; r: string; q: string; c: string; o: number; k: number; n: number; s: string }[]>`
    SELECT "collegeSpecialtyId" AS cs, "counsellingYear" AS y, round AS r, quota AS q, category AS c, "openingRank" AS o, "closingRank" AS k, n, "sourceId" AS s
    FROM "Cutoff" ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, " AND ")}` : Prisma.empty}`;
  return rows
    .flatMap((r) => {
      const pair = cat.pairs.get(r.cs);
      const src = cat.sourceById.get(r.s);
      if (!pair || !src) return [];
      return [{ college: pair.college, degree: pair.degree, specialty: pair.specialty, year: r.y, round: r.r as Round, quota: r.q, category: r.c as Category, opening: r.o, closing: r.k, n: r.n, src: src.key }];
    })
    .sort(byYearRound);
}

/**
 * Reach-label inputs per option id: in her seat categories (all when omitted), the deepest closing of each past year
 * (the later one with its round and seat category) and of the latest year's R1. One row per option from SQL instead
 * of every cutoff (Options, Overview and Institutes label every option in her profile; only a page is built in full).
 */
export async function findReachInputs(
  cat: Catalog,
  q: { cs?: string[]; categories?: string[]; pastYears: [number, number]; latestYear: number },
): Promise<Map<string, ReachInput[]>> {
  const [y1, y2] = q.pastYears;
  if (cat.mem) {
    const rows = await findCutoffs(cat, { cs: q.cs, categories: q.categories, years: [y1, y2, q.latestYear] });
    const out = new Map<string, ReachInput[]>();
    for (const c of rows.sort(byYearRound)) (out.get(optionId(c)) ?? out.set(optionId(c), []).get(optionId(c))!).push(c);
    return out;
  }
  if (q.cs?.length === 0) return new Map();
  // bx: the later year's deepest row as "closing|9-round position|round|category", so a plain MAX picks it (ties: the
  // earliest round, as deepestByYear does) without a sort (array_agg ORDER BY spilled to disk: 300 ms vs 50 ms).
  const rows = await db.$queryRaw<{ cs: string; q: string; a: number | null; b: number | null; bx: string | null; c: number | null }[]>`
    SELECT "collegeSpecialtyId" AS cs, quota AS q,
      MAX("closingRank") FILTER (WHERE "counsellingYear" = ${y1}) AS a,
      MAX("closingRank") FILTER (WHERE "counsellingYear" = ${y2}) AS b,
      MAX(lpad("closingRank"::text, 7, '0') || '|' || (9 - array_position(${sqlRounds}::text[], round)) || '|' || round || '|' || category) FILTER (WHERE "counsellingYear" = ${y2}) AS bx,
      MAX("closingRank") FILTER (WHERE "counsellingYear" = ${q.latestYear} AND round = 'R1') AS c
    FROM "Cutoff"
    WHERE "counsellingYear" = ANY(${[y1, y2, q.latestYear]})
      ${q.categories ? Prisma.sql`AND category = ANY(${q.categories})` : Prisma.empty}
      ${q.cs ? Prisma.sql`AND ${csIn(q.cs)}` : Prisma.empty}
    GROUP BY 1, 2`;
  const out = new Map<string, ReachInput[]>();
  for (const r of rows) {
    const pair = cat.pairs.get(r.cs);
    if (!pair) continue;
    const list: ReachInput[] = [];
    if (r.a != null) list.push({ year: y1, closing: r.a });
    const [, , round, category] = r.bx?.split("|") ?? [];
    if (r.b != null) list.push({ year: y2, closing: r.b, round: round as Round, category: category as Category });
    if (r.c != null) list.push({ year: q.latestYear, round: "R1", closing: r.c });
    out.set(optionId({ ...pair, quota: r.q }), list);
  }
  return out;
}

/** Allotments, newest year first, then round, then rank. `total` counts every match (only when `count` is set). */
export async function findAllotments(cat: Catalog, q: AllotmentQuery, opts: { limit?: number; offset?: number; count?: boolean } = {}): Promise<{ total: number; rows: Allotment[] }> {
  if (q.cs?.length === 0) return { total: 0, rows: [] };
  const offset = opts.offset ?? 0;
  if (cat.mem) {
    const cs = q.cs && new Set(q.cs);
    const all = cat.mem.allotments
      .filter(
        (a) =>
          (!cs || cs.has(memCs(a))) &&
          (!q.year || a.year === q.year) &&
          (!q.round || a.round === q.round) &&
          (!q.quota || a.quota === q.quota) &&
          (!q.category || a.category === q.category) &&
          (!q.from || a.rank >= q.from) &&
          (!q.to || a.rank <= q.to),
      )
      .sort((a, b) => b.year - a.year || roundPos(a.round) - roundPos(b.round) || a.rank - b.rank);
    return { total: all.length, rows: all.slice(offset, opts.limit == null ? undefined : offset + opts.limit) };
  }
  const where = [
    q.cs && csIn(q.cs),
    q.year && Prisma.sql`"counsellingYear" = ${q.year}`,
    q.round && Prisma.sql`round = ${q.round}`,
    q.quota && Prisma.sql`quota = ${q.quota}`,
    q.category && Prisma.sql`category = ${q.category}`,
    q.from && Prisma.sql`rank >= ${q.from}`,
    q.to && Prisma.sql`rank <= ${q.to}`,
  ].filter((x): x is Prisma.Sql => !!x);
  const whereSql = where.length ? Prisma.sql`WHERE ${Prisma.join(where, " AND ")}` : Prisma.empty;
  const [rows, total] = await Promise.all([
    db.$queryRaw<{ cs: string; y: number; r: string; k: number; q: string; c: string; st: string }[]>`
      SELECT "collegeSpecialtyId" AS cs, "counsellingYear" AS y, round AS r, rank AS k, quota AS q, category AS c, status AS st
      FROM "Allotment" ${whereSql}
      ORDER BY "counsellingYear" DESC, array_position(${sqlRounds}::text[], round), rank
      ${opts.limit == null ? Prisma.empty : Prisma.sql`LIMIT ${opts.limit}`} OFFSET ${offset}`,
    opts.count ? db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Allotment" ${whereSql}`.then(([r]) => r.n) : Promise.resolve(-1),
  ]);
  const out = rows.flatMap((r) => {
    const pair = cat.pairs.get(r.cs);
    if (!pair) return [];
    return [{ rank: r.k, category: r.c as Category, college: pair.college, degree: pair.degree, specialty: pair.specialty, year: r.y, round: r.r as Round, quota: r.q, remark: remarkOf(r.st) }];
  });
  return { total: opts.count ? total : out.length + offset, rows: out };
}

export type AllotmentCount = { year: number; round: Round; quota: string; category: Category; n: number };

/** Allotments made (rows of MCC's results, not seats) per year, round, quota and seat category, for these CollegeSpecialty ids. */
export async function countAllotments(cat: Catalog, cs: string[]): Promise<AllotmentCount[]> {
  if (!cs.length) return [];
  if (cat.mem) {
    const ids = new Set(cs);
    const out = new Map<string, AllotmentCount>();
    for (const a of cat.mem.allotments) {
      if (!ids.has(memCs(a))) continue;
      const k = [a.year, a.round, a.quota, a.category].join("|");
      (out.get(k) ?? out.set(k, { year: a.year, round: a.round, quota: a.quota, category: a.category, n: 0 }).get(k)!).n++;
    }
    return [...out.values()];
  }
  const rows = await db.$queryRaw<{ y: number; r: string; q: string; c: string; n: number }[]>`
    SELECT "counsellingYear" AS y, round AS r, quota AS q, category AS c, COUNT(*)::int AS n
    FROM "Allotment" WHERE ${csIn(cs)} GROUP BY 1, 2, 3, 4`;
  return rows.map((r) => ({ year: r.y, round: r.r as Round, quota: r.q, category: r.c as Category, n: r.n }));
}
