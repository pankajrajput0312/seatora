import "server-only";
import { cache } from "react";
import { bondYears, firstRupees } from "./lib/format";
import { buildGrid, classifyReach, deepestByYear, eligibleCategories, LATEST_YEAR, PAST_YEARS, reachOrder, YEARS, type Deepest, type GridCell, type Reach } from "./lib/reach";
import type { Profile } from "./profile";
import { getCatalog, type Catalog, type Opt } from "./server/catalog";
import { findAllotments, findCutoffs, findReachInputs, type CutoffQuery } from "./server/queries";
import { optionId, rounds, type College, type Course, type Cutoff, type Notice, type Round, type Term } from "./types";

// Data comes from Postgres (MCC import, prisma/import-mcc.ts) through ./server; the small, slow-changing part (colleges,
// courses, sources, terms, option list) is a per-process catalog, cutoffs and allotments are filtered in SQL per call.
// Without a database every call throws DataUnavailableError and Decide shows "Data unavailable": never stand-in data.

export { DataUnavailableError } from "./server/catalog";
export type { YearInfo } from "./server/catalog";

/** Colleges, courses and sources only. Cutoffs and allotments are queried per call, never loaded whole. */
export async function getDecideData() {
  const cat = await getCatalog();
  return { colleges: cat.colleges, courses: cat.courses, sources: cat.sources };
}

export async function getCollege(slug: string): Promise<College | null> {
  return (await getCatalog()).collegeBySlug.get(slug) ?? null;
}

export { LATEST_YEAR, PAST_YEARS, YEARS };

/** Server-side pagination: 1-based page. Lists return one page; without a PageQuery they return every row. */
export type PageQuery = { page: number; pageSize: number };
export type Paged<T> = { rows: T[]; total: number; page: number; pageSize: number };

function paged<T>(all: T[], pg?: PageQuery): Paged<T> {
  if (!pg) return { rows: all, total: all.length, page: 1, pageSize: Math.max(1, all.length) };
  const page = Math.min(Math.max(1, pg.page), Math.max(1, Math.ceil(all.length / pg.pageSize)));
  return { rows: all.slice((page - 1) * pg.pageSize, page * pg.pageSize), total: all.length, page, pageSize: pg.pageSize };
}

export type OptionTerms = { fee?: Term; stipend?: Term; bond?: Term; penalty?: Term };

export type OptionRow = {
  id: string;
  college: Pick<College, "key" | "slug" | "name" | "state" | "type">;
  course: Course;
  quota: string;
  reach: Reach;
  latest: Deepest | null; // latest year's R1 (provisional while its source is)
  byYear: Record<number, Deepest | null>;
  /** year → round → deepest closing among eligible categories (with its seat category); n = allotments, all categories */
  grid: Record<number, Partial<Record<Round, GridCell>>>;
  /** Allotments made per year, every round and every seat category; null when the year has none. Not the seat matrix. */
  allotmentsByYear: Record<number, number | null>;
  /** Fee, stipend, bond and seat-leaving penalty as published, each with its source document. */
  terms: OptionTerms;
  feeInr: number | null;
  feeText: string | null;
  stipendText: string | null;
  bondText: string | null;
  bondYears: number | null;
  penaltyText: string | null;
};

export type OptionFilters = { search?: string; reach?: Reach[]; includeProvisional?: boolean; showClosed?: boolean };

/** Fee/stipend/bond terms are published per program: DNB, DrNB and NBEMS Diploma seats vs medical-college seats (MD, MS, Diploma, MCh…). */
export const programOf = (degree: string): Term["program"] => (/^(DNB|DrNB|NBEMS)/.test(degree) ? "DNB" : "MD");

function termsFor(cat: Catalog, college: string, degree: string): OptionTerms {
  const program = programOf(degree);
  const get = (kind: Term["kind"]) => cat.termOf.get(`${college}|${program}|${kind}`);
  return { fee: get("FEE"), stipend: get("STIPEND"), bond: get("BOND"), penalty: get("PENALTY") };
}

