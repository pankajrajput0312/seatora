import "server-only";
import { Prisma } from "@prisma/client";
import { DEFAULT_EXAM, type ExamKey } from "@/features/exams/keys";
import { exams } from "@/features/exams/registry";
import { db } from "@/lib/db";
import type { PageQuery, Paged } from "../service";
import { optionId, rounds, seatKinds, type College, type Course, type MccNotice, type Round, type SeatKind, type SeatList } from "../types";
import { dataVersion, getCatalog, perImport, type Catalog } from "./catalog";
import { categoryOrder, roundKey, seatRoundRows, snapshotAt, type SeatDbRow } from "./snapshot";

// MCC seat lists (SeatSource + SeatCount, prisma/import-mcc.ts). Each list is one kind of one round as its PDF printed
// it; kinds overlap, so everything here works on one kind at a time and never adds kinds together. One exam's lists
// (their DataSource's exam), default NEET PG.

/** Every seat list PDF of the exam: newest year and round first, then kind (clear, virtual, new), then newest PDF. */
export const seatLists = (exam: ExamKey = DEFAULT_EXAM) => listsOnce("", exam);
const listsOnce = perImport(async (_, exam): Promise<SeatList[]> => {
  const rows = await db.seatSource.findMany({ where: { source: { exam } }, select: { year: true, round: true, kind: true, total: true, source: { select: { key: true, name: true, url: true, publishedAt: true } } } });
  // INI-CET: each list's seats on the quotas its seat position notifies apart (Sponsored / Foreign National).
  const apartQuotas = exams[exam].apartQuotas?.quotas;
  const apart = apartQuotas
    ? new Map((await db.$queryRaw<{ key: string; n: number }[]>`
        SELECT d.key, SUM(x.seats)::int AS n FROM "SeatCount" x JOIN "DataSource" d ON d.id = x."seatSourceId"
        WHERE d.exam = ${exam} AND x.quota = ANY(${apartQuotas}) GROUP BY 1`).map((r) => [r.key, r.n]))
    : null;
  return rows
    .map(({ source: s, ...l }) => ({ key: s.key, name: s.name, url: s.url, year: l.year, round: l.round as Round, kind: l.kind as SeatKind, publishedAt: s.publishedAt?.toISOString().slice(0, 10) ?? null, seats: l.total, ...(apart && { apart: apart.get(s.key) ?? 0 }) }))
    .sort(
      (a, b) =>
        b.year - a.year ||
        rounds.indexOf(b.round) - rounds.indexOf(a.round) ||
        seatKinds.indexOf(a.kind) - seatKinds.indexOf(b.kind) ||
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") ||
        a.key.localeCompare(b.key),
    );
});

/**
 * The lists a filter means: `list` (a SeatList key) exactly; else one kind (default clear vacancy) of the newest
 * year/round matching `year`/`round`. Usually one PDF; a round can have two of a kind (2025 R2 newly added seats: two
 * dated lists), which stay separate lists. `all` in seatLists() order.
 */
export function pickLists(all: SeatList[], f: { list?: string; kind?: SeatKind; year?: number; round?: Round }): SeatList[] {
  if (f.list) return all.filter((l) => l.key === f.list);
  const kind = f.kind ?? "clear";
  const match = all.filter((l) => l.kind === kind && (f.year == null || l.year === f.year) && (f.round == null || l.round === f.round));
  return match.filter((l) => l.year === match[0]?.year && l.round === match[0]?.round);
}

/**
 * MCC seat notices of a list's round that may change it (`notices`: that round's seat_matrix notices), other than the
 * seat list PDFs (`lists`) themselves: `later` (dated after the list: not applied) and `sameDay` (dated the same day:
 * it may already include them). Every one is `later` when the list has no date.
 */
export function seatChanges(list: SeatList, lists: SeatList[], notices: MccNotice[]) {
  const xs = notices.filter((n) => n.url && !lists.some((l) => l.url === n.url));
  const day = list.publishedAt;
  return { later: xs.filter((n) => !day || n.date > day), sameDay: day ? xs.filter((n) => n.date === day) : [] };
}

