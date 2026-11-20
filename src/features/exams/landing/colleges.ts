// NEET PG's public college and branch pages: the index (/neet-pg/colleges), a state's colleges
// (/neet-pg/colleges/state/maharashtra), one college (/neet-pg/colleges/<slug>) and one branch's last rank college by
// college (/neet-pg/cutoff/md-anaesthesiology). Read through Decide's catalog without a session (asTrustedServer), as
// ./data.ts: NEET PG is public. Public facts only: the latest round's last ranks and last year's deepest Open closing,
// seats in the newest seat lists, fee, stipend and bond lines, residents as counts (never a name). Every year × round
// grid, rank-level list, name, compare, choice list and "your chance" stays in Decide, behind sign-up (`gatedLinks`).
import "server-only";
import { headerLists, hospitalInfo, optionSeats, roundSeatsAt, type HospitalInfo, type RoundSeats } from "@/features/decide/components/institute/institute-data";
import { typeCategories, typeCategory, typeCategoryLabel, type TypeCategory } from "@/features/decide/components/institute/college-type";
import { reportedCount, sourceName } from "@/features/decide/components/institute/hospital-bits";
import { decideLinks } from "@/features/decide/lib/links";
import { latestRound } from "@/features/decide/lib/reach";
import { bondPlain, statCells } from "@/features/decide/lib/stat-format";
import { asTrustedServer, getCatalog, perImport, type Catalog } from "@/features/decide/server/catalog";
import { findCutoffs } from "@/features/decide/server/queries";
import { collegeTerms, courseTerms, programmeOfDegree } from "@/features/decide/server/terms";
import { renamedCollege } from "@/features/decide/service";
import { kindName, openQuotas, type College, type Course, type Cutoff, type Round, type Source } from "@/features/decide/types";
import { db } from "@/lib/db";
import { branchQuotas, branchTabs, type BranchAgg, type BranchRow } from "./data";

export const collegesPath = "/neet-pg/colleges";
/** "/neet-pg/colleges/<the in-app slug>". */
export const collegePath = (slug: string) => `${collegesPath}/${slug}`;
/** "Jammu and Kashmir" → "jammu-and-kashmir". */
export const stateSlug = (state: string) => state.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const statePath = (state: string) => `${collegesPath}/state/${stateSlug(state)}`;
/** "/neet-pg/cutoff/md-anaesthesiology": Specialty.slug, degree and name. */
export const branchPath = (slug: string) => `/neet-pg/cutoff/${slug}`;

/** Decide for a visitor: sign-up first (/signup sends a signed-in member straight on to `next`), as every public CTA. */
const signup = (next: string) => `/signup?${new URLSearchParams({ next })}`;
const L = decideLinks("");

/** The round the pages show (the latest with a result, provisional while MCC's is), its result PDF, and last year. */
export type At = ReturnType<typeof latestRound> & { prevYear: number; source: Source | null; prevSources: Source[] };
const roundOf = (cat: Catalog): At => {
  const at = latestRound(cat.sources);
  return { ...at, prevYear: at.year - 1, source: cat.sources.find((s) => s.year === at.year && s.round === at.round) ?? null, prevSources: cat.sources.filter((s) => s.year === at.year - 1) };
};

export type TypeKey = TypeCategory | "unknown";
/** The six types she sees and "Type not known" (never Government by default): inferred from name and quota, not official. */
export const typeKeys: { key: TypeKey; label: string }[] = [...typeCategories.map((key) => ({ key, label: typeCategoryLabel[key] })), { key: "unknown", label: "Type not known" }];
const typeOf = (info: HospitalInfo | null | undefined): { key: TypeKey; label: string } => {
  const key: TypeKey = info?.type ? typeCategory[info.type.value] : "unknown";
  return typeKeys.find((t) => t.key === key)!;
};

const quotaPos = (q: string) => branchQuotas.findIndex((t) => t.quota === q);
/**
 * Each college's most competitive course in a round: the lowest Open last rank on All India seats, else on Deemed, else
 * on DNB seats (the first of those quotas it has). Restricted quotas never count.
 */
export function bestOpen(cuts: Cutoff[]): Map<string, Cutoff> {
  const out = new Map<string, Cutoff>();
  for (const c of cuts) {
    const p = quotaPos(c.quota);
    if (c.category !== "Open" || p < 0) continue;
    const was = out.get(c.college);
    if (!was || p < quotaPos(was.quota) || (p === quotaPos(was.quota) && c.closing < was.closing)) out.set(c.college, c);
  }
  return out;
}

