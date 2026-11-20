import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isStrayRound, type ReachInput } from "../lib/reach";
import { optionId, rounds, type Allotment, type Category, type Cutoff, type PrevSeat, type Round } from "../types";
import type { Catalog } from "./catalog";

/** Filters pushed into SQL, always with the catalog's exam. `cs` = CollegeSpecialty ids; undefined means no restriction, [] means nothing. */
export type CutoffQuery = { cs?: string[]; quotas?: string[]; categories?: string[]; years?: number[] };
/** `csQuota`: only these (CollegeSpecialty id, quota) pairs (the term filters' options); [] matches nothing. */
/** `quotas`: any of these (NEET SS: her question group's, as a rank is within one group). */
/** `ranks`: any of these ranks (the owner's list of saved ranks). */
export type AllotmentQuery = { cs?: string[]; csQuota?: [string, string][]; year?: number; round?: Round; quota?: string; quotas?: string[]; category?: string; from?: number; to?: number; ranks?: number[] };

/** MCC's remark, from the status: "Allotted" (R1, stray rounds), "Fresh" (a fresh allotment in R2 / R3), "Upgraded" (moved up a seat). */
export const remarkOf = (status: string): Allotment["remark"] => (status === "upgraded" ? "Upgraded" : status === "fresh" ? "Fresh" : "Allotted");

const roundPos = (r: string) => rounds.indexOf(r as Round);
const memCs = (c: { college: string; degree: string; specialty: string }) => `${c.college}~${c.degree}~${c.specialty}`;
const sqlRounds = [...rounds] as string[];
const strayRounds = rounds.filter((r) => isStrayRound(r)) as string[];

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
    Prisma.sql`exam = ${cat.exam}`,
    q.cs && csIn(q.cs),
    q.quotas && Prisma.sql`quota = ANY(${q.quotas})`,
    q.categories && Prisma.sql`category = ANY(${q.categories})`,
    q.years && Prisma.sql`"counsellingYear" = ANY(${q.years})`,
  ].filter((x): x is Prisma.Sql => !!x);
  const rows = await db.$queryRaw<{ cs: string; y: number; r: string; q: string; c: string; o: number; k: number; n: number; s: string }[]>`
    SELECT "collegeSpecialtyId" AS cs, "counsellingYear" AS y, round AS r, quota AS q, category AS c, "openingRank" AS o, "closingRank" AS k, n, "sourceId" AS s
    FROM "Cutoff" WHERE ${Prisma.join(where, " AND ")}`;
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
 * (the later one with its round and seat category) and of each round of the latest year. One row per option from SQL
 * instead of every cutoff (Options, Overview and Institutes label every option in her profile; only a page is built in
 * full).
 */
