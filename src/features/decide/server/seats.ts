import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { PageQuery, Paged } from "../service";
import { optionId, rounds, seatKinds, type College, type Course, type MccNotice, type Round, type SeatKind, type SeatList } from "../types";
import { getCatalog, type Catalog } from "./catalog";

// MCC seat lists (SeatSource + SeatCount, prisma/import-mcc.ts). Each list is one kind of one round as its PDF printed
// it; kinds overlap, so everything here works on one kind at a time and never adds kinds together.

/** Every seat list PDF: newest year and round first, then kind (clear, virtual, new), then newest PDF. */
export async function seatLists(): Promise<SeatList[]> {
  await getCatalog(); // same availability as the rest of Decide
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
}

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

/**
 * Seat rows of the picked lists (see pickLists), by college name, course, quota, category. `lists` = the PDFs behind
 * them (source, date, link); `seats` = Σ seats of the matching rows per list key (within one list only). `pg` returns
 * one page, without it every row; `total` counts rows.
 */
export async function listSeats(f: SeatFilters = {}, pg?: PageQuery): Promise<Paged<SeatRow> & { lists: SeatList[]; seats: Record<string, number> }> {
  const cat = await getCatalog();
  const lists = pickLists(await seatLists(), f);
  if (!lists.length) return { rows: [], total: 0, page: 1, pageSize: pg?.pageSize ?? 1, lists, seats: {} };
  const q = f.q?.trim();
  const where = Prisma.join(
    [
      Prisma.sql`d.key = ANY(${lists.map((l) => l.key)})`,
      f.courses && Prisma.sql`sp.slug = ANY(${f.courses})`,
      f.specialties && Prisma.sql`x.code = ANY(${f.specialties})`,
      f.degrees && Prisma.sql`x.degree = ANY(${f.degrees})`,
      f.pairs && Prisma.sql`(x.degree || '~' || x.code) = ANY(${f.pairs})`,
      f.quota && Prisma.sql`x.quota = ${f.quota}`,
      f.categories && Prisma.sql`x.category = ANY(${f.categories})`,
      f.state && Prisma.sql`c.state = ${f.state}`,
      f.college && Prisma.sql`c.key = ${f.college}`,
      q && Prisma.sql`(c.name ILIKE ${like(q)} OR c.address ILIKE ${like(q)} OR c.state ILIKE ${like(q)})`,
    ].filter((x): x is Prisma.Sql => !!x),
    " AND ",
  );
  const from = Prisma.sql`FROM "SeatCount" x JOIN "DataSource" d ON d.id = x."seatSourceId" JOIN "College" c ON c.id = x."collegeId" LEFT JOIN "Specialty" sp ON sp.id = x."specialtyId" WHERE ${where}`;
  const per = await db.$queryRaw<{ key: string; n: number; seats: number }[]>`SELECT d.key, COUNT(*)::int AS n, SUM(x.seats)::int AS seats ${from} GROUP BY 1`;
  const total = per.reduce((a, r) => a + r.n, 0);
  const pageSize = pg?.pageSize ?? Math.max(1, total);
  const page = pg ? Math.min(Math.max(1, pg.page), Math.max(1, Math.ceil(total / pg.pageSize))) : 1;
  const found = await db.$queryRaw<{ l: string; k: string; dg: string; sc: string; slug: string | null; name: string | null; q: string | null; c: string; n: number; cs: string | null }[]>`
    SELECT d.key AS l, c.key AS k, x.degree AS dg, x.code AS sc, sp.slug, sp.name, x.quota AS q, x.category AS c, x.seats AS n, x."collegeSpecialtyId" AS cs
    ${from}
    ORDER BY c.name, c.key, x.degree, COALESCE(sp.name, x.code), x.quota NULLS FIRST, array_position(${categoryOrder}::text[], x.category), d.key, x.id
    ${pg ? Prisma.sql`LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}` : Prisma.empty}`;
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

/**
 * Seats per CollegeSpecialty id (Opt.cs) in ONE list (SeatList key), for Options and institute columns. Ids with no row
 * are absent (the list has no seat there). `list` null when no list has that key.
 */
export async function seatCountsFor(cs: string[], list: string): Promise<{ list: SeatList | null; seats: Record<string, SeatCell[]> }> {
  const meta = (await seatLists()).find((l) => l.key === list) ?? null;
  if (!meta || !cs.length) return { list: meta, seats: {} };
  const rows = await db.$queryRaw<{ cs: string; q: string | null; c: string; n: number }[]>`
    SELECT x."collegeSpecialtyId" AS cs, x.quota AS q, x.category AS c, SUM(x.seats)::int AS n
    FROM "SeatCount" x JOIN "DataSource" d ON d.id = x."seatSourceId"
    WHERE d.key = ${list} AND x."collegeSpecialtyId" = ANY(${cs})
    GROUP BY 1, 2, 3 ORDER BY 2 NULLS FIRST, array_position(${categoryOrder}::text[], x.category)`;
  const seats: Record<string, SeatCell[]> = {};
  for (const r of rows) (seats[r.cs] ??= []).push({ quota: r.q, category: r.c, seats: r.n });
  return { list: meta, seats };
}

/**
 * Σ seats of one list's cells in a quota and/or categories (e.g. an option's quota and her eligible categories); null
 * when the list prints no row for them.
 */
export function sumSeats(cells: SeatCell[] | undefined, f: { quota?: string; categories?: string[] } = {}): number | null {
  const hit = (cells ?? []).filter((c) => (!f.quota || c.quota === f.quota) && (!f.categories || f.categories.includes(c.category)));
  return hit.length ? hit.reduce((a, c) => a + c.seats, 0) : null;
}