/** Last year's deepest Open closing per `key` (any round, stray too, as Decide's "Deepest"), with its round. */
export function deepestOpen(cuts: Cutoff[], key: (c: Cutoff) => string): Map<string, { closing: number; round: Round }> {
  const out = new Map<string, { closing: number; round: Round }>();
  for (const c of cuts) {
    if (c.category !== "Open") continue;
    const k = key(c);
    if (c.closing > (out.get(k)?.closing ?? 0)) out.set(k, { closing: c.closing, round: c.round });
  }
  return out;
}

// ---------- Index and state pages ----------

const index = perImport(async () => {
  const cat = await getCatalog();
  const at = roundOf(cat);
  const [info, cuts] = await Promise.all([hospitalInfo(), findCutoffs(cat, { years: [at.year], quotas: branchQuotas.map((q) => q.quota), categories: ["Open"] })]);
  return { at, colleges: indexRows(cat, cuts.filter((c) => c.round === at.round), info) };
});

/**
 * The index rows: every college in NEET PG's data with its type, courses MCC allotted there (any year), the latest year's
 * allotments (the static pages' pick), and its most competitive course's Open last rank in the round (bestOpen).
 * `label`: the name, with its PIN code where another college has the same name. Most competitive first, then A–Z.
 */
export function indexRows(cat: Catalog, round: Cutoff[], info: Map<string, HospitalInfo>) {
  const best = bestOpen(round);
  const opts = Map.groupBy(cat.options, (o) => o.college);
  const year = Math.max(0, ...round.map((c) => c.year));
  return cat.colleges
    .map((c) => {
      const os = opts.get(c.key) ?? [];
      const b = best.get(c.key);
      const course = b && cat.courseOf.get(`${b.degree}|${b.specialty}`);
      return {
        slug: c.slug,
        name: c.name,
        label: labelOf(cat, c),
        state: c.state,
        pincode: c.pincode,
        type: typeOf(info.get(c.key)),
        courses: new Set(os.map((o) => `${o.degree}|${o.specialty}`)).size,
        allotments: os.reduce((a, o) => a + (o.byYear[year] ?? 0), 0),
        best: b ? { closing: b.closing, quota: b.quota, course: course ? `${course.degree} ${course.name}` : b.degree } : null,
      };
    })
    .sort((a, b) => (a.best?.closing ?? Infinity) - (b.best?.closing ?? Infinity) || a.label.localeCompare(b.label));
}
export type IndexRow = ReturnType<typeof indexRows>[number];

/** The college's name, with its PIN code (else state) where another college has the same name: titles stay unique. */
const names = new WeakMap<Catalog, Map<string, number>>();
const labelOf = (cat: Catalog, c: College) => {
  let m = names.get(cat);
  if (!m) names.set(cat, (m = new Map([...Map.groupBy(cat.colleges, (x) => x.name.toLowerCase())].map(([k, xs]) => [k, xs.length]))));
  return m.get(c.name.toLowerCase())! > 1 ? `${c.name} (${c.pincode ?? c.state ?? c.key})` : c.name;
};

/** Every state with colleges, A–Z, each with its slug and count. */
export const statesOf = (rows: Pick<IndexRow, "state">[]) =>
  [...Map.groupBy(rows.filter((r) => r.state), (r) => r.state!)].map(([state, xs]) => ({ state, slug: stateSlug(state), n: xs.length })).sort((a, b) => a.state.localeCompare(b.state));

/** The index: every college (IndexRow order) and the round. Throws when the data can't be read (the page keeps its last render). */
export const collegeIndex = () => asTrustedServer(() => index());
/** One state's colleges by its slug; null for a slug no state has. */
export const stateColleges = (slug: string) =>
  asTrustedServer(async () => {
    const d = await index();
    const colleges = d.colleges.filter((c) => c.state && stateSlug(c.state) === slug);
    return colleges.length ? { at: d.at, state: colleges[0].state!, colleges, states: statesOf(d.colleges) } : null;
  });

// ---------- One college ----------

/** The college page a slug an MCC import retired (merged, or a neutral name: RetiredCollegeKey) moved to; else null. */
export const movedTo = (slug: string) =>
  asTrustedServer(async () => {
    const c = await renamedCollege(slug);
    return c ? collegePath(c.slug) : null;
  });