/** Amount for sorting and caps: the parsed amount, else the first rupee figure in the text (year 1). */
const amountOf = (t: Term | null | undefined) => (t ? (t.amountInr ?? firstRupees(t.text)) : null);

const provisionalKeys = (cat: Catalog) => new Set(cat.sources.filter((s) => s.provisional).map((s) => s.key));
const latestR1Provisional = (cat: Catalog) => cat.sources.some((s) => s.year === LATEST_YEAR && s.round === "R1" && s.provisional);

function sumByYear(list: Cutoff[]) {
  return Object.fromEntries(YEARS.map((y) => {
    const xs = list.filter((c) => c.year === y);
    return [y, xs.length ? xs.reduce((s, c) => s + c.n, 0) : null];
  })) as Record<number, number | null>;
}

/** `eligible` overrides the seat categories that give closings (Last ranks: one chosen category). */
function buildRow(cat: Catalog, o: Opt, list: Cutoff[], profile: Profile | null, includeProvisional: boolean, eligibleOverride?: Set<string>): OptionRow {
  const college = cat.collegeByKey.get(o.college)!;
  const course = cat.courseOf.get(`${o.degree}|${o.specialty}`)!;
  const eligible = eligibleOverride ?? (profile ? new Set<string>(eligibleCategories(profile.category, profile.pwd)) : null);
  const mine = eligible ? list.filter((c) => eligible.has(c.category)) : list;
  const provisional = provisionalKeys(cat);
  const deepest = deepestByYear(mine, provisional);
  const t = termsFor(cat, college.key, course.degree);
  return {
    id: o.id,
    college: { key: college.key, slug: college.slug, name: college.name, state: college.state, type: college.type },
    course,
    quota: o.quota,
    reach: profile ? classifyReach(profile.rank, mine, { latestYear: LATEST_YEAR, pastYears: PAST_YEARS, includeLatest: includeProvisional }) : "no-data",
    latest: deepestByYear(mine.filter((c) => c.year === LATEST_YEAR && c.round === "R1"), provisional).get(LATEST_YEAR) ?? null,
    byYear: Object.fromEntries(YEARS.map((y) => [y, deepest.get(y) ?? null])),
    grid: buildGrid(list, eligible, provisional),
    allotmentsByYear: sumByYear(list),
    terms: t,
    feeInr: t.fee?.amountInr ?? null,
    feeText: t.fee?.text ?? null,
    stipendText: t.stipend?.text ?? null,
    bondText: t.bond?.text ?? null,
    bondYears: bondYears(t.bond?.text),
    penaltyText: t.penalty?.text ?? null,
  };
}