export type SeatFilters = {
  /** SeatList key; overrides kind/year/round. */
  list?: string;
  kind?: SeatKind;
  year?: number;
  round?: Round;
  /** Specialty slugs, e.g. "md-anaesthesiology". */
  courses?: string[];
  /** Specialty codes (any degree), e.g. ["ANAESTHESIOLOGY", "FAMILYMEDICINE"]. */
  specialties?: string[];
  degrees?: string[];
  /** Exact courses "degree~SPECIALTY" (profile.ts pairKey), e.g. ["DNB~FAMILYMEDICINE"]. */
  pairs?: string[];
  /** MCC quota label verbatim, e.g. "All India", "DNB Quota". Rows of a PDF without a quota column (quota null) never match. */
  quota?: string;
  /** Seat categories, e.g. ["Open", "OBC"]. */
  categories?: string[];
  state?: string;
  /** College.key */
  college?: string;
  /** Contained in the college name, address or state. */
  q?: string;
};

export type SeatRow = {
  /** SeatList key. */
  list: string;
  college: College;
  /** Null when the course is not in the MCC course list (shown as degree + specialty code). */
  course: Course | null;
  degree: string;
  specialty: string;
  /** Null where the PDF has no quota column. */
  quota: string | null;
  category: string;
  seats: number;
  /** CollegeSpecialty id when Decide has allotment data for this course here (an Options row), else null. */
  cs: string | null;
};

const like = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

/** listSeats' filters other than the list, on x (course, quota, category), sp (Specialty) and c (College). */
function rowWhere(f: SeatFilters): Prisma.Sql[] {
  const q = f.q?.trim();
  return [
    f.courses && Prisma.sql`sp.slug = ANY(${f.courses})`,
    f.specialties && Prisma.sql`x.code = ANY(${f.specialties})`,
    f.degrees && Prisma.sql`x.degree = ANY(${f.degrees})`,
    f.pairs && Prisma.sql`(x.degree || '~' || x.code) = ANY(${f.pairs})`,
    f.quota && Prisma.sql`x.quota = ${f.quota}`,
    f.categories && Prisma.sql`x.category = ANY(${f.categories})`,
    f.state && Prisma.sql`c.state = ${f.state}`,
    f.college && Prisma.sql`c.key = ${f.college}`,
    q && Prisma.sql`(c.name ILIKE ${like(q)} OR c.address ILIKE ${like(q)} OR c.state ILIKE ${like(q)})`,
  ].filter((x): x is Prisma.Sql => !!x);
}

/**
 * Every college, course, quota and seat category MCC allotted in any result in the data (Cutoff), as seat rows with no
 * seats (`list` "", `seats` 0), filtered as listSeats is (list aside), by college name, course, quota, category. The
 * Seats matrix adds the ones no seat list prints ("All rounds").
 */