/** A college's page, by slug: its view (collegeView), hospital facts and residents (counts). Null for a slug no college has now. */
export const collegePage = (slug: string) =>
  asTrustedServer(async () => {
    const cat = await getCatalog();
    const college = cat.collegeBySlug.get(slug);
    if (!college) return null;
    const at = roundOf(cat);
    const cs = [...new Set(cat.options.filter((o) => o.college === college.key).map((o) => o.cs))];
    const [cuts, seats, info, residents] = await Promise.all([
      findCutoffs(cat, { cs, years: [at.year, at.prevYear] }),
      roundSeatsAt(college.key),
      hospitalInfo().then((m) => m.get(college.key) ?? null),
      residentsAt(college.key),
    ]);
    const beds = info?.beds ? { ...reportedCount(info.beds), source: info.beds.meta ? { name: sourceName(info.beds.meta), url: info.beds.meta.url } : null } : null;
    return { ...collegeView(cat, college, cuts, seats, at), type: typeOf(info), beds, mccProfileUrl: info?.mccProfileUrl ?? null, residents };
  });
export type CollegePage = NonNullable<Awaited<ReturnType<typeof collegePage>>>;

const courseKey = (c: { degree: string; specialty: string }) => `${c.degree}|${c.specialty}`;

/**
 * What a college's page shows from the data, and only that (unit-tested): the round's last rank per course × quota and
 * seat category (BranchTables' rows: `d`), each row with last year's deepest Open closing (`prev`) and its seats in the
 * newest clear vacancy list (`seats`); a course × open quota with no allotment in the round has a row when it had one
 * last year or is in the newest seat lists. The newest seat lists' totals, each programme's fee, stipend and bond line
 * (the app's words), the gated links. No other year or round, no rank-level list, no name.
 */
export function collegeView(cat: Catalog, college: College, cuts: Cutoff[], seats: RoundSeats, at: At) {
  const courseOf = (c: { degree: string; specialty: string }) => cat.courseOf.get(courseKey(c));
  const agg = (c: { degree: string; specialty: string }, quota: string, category: string, closing: number | null, n: number): BranchAgg[] => {
    const k = courseOf(c);
    return k ? [{ degree: k.degree, name: k.name, slug: k.slug, quota, category, closing, n }] : [];
  };
  const latest = cuts.filter((c) => c.college === college.key && c.year === at.year && c.round === at.round);
  const prev = deepestOpen(cuts.filter((c) => c.college === college.key && c.year === at.prevYear), (c) => `${courseKey(c)}|${c.quota}`);
  const clear = seats.find((s) => s.list.kind === "clear");
  const seatRows = seats.flatMap((s) => s.rows).filter((r) => r.quota && openQuotas.includes(r.quota));
  // Rows with no allotment in the round: an open quota the course had last year, or one the newest seat lists print.
  const had = new Set(latest.map((c) => `${courseKey(c)}|${c.quota}`));
  const more = new Map<string, { degree: string; specialty: string; quota: string }>();
  for (const k of prev.keys()) {
    const [degree, specialty, quota] = k.split("|");
    if (openQuotas.includes(quota)) more.set(k, { degree, specialty, quota });
  }
  for (const r of seatRows) more.set(`${courseKey(r)}|${r.quota}`, { degree: r.degree, specialty: r.specialty, quota: r.quota! });
  const { tabs, restricted } = branchTabs([
    ...latest.flatMap((c) => agg(c, c.quota, c.category, c.closing, c.n)),
    ...[...more].filter(([k]) => !had.has(k)).flatMap(([, x]) => agg(x, x.quota, "Open", null, 0)),
  ]);
  const bySlug = new Map([...cat.courseOf.values()].map((c) => [c.slug, c]));
  const decorate = <R extends BranchRow>(r: R): R => {
    const c = bySlug.get(r.slug)!;
    return { ...r, prev: prev.get(`${courseKey(c)}|${r.quota}`)?.closing, seats: clear ? optionSeats(clear.rows, { degree: c.degree, specialty: c.specialty, quota: r.quota }) : null };
  };
  const d = { year: String(at.year), round: at.round, provisional: at.provisional, tabs: tabs.map((t) => ({ ...t, rows: t.rows.map(decorate) })), restricted: restricted.map(decorate) };

  // Fee, stipend and bond per programme here, for its main open quota's seats (the most allotments; the fee can differ by quota).
  const opts = cat.options.filter((o) => o.college === college.key);
  const total = (o: (typeof opts)[number]) => Object.values(o.byYear).reduce((a, b) => a + b, 0);
  const open = (q: string) => (openQuotas.includes(q) ? 0 : 1);
  const terms = collegeTerms(cat, college.key).map((t0) => {
    const o = opts.filter((x) => programmeOfDegree(x.degree) === t0.programme).sort((a, b) => open(a.quota) - open(b.quota) || total(b) - total(a))[0];
    const t = o ? courseTerms(cat, college.key, o.degree, undefined, o.quota) : t0;
    const cells = statCells(t);
    const cell = (k: "fee" | "stipend") => cells.find((c) => c.key === k)!;
    return {
      programme: t.programme,
      quota: o?.quota ?? null,
      fee: { value: cell("fee").full, missing: !!cell("fee").missing },
      stipend: { value: cell("stipend").full, missing: !!cell("stipend").missing },
      bond: bondPlain(t),
      bondKnown: t.bond.status === "declared" || t.bond.status === "none",
      sources: t.sources.map((s) => ({ name: s.label, url: s.url, year: s.year })),
    };
  });
  // Programmes with the same seats, figures, bond and documents (MD/MS and Diploma, often) are said once.
  const programmes = [...Map.groupBy(terms, (x) => JSON.stringify({ ...x, programme: null })).values()].map((xs) => ({ ...xs[0], programme: xs.map((x) => x.programme).join(" and ") }));

  const lists = headerLists(seats.map((s) => s.list)).map((list) => ({ name: `${kindName(list.kind)} list`, url: list.url, year: list.year, round: list.round, seats: seats.find((s) => s.list === list)!.rows.reduce((a, r) => a + r.seats, 0) }));
  const years = cat.meta.years.map((y) => y.year);
  return {
    college,
    label: labelOf(cat, college),
    at,
    d,
    courses: new Set([...tabs.flatMap((t) => t.rows), ...restricted].map((r) => r.slug)).size,
    quotas: branchQuotas.filter((q) => tabs.some((t) => t.key === q.key && t.rows.length)).map((q) => q.quota),
    lists,
    programmes,
    gated: gatedLinks(college, Math.min(...years), Math.max(...years)),
  };
}
export type CollegeView = ReturnType<typeof collegeView>;