function groupByOption(cutoffs: Cutoff[]) {
  const groups = new Map<string, Cutoff[]>();
  for (const c of cutoffs) {
    const k = optionId(c);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  return groups;
}

// A page may ask for the same options twice in one render; share the read.
const cutoffsOnce = cache((cat: Catalog, query: string) => findCutoffs(cat, JSON.parse(query) as CutoffQuery));

/** Cutoffs of the given options only: their CollegeSpecialty ids (and quotas, when few) go into the SQL WHERE. */
async function rowsFor(cat: Catalog, opts: Opt[], profile: Profile | null, includeProvisional: boolean, narrow = true) {
  const quotas = [...new Set(opts.map((o) => o.quota))];
  const query: CutoffQuery = narrow ? { cs: [...new Set(opts.map((o) => o.cs))], quotas: quotas.length < cat.meta.quotas.length ? quotas : undefined } : {};
  const cutoffs = await cutoffsOnce(cat, JSON.stringify(query));
  const groups = groupByOption(cutoffs);
  return opts.map((o) => buildRow(cat, o, groups.get(o.id) ?? [], profile, includeProvisional));
}

/** Her profile filters on one option: course, degree, quota, state, fee cap and bond cap (unknown fee or bond passes). */
function optMatches(cat: Catalog, o: Opt, p: Profile | null) {
  if (!p) return true;
  const state = cat.collegeByKey.get(o.college)?.state ?? null;
  if (p.specialties.length && !p.specialties.includes(o.specialty)) return false;
  if (p.degrees.length && !p.degrees.includes(o.degree)) return false;
  if (p.quotas.length && !p.quotas.includes(o.quota)) return false;
  if (p.states.length && (state == null || !p.states.includes(state))) return false;
  if (p.maxFeeLakh == null && p.maxBondYears == null) return true;
  const t = termsFor(cat, o.college, o.degree);
  const fee = amountOf(t.fee);
  const bond = bondYears(t.bond?.text);
  return (p.maxFeeLakh == null || fee == null || fee <= p.maxFeeLakh * 100000) && (p.maxBondYears == null || bond == null || bond <= p.maxBondYears);
}

/**
 * Options in her profile, labelled by reach, deepest-closing first within a label. `counts` are per label before the
 * reach filter, closed included (what the reach chips show). Pass `pg` to get one page; `total` counts every row.
 */
export async function listOptions(profile: Profile | null, f: OptionFilters = {}, pg?: PageQuery) {
  const cat = await getCatalog();
  const includeProvisional = f.includeProvisional ?? true;
  const q = f.search?.trim().toLowerCase();
  const opts = cat.options.filter((o) => {
    if (!optMatches(cat, o, profile)) return false;
    if (!q) return true;
    const college = cat.collegeByKey.get(o.college)!;
    const course = cat.courseOf.get(`${o.degree}|${o.specialty}`)!;
    return `${college.name} ${college.state ?? ""} ${course.name} ${course.degree}`.toLowerCase().includes(q);
  });
  const narrow = opts.length < cat.options.length / 2;
  const every = (await rowsFor(cat, opts, profile, includeProvisional, narrow)).sort(
    (a, b) => reachOrder.indexOf(a.reach) - reachOrder.indexOf(b.reach) || (b.byYear[2025]?.closing ?? 0) - (a.byYear[2025]?.closing ?? 0),
  );
  const counts = Object.fromEntries(reachOrder.map((r) => [r, every.filter((x) => x.reach === r).length])) as Record<Reach, number>;
  const all = every.filter((r) => !f.reach?.length || f.reach.includes(r.reach));
  const showClosed = f.showClosed || f.reach?.includes("closed-before");
  const rows = showClosed ? all : all.filter((r) => r.reach !== "closed-before");
  return { ...paged(rows, pg), hiddenClosed: showClosed ? 0 : all.length - rows.length, counts };
}

export async function getOptionsByIds(ids: string[], profile: Profile | null) {
  const cat = await getCatalog();
  const opts = ids.flatMap((id) => cat.optionById.get(id) ?? []);
  return rowsFor(cat, opts, profile, true); // no ids → no query (cs = [])
}

const sumYear = (opts: Opt[], year: number) => (opts.some((o) => o.byYear[year] != null) ? opts.reduce((s, o) => s + (o.byYear[year] ?? 0), 0) : null);

/** One institute: every option here (`options`), the ones in her profile (`yours`), allotments per year, terms per program. */
export async function getInstitute(slug: string, profile: Profile | null) {
  const cat = await getCatalog();
  const college = cat.collegeBySlug.get(slug);
  if (!college) return null;
  const opts = cat.options.filter((o) => o.college === college.key);
  const options = await rowsFor(cat, opts, profile, true);
  const mine = new Set(opts.filter((o) => optMatches(cat, o, profile)).map((o) => o.id));
  const allotmentsByYear = YEARS.map((year) => ({ year, n: sumYear(opts, year) }));
  const terms = { md: termsFor(cat, college.key, "MD"), dnb: termsFor(cat, college.key, "DNB") };
  return { college, options, yours: options.filter((o) => mine.has(o.id)), allotmentsByYear, terms };
}

export async function rankScan(rank: number, year: number, window = 500) {
  const cat = await getCatalog();
  const { rows } = await findAllotments(cat, { year, from: Math.max(1, rank - window), to: rank + window });
  const out = rows.map((a) => {
    const c = cat.collegeByKey.get(a.college);
    return { ...a, collegeName: c?.name ?? a.college, collegeSlug: c?.slug ?? "" };
  });
  return rounds.map((round) => ({ round, rows: out.filter((r) => r.round === round) })).filter((g) => g.rows.length);
}

export type LastRanksFilters = { degree?: string; specialty: string; category?: string; quota?: string; sort?: { year: number; round: Round; dir: "asc" | "desc" } };

/**
 * Every institute's closing rank by year and round for one course, on one seat category (all when omitted); bracketed
 * n counts allotments in every category. `rows` holds options with a closing on that category (sorted by name, or by
 * one year/round column); `empty` counts the rest; `columns` lists the years and rounds that have data.
 */
export async function lastRanks(f: LastRanksFilters, pg?: PageQuery) {
  const cat = await getCatalog();
  const opts = cat.options.filter((o) => o.specialty === f.specialty && (!f.degree || o.degree === f.degree) && (!f.quota || o.quota === f.quota));
  const groups = groupByOption(await findCutoffs(cat, { cs: [...new Set(opts.map((o) => o.cs))], quotas: f.quota ? [f.quota] : undefined }));
  const eligible = f.category ? new Set([f.category]) : undefined;
  const built = opts.map((o) => buildRow(cat, o, groups.get(o.id) ?? [], null, true, eligible));
  let rows = built.filter((r) => Object.keys(r.grid).length > 0);
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r.grid).map(Number)))].sort().map((year) => ({
    year,
    rounds: rounds.filter((rd) => rows.some((r) => r.grid[year]?.[rd])),
    provisional: rows.some((r) => Object.values(r.grid[year] ?? {}).some((c) => c?.provisional)),
  }));
  const s = f.sort;
  if (s) {
    const v = (x: OptionRow) => x.grid[s.year]?.[s.round]?.closing ?? (s.dir === "asc" ? Infinity : -1);
    rows = rows.sort((a, b) => (s.dir === "asc" ? v(a) - v(b) : v(b) - v(a)));
  } else rows = rows.sort((a, b) => a.college.name.localeCompare(b.college.name));
  return { ...paged(rows, pg), empty: built.length - rows.length, columns };
}