export async function findReachInputs(
  cat: Catalog,
  q: { cs?: string[]; categories?: string[]; pastYears: [number, number]; latestYear: number; headYear?: number },
): Promise<Map<string, ReachInput[]>> {
  const [y1, y2] = q.pastYears;
  // The year whose deepest row carries its round and category (headlines, the Overview strip): the later past year, or
  // (another exam whose latest year is complete) the latest year.
  const hy = q.headYear ?? y2;
  if (cat.mem) {
    const rows = await findCutoffs(cat, { cs: q.cs, categories: q.categories, years: [y1, y2, q.latestYear] });
    const out = new Map<string, ReachInput[]>();
    for (const c of rows.sort(byYearRound)) (out.get(optionId(c)) ?? out.set(optionId(c), []).get(optionId(c))!).push(c);
    return out;
  }
  if (q.cs?.length === 0) return new Map();
  // bx: the later year's deepest row as "closing|9-round position|round|category", so a plain MAX picks it (ties: the
  // earliest round, as deepestByYear does) without a sort (array_agg ORDER BY spilled to disk: 300 ms vs 50 ms).
  // a, b: R1 to R3; as, bs: the stray rounds, which never make a label "reached" on their own (isStrayRound). c0, c1…:
  // the latest year's rounds (`rounds` order), each its own entry, so a label can leave its newest out (lib/reach.ts).
  const latestCols = rounds.map((r, i) => Prisma.sql`MAX("closingRank") FILTER (WHERE "counsellingYear" = ${q.latestYear} AND round = ${r}) AS ${Prisma.raw(`c${i}`)}`);
  const rows = await db.$queryRaw<({ cs: string; q: string; a: number | null; b: number | null; as: number | null; bs: number | null; bx: string | null } & Record<`c${number}`, number | null>)[]>`
    SELECT "collegeSpecialtyId" AS cs, quota AS q,
      MAX("closingRank") FILTER (WHERE "counsellingYear" = ${y1} AND round <> ALL(${strayRounds})) AS a,
      MAX("closingRank") FILTER (WHERE "counsellingYear" = ${y2} AND round <> ALL(${strayRounds})) AS b,
      MAX("closingRank") FILTER (WHERE "counsellingYear" = ${y1} AND round = ANY(${strayRounds})) AS "as",
      MAX("closingRank") FILTER (WHERE "counsellingYear" = ${y2} AND round = ANY(${strayRounds})) AS bs,
      MAX(lpad("closingRank"::text, 7, '0') || '|' || (9 - array_position(${sqlRounds}::text[], round)) || '|' || round || '|' || category) FILTER (WHERE "counsellingYear" = ${hy}) AS bx,
      ${Prisma.join(latestCols)}
    FROM "Cutoff"
    WHERE exam = ${cat.exam} AND "counsellingYear" = ANY(${[y1, y2, q.latestYear]})
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
    if (r.as != null) list.push({ year: y1, closing: r.as, round: "stray" });
    // bx is the year's deepest of every round: its round and category go on the entry it is (R1 to R3, or a stray round).
    const bx = r.bx != null && Number(r.bx.split("|")[0]);
    const at = { round: round as Round, category: category as Category };
    const head = hy === y2; // bx is the later past year's (NEET PG: always)
    if (r.b != null) list.push({ year: y2, closing: r.b, ...(head && bx === r.b && !isStrayRound(at.round) && at) });
    if (r.bs != null) list.push({ year: y2, closing: r.bs, round: "stray", ...(head && bx === r.bs && isStrayRound(at.round) && at) });
    for (const [i, x] of rounds.entries()) if (r[`c${i}`] != null) list.push({ year: q.latestYear, round: x, closing: r[`c${i}`]!, ...(!head && hy === q.latestYear && x === at.round && bx === r[`c${i}`] && { category: at.category }) });
    out.set(optionId({ ...pair, quota: r.q }), list);
  }
  return out;
}

/**
 * Allotments, newest year first, then round, then rank (then quota and row: NEET SS ranks repeat across question groups,
 * NEET PG's never do, so its order is as before). `total` counts every match (only when `count` is set).
 */
export async function findAllotments(cat: Catalog, q: AllotmentQuery, opts: { limit?: number; offset?: number; count?: boolean } = {}): Promise<{ total: number; rows: Allotment[] }> {
  if (q.cs?.length === 0 || q.csQuota?.length === 0) return { total: 0, rows: [] };
  const offset = opts.offset ?? 0;
  if (cat.mem) {
    const cs = q.cs && new Set(q.cs);
    const csq = q.csQuota && new Set(q.csQuota.map(([c, qu]) => `${c}|${qu}`));
    const all = cat.mem.allotments
      .filter(
        (a) =>
          (!cs || cs.has(memCs(a))) &&
          (!csq || csq.has(`${memCs(a)}|${a.quota}`)) &&
          (!q.year || a.year === q.year) &&
          (!q.round || a.round === q.round) &&
          (!q.quota || a.quota === q.quota) &&
          (!q.quotas || q.quotas.includes(a.quota)) &&
          (!q.category || a.category === q.category) &&
          (!q.from || a.rank >= q.from) &&
          (!q.to || a.rank <= q.to) &&
          (!q.ranks || q.ranks.includes(a.rank)),
      )
      .sort((a, b) => b.year - a.year || roundPos(a.round) - roundPos(b.round) || a.rank - b.rank);
    return { total: all.length, rows: all.slice(offset, opts.limit == null ? undefined : offset + opts.limit) };
  }
  const where = [
    Prisma.sql`exam = ${cat.exam}`,
    q.cs && csIn(q.cs),
    q.csQuota && Prisma.sql`("collegeSpecialtyId", quota) IN (SELECT * FROM unnest(${q.csQuota.map((x) => x[0])}::text[], ${q.csQuota.map((x) => x[1])}::text[]))`,
    q.year && Prisma.sql`"counsellingYear" = ${q.year}`,
    q.round && Prisma.sql`round = ${q.round}`,
    q.quota && Prisma.sql`quota = ${q.quota}`,
    q.quotas && Prisma.sql`quota = ANY(${q.quotas})`,
    q.category && Prisma.sql`category = ${q.category}`,
    q.from && Prisma.sql`rank >= ${q.from}`,
    q.to && Prisma.sql`rank <= ${q.to}`,
    q.ranks && Prisma.sql`rank = ANY(${q.ranks})`,
  ].filter((x): x is Prisma.Sql => !!x);
  const whereSql = Prisma.sql`WHERE ${Prisma.join(where, " AND ")}`;
  const [rows, total] = await Promise.all([
    // Previous seat's college key and course from the joins after the page is cut (the schema 2 columns: raw SQL).
    db.$queryRaw<
      { cs: string; y: number; r: string; k: number; q: string; c: string; st: string; cc: string | null; o: number | null; pk: string | null; pd: string | null; psp: string | null; pq: string | null; pr: string | null }[]
    >`
      SELECT a.*, pc.key AS pk, ps.degree AS pd, ps.code AS psp
      FROM (
        SELECT "collegeSpecialtyId" AS cs, "counsellingYear" AS y, round AS r, rank AS k, quota AS q, category AS c, status AS st,
          "candidateCategory" AS cc, "optionNo" AS o, "prevCollegeId" AS pci, "prevSpecialtyId" AS psi, "prevQuota" AS pq, "prevRemark" AS pr, id
        FROM "Allotment" ${whereSql}
        ORDER BY "counsellingYear" DESC, array_position(${sqlRounds}::text[], round), rank, quota, id
        ${opts.limit == null ? Prisma.empty : Prisma.sql`LIMIT ${opts.limit}`} OFFSET ${offset}
      ) a LEFT JOIN "College" pc ON pc.id = a.pci LEFT JOIN "Specialty" ps ON ps.id = a.psi
      ORDER BY a.y DESC, array_position(${sqlRounds}::text[], a.r), a.k, a.q, a.id`,
    opts.count ? db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Allotment" ${whereSql}`.then(([r]) => r.n) : Promise.resolve(-1),
  ]);
  const out = rows.flatMap((r) => {
    const pair = cat.pairs.get(r.cs);
    if (!pair) return [];
    const prev = r.pk && r.pd && r.pq && r.pr ? { college: r.pk, degree: r.pd, specialty: r.psp ?? "", quota: r.pq, remark: r.pr as PrevSeat["remark"] } : null;
    return [
      {
        rank: r.k,
        category: r.c as Category,
        college: pair.college,
        degree: pair.degree,
        specialty: pair.specialty,
        year: r.y,
        round: r.r as Round,
        quota: r.q,
        remark: remarkOf(r.st),
        status: r.st as Allotment["status"],
        candidateCategory: r.cc,
        optionNo: r.o,
        prev,
      },
    ];
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
    FROM "Allotment" WHERE exam = ${cat.exam} AND ${csIn(cs)} GROUP BY 1, 2, 3, 4`;
  return rows.map((r) => ({ year: r.y, round: r.r as Round, quota: r.q, category: r.c as Category, n: r.n }));
}