/** What only the planner shows, each a sign-up link that opens it (a signed-in member goes straight there). */
export const gatedLinks = (college: Pick<College, "slug" | "name">, from: number, to: number) => [
  { label: `Every year and round, ${from} to ${to}, for each course and quota`, href: signup(L.institute(college.slug, "courses")) },
  { label: "Every allotment by rank, round by round", href: signup(L.institute(college.slug, "allotments")) },
  { label: "Residents' names by course and year", href: signup(L.to(`/decide/institutes/${college.slug}`, { tab: "residents" })) },
  { label: "Your chance at your rank, course by course", href: signup(L.options({ q: college.name.slice(0, 100) })) },
  { label: "Compare it with other colleges", href: signup(L.to("/decide/compare")) },
  { label: "Add its seats to your choice list", href: signup(L.choices()) },
];

/**
 * Residents at one college, counts only: how many per course and year on MCC's admitted lists (hidden ones never
 * counted). The query groups and counts; no name is ever read, so none can reach a public page. Null when none.
 */
export async function residentsAt(collegeKey: string) {
  const groups = await db.resident.groupBy({ by: ["specialtyId", "year"], where: { hidden: false, college: { key: collegeKey } }, _count: { _all: true } });
  if (!groups.length) return null;
  const specialties = await db.specialty.findMany({ where: { id: { in: [...new Set(groups.map((g) => g.specialtyId))] } }, select: { id: true, degree: true, name: true, slug: true } });
  return residentCountsOf(groups.map((g) => ({ specialtyId: g.specialtyId, year: g.year, n: g._count._all })), specialties);
}

/** Counts per course (biggest first, then A–Z) and year (oldest first), and in all. */
export function residentCountsOf(groups: { specialtyId: string; year: number; n: number }[], specialties: { id: string; degree: string; name: string; slug: string }[]) {
  const years = [...new Set(groups.map((g) => g.year))].sort((a, b) => a - b);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const courses = specialties
    .map((s) => ({ course: `${s.degree} ${s.name}`, slug: s.slug, byYear: years.map((y) => sum(groups.filter((g) => g.specialtyId === s.id && g.year === y).map((g) => g.n))) }))
    .filter((c) => sum(c.byYear) > 0)
    .sort((a, b) => sum(b.byYear) - sum(a.byYear) || a.course.localeCompare(b.course));
  return { years, courses, byYear: years.map((_, i) => sum(courses.map((c) => c.byYear[i]))), total: sum(courses.flatMap((c) => c.byYear)) };
}
export type ResidentCounts = ReturnType<typeof residentCountsOf>;

// ---------- One branch ----------