/** Allotments made per option and year (Σ cutoff n, every round), from the catalog: no cutoff rows are read. */
export async function allotmentTrends(f: { specialty?: string; specialties?: string[]; degree?: string }, pg?: PageQuery) {
  const cat = await getCatalog();
  const rows = cat.options
    .filter((o) => (!f.specialty || o.specialty === f.specialty) && (!f.specialties?.length || f.specialties.includes(o.specialty)) && (!f.degree || o.degree === f.degree))
    .map((o) => {
      const c = cat.collegeByKey.get(o.college)!;
      return {
        id: o.id,
        college: { key: c.key, slug: c.slug, name: c.name, state: c.state, type: c.type },
        course: cat.courseOf.get(`${o.degree}|${o.specialty}`)!,
        quota: o.quota,
        byYear: Object.fromEntries(YEARS.map((y) => [y, o.byYear[y] ?? null])) as Record<number, number | null>,
      };
    });
  return paged(rows, pg);
}

export async function getMeta() {
  return (await getCatalog()).meta;
}

/** Counselling notices: none until announcements are imported from MCC with their official links. Never made up. */
export async function getNotices(): Promise<Notice[]> {
  await getCatalog(); // same availability as the rest of Decide
  // ponytail: map Announcement rows here once they are imported.
  return [];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Everything the overview dashboard draws, from the same rows and counts Options uses so the numbers always agree.
 * The strip is slim on purpose (one point per option with a 2025 closing, no ids or links); `summary` is its table view.
 */
export async function dashboard(profile: Profile) {
  const { rows, counts, total } = await listOptions(profile, { showClosed: true });
  const courses = [...new Map(rows.map((r) => [r.course.slug, r.course])).values()];
  const strip = courses.map((course) => ({
    course,
    points: rows
      .filter((r) => r.course.slug === course.slug && r.byYear[2025])
      .map((r) => ({ name: r.college.name, quota: r.quota, closing: r.byYear[2025]!.closing, round: r.byYear[2025]!.round, category: r.byYear[2025]!.category })),
  }));
  const summary = strip.map(({ course, points }) => {
    const xs = points.map((p) => p.closing);
    const reached = xs.filter((c) => c >= profile.rank).length;
    return { course, options: xs.length, reached, closedBefore: xs.length - reached, deepest: xs.length ? Math.max(...xs) : null, median: median(xs), shallowest: xs.length ? Math.min(...xs) : null };
  });
  const trendRounds: Round[] = ["R1", "R2", "R3", "stray"];
  const trend = courses.map((course) => ({
    course,
    points: trendRounds.map((round) => {
      const vals = rows.filter((r) => r.course.slug === course.slug).flatMap((r) => (r.grid[2025]?.[round] ? [r.grid[2025]![round]!.closing] : []));
      return { round, median: median(vals), n: vals.length };
    }),
  }));
  return { total, counts, strip, summary, trend };
}

// ---------- Institutes, allotments, fees ----------

export type InstituteFilters = { search?: string; state?: string; type?: string; course?: string; sort?: "name" | "beds" | "established" | "allotments" };

/**
 * Institutes, sorted, one page at a time. With a profile, `bestReach` is the best label among the options here that
 * match her profile (course, degree, quota, state, fee, bond), and `best` names that option.
 */
export async function listInstitutes(profile: Profile | null, f: InstituteFilters = {}, pg?: PageQuery) {
  const cat = await getCatalog();
  const q = f.search?.trim().toLowerCase();
  const byCollege = new Map<string, Opt[]>();
  for (const o of cat.options) (byCollege.get(o.college) ?? byCollege.set(o.college, []).get(o.college)!).push(o);
  const colleges = cat.colleges
    .filter((c) => !q || `${c.name} ${c.state ?? ""}`.toLowerCase().includes(q))
    .filter((c) => !f.state || c.state === f.state)
    .filter((c) => !f.type || c.type === f.type)
    .filter((c) => !f.course || (byCollege.get(c.key) ?? []).some((o) => cat.courseOf.get(`${o.degree}|${o.specialty}`)!.slug === f.course))
    .map((college) => ({ college, allotments2025: sumYear(byCollege.get(college.key) ?? [], 2025) }));
  const by = f.sort ?? "name";
  colleges.sort((a, b) =>
    by === "beds" ? (b.college.beds ?? 0) - (a.college.beds ?? 0)
    : by === "established" ? (a.college.established ?? 9999) - (b.college.established ?? 9999)
    : by === "allotments" ? (b.allotments2025 ?? -1) - (a.allotments2025 ?? -1)
    : a.college.name.localeCompare(b.college.name),
  );
  const page = paged(colleges, pg);
  // Reach only for this page's options that match her profile, so only those cutoffs are read.
  const mineOf = new Map(page.rows.map(({ college }) => [college.key, (byCollege.get(college.key) ?? []).filter((o) => optMatches(cat, o, profile))]));
  let reachOf = new Map<string, Reach>();
  if (profile) {
    const opts = [...mineOf.values()].flat();
    const inputs = await findReachInputs(cat, {
      cs: opts.length < cat.options.length / 2 ? [...new Set(opts.map((o) => o.cs))] : undefined,
      categories: eligibleCategories(profile.category, profile.pwd),
      pastYears: PAST_YEARS,
      latestYear: LATEST_YEAR,
    });
    const opt = { latestYear: LATEST_YEAR, pastYears: PAST_YEARS, includeLatest: true };
    reachOf = new Map([...inputs].map(([id, list]) => [id, classifyReach(profile.rank, list, opt)]));
  }
  const prov = latestR1Provisional(cat);
  const rows = page.rows.map(({ college, allotments2025 }) => {
    const opts = byCollege.get(college.key) ?? [];
    const best = (mineOf.get(college.key) ?? [])
      .map((o) => ({ o, reach: reachOf.get(o.id) ?? ("no-data" as Reach) }))
      .reduce<{ o: Opt; reach: Reach } | null>((a, b) => (!a || reachOrder.indexOf(b.reach) < reachOrder.indexOf(a.reach) ? b : a), null);
    return {
      college,
      courses: [...new Map(opts.map((o) => cat.courseOf.get(`${o.degree}|${o.specialty}`)!).map((c) => [c.slug, c])).values()],
      quotas: [...new Set(opts.map((o) => o.quota))],
      allotments2025,
      bestReach: (profile && best ? best.reach : "no-data") as Reach,
      /** The option the best label comes from; provisional when that label rests on a provisional latest-year R1. */
      best: profile && best && best.reach !== "no-data" ? { course: cat.courseOf.get(`${best.o.degree}|${best.o.specialty}`)!, quota: best.o.quota, provisional: best.reach === "reached-latest" && prov } : null,
    };
  });
  return { ...page, rows };
}

export type AllotmentFilters = { year?: number; round?: Round; course?: string; quota?: string; category?: string; state?: string; from?: number; to?: number };

/** Allotments (ranks only, never names), newest year, then round, then rank. Page with limit = pageSize, offset = (page − 1) × pageSize. */
export async function listAllotments(f: AllotmentFilters, limit: number, collegeKey?: string, offset = 0) {
  const cat = await getCatalog();
  const course = f.course ? cat.courses.find((c) => c.slug === f.course) : undefined;
  // College, course and state become a list of CollegeSpecialty ids for the SQL WHERE.
  const narrow = collegeKey || f.course || f.state;
  const cs = narrow
    ? [...cat.pairs.values()]
        .filter((p) => (!collegeKey || p.college === collegeKey) && (!f.course || (course && p.degree === course.degree && p.specialty === course.specialty)) && (!f.state || cat.collegeByKey.get(p.college)?.state === f.state))
        .map((p) => p.cs)
    : undefined;
  const { total, rows } = await findAllotments(cat, { cs, year: f.year, round: f.round, quota: f.quota, category: f.category, from: f.from, to: f.to }, { limit, offset, count: true });
  const provisional = new Set(cat.sources.filter((s) => s.provisional).map((s) => `${s.year}|${s.round}`));
  return {
    total,
    rows: rows.map((a) => {
      const t = termsFor(cat, a.college, a.degree);
      const c = cat.courseOf.get(`${a.degree}|${a.specialty}`);
      return {
        ...a,
        college: cat.collegeByKey.get(a.college)!,
        courseName: `${a.degree} ${c?.name ?? a.specialty}`,
        courseSlug: c?.slug ?? "",
        provisional: provisional.has(`${a.year}|${a.round}`),
        terms: t,
        feeInr: t.fee?.amountInr ?? null,
        feeText: t.fee?.text ?? null,
        stipendText: t.stipend?.text ?? null,
        bondText: t.bond?.text ?? null,
        penaltyText: t.penalty?.text ?? null,
      };
    }),
  };
}

/** Fee, stipend, bond and seat-leaving penalty per institute and program. Sorts use the first rupee figure (year 1); unknown last. */
export async function listFees(f: { program?: "MD" | "DNB"; state?: string; maxFeeLakh?: number; sort?: "fee" | "stipend" | "name" }, pg?: PageQuery) {
  const cat = await getCatalog();
  const rows = cat.colleges.flatMap((college) =>
    (["MD", "DNB"] as const).flatMap((program) => {
      const t = termsFor(cat, college.key, program);
      if (!t.fee && !t.stipend && !t.bond && !t.penalty) return [];
      return [{ college, program, fee: t.fee ?? null, stipend: t.stipend ?? null, bond: t.bond ?? null, penalty: t.penalty ?? null, bondYears: bondYears(t.bond?.text) }];
    }),
  );
  const out = rows
    .filter((r) => !f.program || r.program === f.program)
    .filter((r) => !f.state || r.college.state === f.state)
    .filter((r) => f.maxFeeLakh == null || (amountOf(r.fee) ?? 0) <= f.maxFeeLakh * 100000);
  const by = f.sort ?? "fee";
  out.sort((a, b) =>
    by === "stipend" ? (amountOf(b.stipend) ?? -1) - (amountOf(a.stipend) ?? -1)
    : by === "name" ? a.college.name.localeCompare(b.college.name)
    : (amountOf(a.fee) ?? Infinity) - (amountOf(b.fee) ?? Infinity),
  );
  return paged(out, pg);
}
