import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { RESIDENTS_PAGE_SIZE, type ResidentRow, type ResidentsPage, type ResidentsQuery } from "../residents-search";
import { canSeeResidents, residentsBudget, type ResidentSource } from "./residents";

// Residents across institutes (the Residents tab): one filtered, sorted page at a time. Same gate and read budget as the
// institute tab; hidden rows are never read; no reservation category is held, so none can be returned.

/** Names may not be read: "locked" (no access, as canSeeResidents) or "rate_limited" (read budget spent). */
export class ResidentsDenied extends Error {
  constructor(readonly code: "locked" | "rate_limited") {
    super(`residents: ${code}`);
    this.name = "ResidentsDenied";
  }
}

const orderBy = {
  rank: [{ rank: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  name: [{ name: "asc" }, { year: "desc" }],
  year: [{ year: "desc" }, { name: "asc" }],
  college: [{ college: { name: "asc" } }, { collegeId: "asc" }, { year: "desc" }, { name: "asc" }],
} satisfies Record<ResidentsQuery["sort"], Prisma.ResidentOrderByWithRelationInput[]>;

/** Deeper pages are never served (scraping by paging): narrow the filters instead. Past it a page has no rows. */
export const RESIDENTS_MAX_PAGE = 20;

// A quota naming a religion is not shown beside a name: MCC's "Muslim Minority" and "Jain Minority" read as one
// "Minority", in the rows and in the Quota filter (either label, or "Minority", finds both).
const RELIGIOUS = ["Muslim Minority", "Jain Minority"];
const MINORITY = "Minority";
/** A quota as the Residents views show it. */
export const residentQuota = (quota: string) => (RELIGIOUS.includes(quota) ? MINORITY : quota);

/** The WHERE for a query: name tokens (any case and spacing) must all occur in the name; never hidden rows. */
function residentsWhere(q: ResidentsQuery): Prisma.ResidentWhereInput {
  const rank: Prisma.IntNullableFilter = { gte: q.rankFrom, lte: q.rankTo };
  if (q.hasRank !== undefined) rank[q.hasRank ? "not" : "equals"] = null;
  return {
    hidden: false,
    year: q.year,
    quota: q.quota && (q.quota === MINORITY || RELIGIOUS.includes(q.quota)) ? { in: RELIGIOUS } : q.quota,
    rank,
    college: q.college || q.state ? { slug: q.college, state: q.state } : undefined,
    specialty: q.course?.length ? { slug: { in: q.course } } : undefined,
    // Prisma passes `contains` to ILIKE unescaped: a typed % or _ would match anything.
    AND: (q.q?.split(/\s+/).filter(Boolean) ?? []).map((t) => ({ name: { contains: t.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const } })),
  };
}

/** The years that have residents, newest first (the Year filter: no admitted list yet for the year in counselling). */
export const residentYears = async () =>
  (await db.resident.groupBy({ by: ["year"], where: { hidden: false }, orderBy: { year: "desc" } })).map((g) => g.year);

/**
 * One page (RESIDENTS_PAGE_SIZE rows; none past RESIDENTS_MAX_PAGE) of residents matching the query, with the total, how
 * many of those have a rank, and the list PDFs and NBEMS results behind the page. Throws ResidentsDenied before reading anything when names may not be
 * seen or the read budget is spent (each call spends one read).
 */
export async function listResidentsAll(q: ResidentsQuery): Promise<ResidentsPage & { sources: ResidentSource[] }> {
  if (!(await canSeeResidents())) throw new ResidentsDenied("locked");
  if (!(await residentsBudget("read"))) throw new ResidentsDenied("rate_limited");
  const where = residentsWhere(q);
  const [total, withRank, found] = await Promise.all([
    db.resident.count({ where }),
    db.resident.count({ where: { AND: [where, { rank: { not: null } }] } }),
    q.page > RESIDENTS_MAX_PAGE ? [] : db.resident.findMany({
      where,
      select: {
        id: true,
        name: true,
        year: true,
        list: true,
        sourceKey: true,
        rank: true,
        rankBasis: true,
        quota: true,
        round: true,
        specialty: { select: { degree: true, code: true, name: true, slug: true } },
        college: { select: { slug: true, name: true, state: true } },
      },
      orderBy: [...orderBy[q.sort], { id: "asc" }], // id: a stable order across pages
      skip: (q.page - 1) * RESIDENTS_PAGE_SIZE,
      take: RESIDENTS_PAGE_SIZE,
    }),
  ]);
  const rows = found.map(({ specialty: s, ...r }): ResidentRow => ({
    ...r,
    quota: r.quota && residentQuota(r.quota),
    course: { degree: s.degree, specialty: s.code ?? "", name: s.name, slug: s.slug },
  }));
  const keys = [...new Set(rows.flatMap((r) => (r.rankBasis ? [r.sourceKey, r.rankBasis] : [r.sourceKey])))];
  const sources = keys.length
    ? await db.dataSource.findMany({ where: { key: { in: keys } }, select: { key: true, name: true, url: true, counsellingYear: true }, orderBy: { key: "desc" } })
    : [];
  return {
    rows,
    total,
    withRank,
    page: q.page,
    pageSize: RESIDENTS_PAGE_SIZE,
    sources: sources.map((s): ResidentSource => ({ key: s.key, name: s.name, url: s.url, year: s.counsellingYear })),
  };
}