/** A branch's page by its course slug (`md-anaesthesiology`): branchView. Null for a course with no allotment in the round or last year. */
export const branchPage = (slug: string) =>
  asTrustedServer(async () => {
    const cat = await getCatalog();
    const course = cat.courses.find((c) => c.slug === slug);
    if (!course) return null;
    const at = roundOf(cat);
    const cs = [...cat.pairs.values()].filter((p) => p.degree === course.degree && p.specialty === course.specialty).map((p) => p.cs);
    const v = branchView(cat, course, await findCutoffs(cat, { cs, years: [at.year, at.prevYear] }), at);
    return v.colleges ? v : null;
  });
export type BranchPage = NonNullable<Awaited<ReturnType<typeof branchPage>>>;

/**
 * One course college by college (unit-tested): the round's last rank per college × quota and seat category, each row
 * with its state (`sub`) and last year's deepest Open closing (`prev`); a college × open quota with no allotment in the
 * round has a row when it had one last year.
 */
export function branchView(cat: Catalog, course: Course, cuts: Cutoff[], at: At) {
  const mine = cuts.filter((c) => c.degree === course.degree && c.specialty === course.specialty);
  const agg = (key: string, quota: string, category: string, closing: number | null, n: number): BranchAgg[] => {
    const c = cat.collegeByKey.get(key);
    return c ? [{ degree: "", name: c.name, slug: c.slug, quota, category, closing, n }] : [];
  };
  const latest = mine.filter((c) => c.year === at.year && c.round === at.round);
  const prev = deepestOpen(mine.filter((c) => c.year === at.prevYear), (c) => `${c.college}|${c.quota}`);
  const had = new Set(latest.map((c) => `${c.college}|${c.quota}`));
  const { tabs, restricted } = branchTabs([
    ...latest.flatMap((c) => agg(c.college, c.quota, c.category, c.closing, c.n)),
    ...[...prev.keys()].filter((k) => !had.has(k) && openQuotas.includes(k.split("|")[1])).flatMap((k) => agg(k.split("|")[0], k.split("|")[1], "Open", null, 0)),
  ]);
  const bySlug = new Map(cat.colleges.map((c) => [c.slug, c]));
  const decorate = <R extends BranchRow>(r: R): R => {
    const c = bySlug.get(r.slug)!;
    return { ...r, sub: c.state ?? undefined, prev: prev.get(`${c.key}|${r.quota}`)?.closing };
  };
  const d = { year: String(at.year), round: at.round, provisional: at.provisional, tabs: tabs.map((t) => ({ ...t, rows: t.rows.map(decorate) })), restricted: restricted.map(decorate) };
  return {
    course: { ...course, label: `${course.degree} ${course.name}` },
    at,
    d,
    colleges: new Set([...tabs.flatMap((t) => t.rows), ...restricted].map((r) => r.slug)).size,
    /** Every college of the course in the data, deepest last year (Open, any open quota), for the FAQ. */
    prevDeepest: [...prev].filter(([k]) => openQuotas.includes(k.split("|")[1])).reduce<{ college: string; closing: number; round: Round } | null>((a, [k, v]) => (!a || v.closing > a.closing ? { college: cat.collegeByKey.get(k.split("|")[0])?.name ?? "", ...v } : a), null),
    gated: signup(L.lastRanks(course.slug)),
  };
}
export type BranchView = ReturnType<typeof branchView>;

/** Courses branchView has a row for (a cutoff in the round, or an Open one on an open quota last year): one read per import. */
const branchesWithData = perImport(async () => {
  const cat = await getCatalog();
  const { year, round } = latestRound(cat.sources);
  const rows = await db.$queryRaw<{ slug: string }[]>`
    SELECT DISTINCT s.slug FROM "Cutoff" c JOIN "CollegeSpecialty" cs ON cs.id = c."collegeSpecialtyId" JOIN "Specialty" s ON s.id = cs."specialtyId"
    WHERE c.exam = ${cat.exam} AND (
      (c."counsellingYear" = ${year} AND c.round = ${round} AND (c."closingRank" IS NOT NULL OR c.quota = ANY(${openQuotas})))
      OR (c."counsellingYear" = ${year - 1} AND c.category = 'Open' AND c.quota = ANY(${openQuotas})))`;
  return new Set(rows.map((r) => r.slug));
});
/** Every course with a branch page, A–Z by degree then name. */
export const branchSlugs = () =>
  asTrustedServer(async () => {
    const [cat, has] = await Promise.all([getCatalog(), branchesWithData()]);
    return cat.courses.filter((c) => has.has(c.slug)).map((c) => ({ slug: c.slug, label: `${c.degree} ${c.name}` }));
  });
