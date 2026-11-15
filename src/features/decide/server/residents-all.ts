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
  year: [{ year: "desc" }, { college: { name: "asc" } }, { collegeId: "asc" }, { name: "asc" }],
  name: [{ name: "asc" }, { year: "desc" }],
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

/** Each token (any case and spacing) must occur in the field; a typed % or _ is literal (Prisma passes `contains` to ILIKE unescaped). */
const tokens = (q: string | undefined) => (q?.split(/\s+/).filter(Boolean) ?? []).map((t) => ({ contains: t.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const }));

/** The WHERE for a query: each search token (any case and spacing) occurs in the name or the college's name or city ("Pudukkottai"); never hidden rows. */
function residentsWhere(q: ResidentsQuery): Prisma.ResidentWhereInput {
  const cq = tokens(q.cq);
  return {
    hidden: false,
    year: q.year?.length ? { in: q.year } : undefined,
    quota: q.quota && (q.quota === MINORITY || RELIGIOUS.includes(q.quota)) ? { in: RELIGIOUS } : q.quota,
    college: q.college?.length || q.state || cq.length ? { slug: q.college?.length ? { in: q.college } : undefined, state: q.state?.length ? { in: q.state } : undefined, AND: cq.length ? cq.map((name) => ({ name })) : undefined } : undefined,
    specialty: q.course?.length ? { slug: { in: q.course } } : undefined,
    AND: [
      ...tokens(q.q).map((t) => ({ OR: [{ name: t }, { college: { name: t } }, { college: { city: t } }] })),
      ...(q.name?.length ? [{ OR: q.name.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })) }] : []),
    ],
  };
}

/** The years that have residents, newest first (the Year filter: no admitted list yet for the year in counselling). */
export const residentYears = async () =>
  (await db.resident.groupBy({ by: ["year"], where: { hidden: false }, orderBy: { year: "desc" } })).map((g) => g.year);

/** Up to `take` distinct resident names (not hidden) with every token of `q`, by name: the search dropdown's names. */
export const residentNames = async (q: string, take = 10) =>
  (await db.resident.findMany({ where: { hidden: false, AND: tokens(q).map((name) => ({ name })) }, select: { name: true }, distinct: ["name"], orderBy: { name: "asc" }, take })).map((r) => r.name);

/** Every college with residents (not hidden): the search box's list before she types. Government first (govt, central, ESIC, municipal, armed forces, railway, PSU), then the others, each by name. */
const PUBLIC = new Set(["govt", "central", "esic", "municipal", "armed_forces", "railway", "psu"]);
export async function allResidentColleges() {
  const rows = await db.college.findMany({ where: { residents: { some: { hidden: false } } }, select: { slug: true, name: true, state: true, type: true }, orderBy: { name: "asc" } });
  const gov = (t: string | null) => (t && PUBLIC.has(t) ? 0 : 1);
  return rows.sort((a, b) => gov(a.type) - gov(b.type)).map((c) => ({ value: c.slug, label: c.state ? `${c.name}, ${c.state}` : c.name, group: gov(c.type) ? "Other hospitals" : "Government hospitals" }));
}

/** Colleges with residents (not hidden) whose name has every token of `q` (or, by `slugs`, those colleges), by name: the College filter's choices. Names of colleges only. */
export const residentColleges = (by: { q: string } | { slugs: string[] }, take = 20) =>
  db.college.findMany({
    where: "q" in by ? { residents: { some: { hidden: false } }, AND: tokens(by.q).map((name) => ({ name })) } : { slug: { in: by.slugs } },
    select: { slug: true, name: true, state: true },
    orderBy: { name: "asc" },
    take,
  });

/**
 * One page (RESIDENTS_PAGE_SIZE rows; none past RESIDENTS_MAX_PAGE) of residents matching the query, with the total and
 * the admitted-list PDFs behind the page. Never a rank. Throws ResidentsDenied before reading anything when names may
 * not be seen or the read budget is spent (each call spends one read).
 */
export async function listResidentsAll(q: ResidentsQuery): Promise<ResidentsPage & { sources: ResidentSource[] }> {
  if (!(await canSeeResidents())) throw new ResidentsDenied("locked");
  if (!(await residentsBudget("read"))) throw new ResidentsDenied("rate_limited");
  const where = residentsWhere(q);
  const [total, found] = await Promise.all([
    db.resident.count({ where }),
    q.page > RESIDENTS_MAX_PAGE ? [] : db.resident.findMany({
      where,
      select: {
        id: true,
        name: true,
        year: true,
        list: true,
        sourceKey: true,
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
  const keys = [...new Set(rows.map((r) => r.sourceKey))];
  const sources = keys.length
    ? await db.dataSource.findMany({ where: { key: { in: keys } }, select: { key: true, name: true, url: true, counsellingYear: true }, orderBy: { key: "desc" } })
    : [];
  return {
    rows,
    total,
    page: q.page,
    pageSize: RESIDENTS_PAGE_SIZE,
    sources: sources.map((s): ResidentSource => ({ key: s.key, name: s.name, url: s.url, year: s.counsellingYear })),
  };
}