export async function allottedRows(f: Omit<SeatFilters, "list" | "kind" | "year" | "round"> = {}, exam: ExamKey = DEFAULT_EXAM): Promise<SeatRow[]> {
  const cat = await getCatalog(exam);
  const where = rowWhere(f);
  const found = await db.$queryRaw<{ k: string; dg: string; sc: string; slug: string; name: string; q: string; c: string; cs: string }[]>`
    SELECT c.key AS k, x.degree AS dg, x.code AS sc, sp.slug, sp.name, x.quota AS q, x.category AS c, x."collegeSpecialtyId" AS cs
    FROM (
      SELECT DISTINCT p."collegeId", p."specialtyId", u."collegeSpecialtyId", s.degree, COALESCE(s.code, '') AS code, u.quota, u.category
      FROM "Cutoff" u JOIN "CollegeSpecialty" p ON p.id = u."collegeSpecialtyId" JOIN "Specialty" s ON s.id = p."specialtyId"
      WHERE u.exam = ${exam}
    ) x JOIN "College" c ON c.id = x."collegeId" JOIN "Specialty" sp ON sp.id = x."specialtyId"
    ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, " AND ")}` : Prisma.empty}
    ORDER BY c.name, c.key, x.degree, sp.name, x.quota, array_position(${categoryOrder}::text[], x.category)`;
  return found.flatMap((r): SeatRow[] => {
    const college = cat.collegeByKey.get(r.k);
    if (!college) return [];
    return [{ list: "", college, course: { degree: r.dg, specialty: r.sc, name: r.name, slug: r.slug }, degree: r.dg, specialty: r.sc, quota: r.q, category: r.c, seats: 0, cs: r.cs }];
  });
}

/**
 * Seat rows of the picked lists (see pickLists), by college name, course, quota, category. `lists` = the PDFs behind
 * them (source, date, link); `seats` = Σ seats of the matching rows per list key (within one list only). `pg` returns
 * one page, without it every row; `total` counts rows.
 */
export async function listSeats(f: SeatFilters = {}, pg?: PageQuery, exam: ExamKey = DEFAULT_EXAM): Promise<Paged<SeatRow> & { lists: SeatList[]; seats: Record<string, number> }> {
  const cat = await getCatalog(exam);
  const lists = pickLists(await seatLists(exam), f);
  if (!lists.length) return { rows: [], total: 0, page: 1, pageSize: pg?.pageSize ?? 1, lists, seats: {} };
  // pickLists' lists are all of one round: its rows, cached per import, filtered here as rowWhere filters in SQL.
  const keys = new Set(lists.map((l) => l.key));
  const match = rowMatch(cat, f);
  const all = (await roundRows(roundKey(lists[0].year, lists[0].round), exam)).filter((r) => keys.has(r.l) && match(r));
  const total = all.length;
  const pageSize = pg?.pageSize ?? Math.max(1, total);
  // A page past the end is the last one.
  const page = pg ? Math.min(Math.max(1, pg.page), Math.max(1, Math.ceil(total / pg.pageSize))) : 1;
  const rows = all.slice((page - 1) * pageSize, page * pageSize).flatMap((r): SeatRow[] => {
    const college = cat.collegeByKey.get(r.k);
    if (!college) return [];
    const course = r.slug && r.name ? { degree: r.dg, specialty: r.sc, name: r.name, slug: r.slug } : null;
    return [{ list: r.l, college, course, degree: r.dg, specialty: r.sc, quota: r.q, category: r.c, seats: r.n, cs: r.cs }];
  });
  const seats = Object.fromEntries(lists.map((l) => [l.key, 0]));
  for (const r of all) seats[r.l] += r.n;
  return { rows, total, page, pageSize, lists, seats };
}

/**
 * Every seat row of a round (roundKey), once per import per process: the build's snapshot holds NEET PG's newest round
 * (server/snapshot.ts), other rounds and data imported since the build are read from Postgres. ~10k rows per list.
 */
const roundRows = perImport(async (key, exam): Promise<SeatDbRow[]> => {
  const snap = exam === DEFAULT_EXAM ? await snapshotAt(await dataVersion(exam)) : null;
  if (snap?.seats[key]) return snap.seats[key];
  const [year, round] = key.split("|");
  return seatRoundRows(db, Number(year), round, exam);
});

/** rowWhere in JS, on a cached seat row (SQL ILIKE ≈ case-insensitive contains). */
function rowMatch(cat: Catalog, f: SeatFilters) {
  const q = f.q?.trim().toLowerCase();
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q!);
  return (r: SeatDbRow) => {
    const college = cat.collegeByKey.get(r.k);
    return (
      (!f.courses || (r.slug != null && f.courses.includes(r.slug))) &&
      (!f.specialties || f.specialties.includes(r.sc)) &&
      (!f.degrees || f.degrees.includes(r.dg)) &&
      (!f.pairs || f.pairs.includes(`${r.dg}~${r.sc}`)) &&
      (!f.quota || r.q === f.quota) &&
      (!f.categories || f.categories.includes(r.c)) &&
      (!f.state || college?.state === f.state) &&
      (!f.college || r.k === f.college) &&
      (!q || has(college?.name) || has(college?.address) || has(college?.state))
    );
  };
}

/** The seat row's course and quota is an Options row (it has past allotments). A row with no quota printed never is. */
export const hasOption = (cat: Catalog, r: Pick<SeatRow, "college" | "degree" | "specialty" | "quota">) =>
  r.quota != null && cat.optionById.has(optionId({ college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota }));

/** Seats of one list in one quota × category of a course at a college (PDF lines printed twice are summed). */
export type SeatCell = { quota: string | null; category: string; seats: number };
/** One option's seats (a course at a college under one quota): `cells[i]` = its seats per seat category in the i-th list asked for. */
export type OptionSeats = { college: string; degree: string; specialty: string; quota: string; cells: SeatCell[][] };

/**
 * Seats per option id (types.ts optionId) in each of `lists` (one kind each, never added), with or without past
 * allotments, from one read. Rows of a PDF with no quota column belong to no option and are left out. `f` narrows in
 * SQL: courses (profile pairs, or specialties x degrees), quotas, seat categories, colleges (College.key).
 */
export async function optionSeats(
  lists: SeatList[],
  f: { pairs?: string[]; specialties?: string[]; degrees?: string[]; quotas?: string[]; categories?: string[]; colleges?: string[] } = {},
  exam: ExamKey = DEFAULT_EXAM,
): Promise<Map<string, OptionSeats>> {
  const out = new Map<string, OptionSeats>();
  if (!lists.length) return out;
  const where = [
    Prisma.sql`d.exam = ${exam}`,
    Prisma.sql`d.key = ANY(${lists.map((l) => l.key)})`,
    Prisma.sql`x.quota IS NOT NULL`,
    f.pairs && Prisma.sql`(x.degree || '~' || x.code) = ANY(${f.pairs})`,
    f.specialties && Prisma.sql`x.code = ANY(${f.specialties})`,
    f.degrees && Prisma.sql`x.degree = ANY(${f.degrees})`,
    f.quotas && Prisma.sql`x.quota = ANY(${f.quotas})`,
    f.categories && Prisma.sql`x.category = ANY(${f.categories})`,
    f.colleges && Prisma.sql`c.key = ANY(${f.colleges})`,
  ].filter((x): x is Prisma.Sql => !!x);
  const rows = await db.$queryRaw<{ l: string; k: string; dg: string; sc: string; q: string; c: string; n: number }[]>`
    SELECT d.key AS l, c.key AS k, x.degree AS dg, x.code AS sc, x.quota AS q, x.category AS c, SUM(x.seats)::int AS n
    FROM "SeatCount" x JOIN "DataSource" d ON d.id = x."seatSourceId" JOIN "College" c ON c.id = x."collegeId"
    WHERE ${Prisma.join(where, " AND ")}
    GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY array_position(${categoryOrder}::text[], x.category)`;
  for (const r of rows) {
    const id = optionId({ college: r.k, degree: r.dg, specialty: r.sc, quota: r.q });
    const o = out.get(id) ?? out.set(id, { college: r.k, degree: r.dg, specialty: r.sc, quota: r.q, cells: lists.map(() => []) }).get(id)!;
    o.cells[lists.findIndex((l) => l.key === r.l)].push({ quota: r.q, category: r.c, seats: r.n });
  }
  return out;
}

/**
 * Σ seats of one list's cells in a quota and/or categories (e.g. an option's quota and her eligible categories); null
 * when the list prints no row for them.
 */
export function sumSeats(cells: SeatCell[] | undefined, f: { quota?: string; categories?: string[] } = {}): number | null {
  const hit = (cells ?? []).filter((c) => (!f.quota || c.quota === f.quota) && (!f.categories || f.categories.includes(c.category)));
  return hit.length ? hit.reduce((a, c) => a + c.seats, 0) : null;
}
