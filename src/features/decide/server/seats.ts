import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PageQuery, Paged } from "../service";
import { optionId, rounds, seatKinds, type College, type Course, type MccNotice, type Round, type SeatKind, type SeatList } from "../types";
import { getCatalog, perImport, type Catalog } from "./catalog";

// MCC seat lists (SeatSource + SeatCount, prisma/import-mcc.ts). Each list is one kind of one round as its PDF printed
// it; kinds overlap, so everything here works on one kind at a time and never adds kinds together.

/** Every seat list PDF: newest year and round first, then kind (clear, virtual, new), then newest PDF. */
export const seatLists: () => Promise<SeatList[]> = perImport(async () => {
  const rows = await db.seatSource.findMany({ select: { year: true, round: true, kind: true, total: true, source: { select: { key: true, name: true, url: true, publishedAt: true } } } });
  return rows
    .map(({ source: s, ...l }) => ({ key: s.key, name: s.name, url: s.url, year: l.year, round: l.round as Round, kind: l.kind as SeatKind, publishedAt: s.publishedAt?.toISOString().slice(0, 10) ?? null, seats: l.total }))
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

const categoryOrder = ["Open", "OBC", "EWS", "SC", "ST", "Open PwD", "OBC PwD", "EWS PwD", "SC PwD", "ST PwD"];
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
export async function allottedRows(f: Omit<SeatFilters, "list" | "kind" | "year" | "round"> = {}): Promise<SeatRow[]> {
  const cat = await getCatalog();
  const where = rowWhere(f);
  const found = await db.$queryRaw<{ k: string; dg: string; sc: string; slug: string; name: string; q: string; c: string; cs: string }[]>`
    SELECT c.key AS k, x.degree AS dg, x.code AS sc, sp.slug, sp.name, x.quota AS q, x.category AS c, x."collegeSpecialtyId" AS cs
    FROM (
      SELECT DISTINCT p."collegeId", p."specialtyId", u."collegeSpecialtyId", s.degree, COALESCE(s.code, '') AS code, u.quota, u.category
      FROM "Cutoff" u JOIN "CollegeSpecialty" p ON p.id = u."collegeSpecialtyId" JOIN "Specialty" s ON s.id = p."specialtyId"
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
export async function listSeats(f: SeatFilters = {}, pg?: PageQuery): Promise<Paged<SeatRow> & { lists: SeatList[]; seats: Record<string, number> }> {
  const cat = await getCatalog();
  const lists = pickLists(await seatLists(), f);
  if (!lists.length) return { rows: [], total: 0, page: 1, pageSize: pg?.pageSize ?? 1, lists, seats: {} };
  const where = Prisma.join([Prisma.sql`d.key = ANY(${lists.map((l) => l.key)})`, ...rowWhere(f)], " AND ");
  const from = Prisma.sql`FROM "SeatCount" x JOIN "DataSource" d ON d.id = x."seatSourceId" JOIN "College" c ON c.id = x."collegeId" LEFT JOIN "Specialty" sp ON sp.id = x."specialtyId" WHERE ${where}`;
  const rowsAt = (limit?: { size: number; page: number }) => db.$queryRaw<{ l: string; k: string; dg: string; sc: string; slug: string | null; name: string | null; q: string | null; c: string; n: number; cs: string | null }[]>`
    SELECT d.key AS l, c.key AS k, x.degree AS dg, x.code AS sc, sp.slug, sp.name, x.quota AS q, x.category AS c, x.seats AS n, x."collegeSpecialtyId" AS cs
    ${from}
    ORDER BY c.name, c.key, x.degree, COALESCE(sp.name, x.code), x.quota NULLS FIRST, array_position(${categoryOrder}::text[], x.category), d.key, x.id
    ${limit ? Prisma.sql`LIMIT ${limit.size} OFFSET ${(limit.page - 1) * limit.size}` : Prisma.empty}`;
  // Every row (no page): the totals come from the rows themselves, one read. One page: the totals beside it, in parallel
  // on the page asked for; a page past the end reads the last one again.
  const asked = Math.max(1, pg?.page ?? 1);
  const [all, first, counted] = await Promise.all([
    pg ? null : rowsAt(),
    pg ? rowsAt({ size: pg.pageSize, page: asked }) : null,
    pg ? db.$queryRaw<{ key: string; n: number; seats: number }[]>`SELECT d.key, COUNT(*)::int AS n, SUM(x.seats)::int AS seats ${from} GROUP BY 1` : null,
  ]);
  const per = counted ?? [...Map.groupBy(all!, (r) => r.l)].map(([key, xs]) => ({ key, n: xs.length, seats: xs.reduce((a, r) => a + r.n, 0) }));
  const total = per.reduce((a, r) => a + r.n, 0);
  const pageSize = pg?.pageSize ?? Math.max(1, total);
  const page = pg ? Math.min(asked, Math.max(1, Math.ceil(total / pg.pageSize))) : 1;
  const found = all ?? (page === asked ? first! : await rowsAt({ size: pageSize, page }));
  const rows = found.flatMap((r): SeatRow[] => {
    const college = cat.collegeByKey.get(r.k);
    if (!college) return [];
    const course = r.slug && r.name ? { degree: r.dg, specialty: r.sc, name: r.name, slug: r.slug } : null;
    return [{ list: r.l, college, course, degree: r.dg, specialty: r.sc, quota: r.q, category: r.c, seats: r.n, cs: r.cs }];
  });
  return { rows, total, page, pageSize, lists, seats: Object.fromEntries(lists.map((l) => [l.key, per.find((p) => p.key === l.key)?.seats ?? 0])) };
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
): Promise<Map<string, OptionSeats>> {
  const out = new Map<string, OptionSeats>();
  if (!lists.length) return out;
  const where = [
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
