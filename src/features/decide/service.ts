import "server-only";
import { cache } from "react";
import { bondYears, firstRupees } from "./lib/format";
import { buildGrid, classifyReach, deepestByYear, eligibleCategories, LATEST_YEAR, PAST_YEARS, reachOrder, YEARS, type Deepest, type GridCell, type Reach, type ReachInput } from "./lib/reach";
import { profileCourseFilter, profileHasCourse, profileQuotas, type Profile } from "./profile";
import { getCatalog, type Catalog, type Opt } from "./server/catalog";
import { findAllotments, findCutoffs, findReachInputs, type CutoffQuery } from "./server/queries";
import { hasOption, listSeats, pickLists, seatCountsFor, seatLists, sumSeats } from "./server/seats";
import { optionId, rounds, seatKinds, type Category, type College, type Course, type Cutoff, type Notice, type Round, type SeatKind, type SeatList, type Term } from "./types";

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
  /** The label rests on the provisional latest-year R1: without that round it would be another label. */
  reachProvisional: boolean;
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
  /**
   * Options and institute rows only: seats for this option (its quota, her seat categories; all without a profile) in
   * the newest clear vacancy list (`seatList` beside the rows), null when that list prints none. One list, never kinds added.
   */
  seats?: number | null;
  /** Options rows only: the same per list of that round (`seatLists`: clear, virtual, new). Kinds overlap: never add them. */
  seatsBy?: SeatsBy;
};

/** Seats of one option per seat list kind; null = that list prints none; a kind with no list is absent. */
export type SeatsBy = Partial<Record<SeatKind, number | null>>;

/** `hasSeats`: only options with seats in the newest clear vacancy list (true or "clear"), or that round's virtual or new list. */
export type OptionFilters = { search?: string; reach?: Reach[]; includeProvisional?: boolean; showClosed?: boolean; hasSeats?: boolean | SeatKind };

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

/**
 * Her label, and whether it rests on the provisional latest-year R1 (`prov`: that round is in and provisional): the
 * label it would be without that round differs.
 */
function labelOf(rank: number, list: ReachInput[], includeLatest: boolean, prov: boolean): { reach: Reach; provisional: boolean } {
  const opt = { latestYear: LATEST_YEAR, pastYears: PAST_YEARS };
  const reach = classifyReach(rank, list, { ...opt, includeLatest });
  return { reach, provisional: includeLatest && prov && classifyReach(rank, list, { ...opt, includeLatest: false }) !== reach };
}

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
  const label = profile ? labelOf(profile.rank, mine, includeProvisional, latestR1Provisional(cat)) : { reach: "no-data" as const, provisional: false };
  return {
    id: o.id,
    college: { key: college.key, slug: college.slug, name: college.name, state: college.state, type: college.type },
    course,
    quota: o.quota,
    reach: label.reach,
    reachProvisional: label.provisional,
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

/**
 * Her profile filters on one option: course, degree, quota (none ticked: the open quotas only), state, fee cap and
 * bond cap (unknown fee or bond passes).
 */
function optMatches(cat: Catalog, o: Pick<Opt, "college" | "degree" | "specialty"> & { quota: string | null }, p: Profile | null) {
  if (!p) return true;
  const state = cat.collegeByKey.get(o.college)?.state ?? null;
  if (!profileHasCourse(p, o)) return false;
  if (o.quota == null || !profileQuotas(p).includes(o.quota)) return false;
  if (p.states.length && (state == null || !p.states.includes(state))) return false;
  if (p.maxFeeLakh == null && p.maxBondYears == null) return true;
  const t = termsFor(cat, o.college, o.degree);
  const fee = amountOf(t.fee);
  const bond = bondYears(t.bond?.text);
  return (p.maxFeeLakh == null || fee == null || fee <= p.maxFeeLakh * 100000) && (p.maxBondYears == null || bond == null || bond <= p.maxBondYears);
}

type Ranked = { o: Opt; reach: Reach; provisional: boolean; deepest: ReachInput | undefined };

/**
 * Every option given, labelled, deepest closing of the later past year first within a label (`deepest`, with its round
 * and seat category). From one SQL row per option (findReachInputs), never every cutoff: a profile with no course
 * ticked covers ~11,800 options, and only a page of them is built in full.
 */
async function rankOptions(cat: Catalog, opts: Opt[], profile: Profile | null, includeProvisional: boolean): Promise<Ranked[]> {
  const inputs = await findReachInputs(cat, {
    cs: opts.length < cat.options.length / 2 ? [...new Set(opts.map((o) => o.cs))] : undefined,
    categories: profile ? eligibleCategories(profile.category, profile.pwd) : undefined,
    pastYears: PAST_YEARS,
    latestYear: LATEST_YEAR,
  });
  const prov = latestR1Provisional(cat);
  const ranked = opts.map((o) => {
    const list = inputs.get(o.id) ?? [];
    const label = profile ? labelOf(profile.rank, list, includeProvisional, prov) : { reach: "no-data" as const, provisional: false };
    const deepest = list.filter((c) => c.year === PAST_YEARS[1]).reduce<ReachInput | undefined>((a, c) => (!a || c.closing > a.closing ? c : a), undefined);
    return { o, ...label, deepest };
  });
  return ranked.sort((a, b) => reachOrder.indexOf(a.reach) - reachOrder.indexOf(b.reach) || (b.deepest?.closing ?? 0) - (a.deepest?.closing ?? 0));
}

const countsOf = (xs: { reach: Reach }[]) => Object.fromEntries(reachOrder.map((r) => [r, xs.filter((x) => x.reach === r).length])) as Record<Reach, number>;

/**
 * The newest clear vacancy list (the R2 seats column), or null: none imported, or the unit-test fixture (no seat lists).
 * `kind` + `of`: that kind of list in the same year and round as `of`.
 */
async function seatListNow(cat: Catalog, kind: SeatKind = "clear", of?: SeatList): Promise<SeatList | null> {
  return cat.mem ? null : (pickLists(await seatLists(), { kind, year: of?.year, round: of?.round })[0] ?? null);
}

/**
 * Seats in `list` that match her courses, quotas, states and seat categories (fee and bond caps aside, as on Seats) but
 * whose course and quota is not an option: no past allotments, so no closing rank to label. All of a college's without
 * a profile. Null when there is no list. Options and institute pages name them and link Seats (`nohist=1`).
 */
async function unlistedOf(cat: Catalog, list: SeatList | null, profile: Profile | null, college?: string) {
  if (!list) return null;
  const p = profile && { ...profile, maxFeeLakh: null, maxBondYears: null };
  const { rows } = await listSeats({
    list: list.key,
    college,
    ...(p && profileCourseFilter(p)),
    categories: p ? eligibleCategories(p.category, p.pwd) : undefined,
  });
  const out = rows.filter((r) => !hasOption(cat, r) && optMatches(cat, { college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota }, p));
  const options = new Set(out.map((r) => [r.college.key, r.degree, r.specialty, r.quota].join("~"))).size;
  return { list, options, seats: out.reduce((a, r) => a + r.seats, 0) };
}

/** Options page: seats in her profile with no option, in the newest clear vacancy list or that round's `kind` list (see unlistedOf). */
export async function unlistedSeats(profile: Profile, kind: SeatKind = "clear") {
  const cat = await getCatalog();
  return unlistedOf(cat, (await roundLists(cat)).find((l) => l.kind === kind) ?? null, profile);
}

/**
 * The newest clear vacancy list's round: one list per kind (seatKinds order), clear first; empty without a clear list.
 * ponytail: a round with two PDFs of one kind (2025 R2 newly added) gives the newest; list both if a current round has two.
 */
async function roundLists(cat: Catalog): Promise<SeatList[]> {
  const all = cat.mem ? [] : await seatLists();
  const [clear] = pickLists(all, {});
  return !clear ? [] : seatKinds.flatMap((kind) => pickLists(all, { kind, year: clear.year, round: clear.round }).slice(0, 1));
}

/** The seat lists behind the R2 seats columns (Options, Choices). */
export const currentSeatLists = async () => roundLists(await getCatalog());

/** Seats per option id in that ONE list, in the option's quota and her seat categories (all without a profile); absent = none printed. */
async function seatsOf(list: SeatList | null, opts: Opt[], profile: Profile | null): Promise<Map<string, number>> {
  if (!list || !opts.length) return new Map();
  const { seats } = await seatCountsFor([...new Set(opts.map((o) => o.cs))], list.key);
  const categories = profile ? eligibleCategories(profile.category, profile.pwd) : undefined;
  return new Map(opts.flatMap((o): [string, number][] => {
    const n = sumSeats(seats[o.cs], { quota: o.quota, categories });
    return n == null ? [] : [[o.id, n]];
  }));
}

/** Seats per option id in each list (one kind each, never added). */
async function seatsByKind(lists: SeatList[], opts: Opt[], profile: Profile | null): Promise<Map<string, SeatsBy>> {
  const per = await Promise.all(lists.map((l) => seatsOf(l, opts, profile)));
  return new Map(opts.map((o) => [o.id, Object.fromEntries(lists.map((l, i) => [l.kind, per[i].get(o.id) ?? null]))]));
}

/** Choices: seats of saved options (ids) in each list of the newest round, as on Options. Unknown ids are left out. */
export async function optionSeats(ids: string[], profile: Profile | null) {
  const cat = await getCatalog();
  const lists = await roundLists(cat);
  return { lists, seats: Object.fromEntries(await seatsByKind(lists, ids.flatMap((id) => cat.optionById.get(id) ?? []), profile)) };
}

/**
 * Options in her profile, labelled by reach, deepest-closing first within a label. `counts` are per label before the
 * reach filter, closed included (what the reach chips show). Pass `pg` to get one page; `total` counts every row.
 * `seatList` is the clear vacancy list behind each row's `seats` (null: no list), `seatLists` that round's lists behind `seatsBy`.
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
  const [ranked, lists] = await Promise.all([rankOptions(cat, opts, profile, includeProvisional), roundLists(cat)]);
  const seatList = lists[0] ?? null;
  // Seats of every option only to filter on them; otherwise just this page's. The filter is on one list (clear by
  // default); with clear, the options it hides that have seats in the round's virtual vacancy list are counted.
  const kind = f.hasSeats === true ? "clear" : f.hasSeats || null;
  const byKind = (k: SeatKind) => lists.find((l) => l.kind === k) ?? null;
  const virtualList = kind === "clear" ? byKind("virtual") : null;
  const [seatsAll, virtual] = kind ? await Promise.all([seatsOf(byKind(kind), opts, profile), seatsOf(virtualList, opts, profile)]) : [null, null];
  const has = (m: Map<string, number> | null, x: Ranked) => (m?.get(x.o.id) ?? 0) > 0;
  const every = seatsAll ? ranked.filter((x) => has(seatsAll, x)) : ranked;
  const all = every.filter((r) => !f.reach?.length || f.reach.includes(r.reach));
  const showClosed = f.showClosed || f.reach?.includes("closed-before");
  const shown = showClosed ? all : all.filter((r) => r.reach !== "closed-before");
  const virtualOnly = seatsAll
    ? ranked.filter((x) => !has(seatsAll, x) && has(virtual, x) && (!f.reach?.length || f.reach.includes(x.reach)) && (showClosed || x.reach !== "closed-before")).length
    : 0;
  const page = paged(shown, pg);
  const pageOpts = page.rows.map((x) => x.o);
  const [built, seats] = await Promise.all([
    rowsFor(cat, pageOpts, profile, includeProvisional, pageOpts.length < cat.options.length / 2),
    seatsByKind(lists, pageOpts, profile),
  ]);
  const hidden = all.filter((r) => !showClosed && r.reach === "closed-before");
  return {
    ...page,
    rows: built.map((r) => ({ ...r, seats: seats.get(r.id)?.clear ?? null, seatsBy: seats.get(r.id) ?? {} })),
    hiddenClosed: hidden.length,
    /** Of the hidden ones, those whose label rests on the provisional latest-year R1 alone. */
    hiddenProvisional: hidden.filter((r) => r.provisional).length,
    counts: countsOf(every),
    seatList,
    seatLists: lists,
    /** With `hasSeats`: options shown but for that filter that have seats only in `list`, the round's virtual vacancy list. */
    virtualOnly: virtualList ? { list: virtualList, options: virtualOnly } : null,
  };
}

export async function getOptionsByIds(ids: string[], profile: Profile | null) {
  const cat = await getCatalog();
  const opts = ids.flatMap((id) => cat.optionById.get(id) ?? []);
  return rowsFor(cat, opts, profile, true); // no ids → no query (cs = [])
}

const sumYear = (opts: Opt[], year: number) => (opts.some((o) => o.byYear[year] != null) ? opts.reduce((s, o) => s + (o.byYear[year] ?? 0), 0) : null);

/**
 * One institute: every option here (`options`, with `seats` in `seatList`), the ones in her profile (`yours`), the
 * seats here in her profile that are no option (`unlisted`), allotments per year, terms per program.
 */
export async function getInstitute(slug: string, profile: Profile | null) {
  const cat = await getCatalog();
  const college = cat.collegeBySlug.get(slug);
  if (!college) return null;
  const opts = cat.options.filter((o) => o.college === college.key);
  const [built, seatList] = await Promise.all([rowsFor(cat, opts, profile, true), seatListNow(cat)]);
  const [seats, unlisted] = await Promise.all([seatsOf(seatList, opts, profile), unlistedOf(cat, seatList, profile, college.key)]);
  const options = built.map((r) => ({ ...r, seats: seats.get(r.id) ?? null }));
  const mine = new Set(opts.filter((o) => optMatches(cat, o, profile)).map((o) => o.id));
  const allotmentsByYear = YEARS.map((year) => ({ year, n: sumYear(opts, year) }));
  const terms = { md: termsFor(cat, college.key, "MD"), dnb: termsFor(cat, college.key, "DNB") };
  return { college, options, yours: options.filter((o) => mine.has(o.id)), allotmentsByYear, terms, seatList, unlisted };
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

export type LastRanksFilters = { degree?: string; specialty: string; category?: string; quota?: string; years?: number[]; sort?: { year: number; round: Round; dir: "asc" | "desc" } };

/**
 * Every institute's closing rank by year and round for one course, on one seat category (all when omitted); bracketed
 * n counts allotments in every category. `years` keeps only those years (in SQL, so totals and every field agree).
 * `rows` holds options with a closing on that category (sorted by name, or by one year/round column); `empty` counts
 * the rest; `columns` lists the years and rounds that have data.
 */
export async function lastRanks(f: LastRanksFilters, pg?: PageQuery) {
  const cat = await getCatalog();
  const opts = cat.options.filter((o) => o.specialty === f.specialty && (!f.degree || o.degree === f.degree) && (!f.quota || o.quota === f.quota));
  const groups = groupByOption(await findCutoffs(cat, { cs: [...new Set(opts.map((o) => o.cs))], quotas: f.quota ? [f.quota] : undefined, years: f.years?.length ? f.years : undefined }));
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

/**
 * Allotments made per option and year (Σ cutoff n, every round), from the catalog: no cutoff rows are read. `profile`:
 * only her courses (profileHasCourse).
 */
export async function allotmentTrends(f: { specialty?: string; degree?: string; profile?: Pick<Profile, "specialties" | "degrees" | "pairs"> | null }, pg?: PageQuery) {
  const cat = await getCatalog();
  const rows = cat.options
    .filter((o) => (!f.specialty || o.specialty === f.specialty) && (!f.degree || o.degree === f.degree) && (!f.profile || profileHasCourse(f.profile, o)))
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

/** One option's deepest closing of the later past year, as the Overview draws and tabulates it. */
export type StripPoint = { name: string; quota: string; closing: number; round: Round; category: Category };

// ponytail: the strip and trend show the courses with the most options, up to 8 courses and about 1,500 dots (an
// all-courses profile would draw ~9,400 dots, a 2.8 MB page); the summary table lists every course. Aggregate per
// course (bins) if a bigger chart is ever wanted.
const STRIP_COURSES = 8;
const STRIP_DOTS = 1500;

/**
 * Everything the overview dashboard draws, from the same labels and counts Options uses so the numbers always agree.
 * `summary` covers every course in her profile (most options first), with the option behind the deepest and the
 * shallowest closing; `strip` (one point per option with a closing in the later past year) and `trend` cover the
 * first courses of it (see STRIP_COURSES).
 */
export async function dashboard(profile: Profile) {
  const cat = await getCatalog();
  const ranked = await rankOptions(cat, cat.options.filter((o) => optMatches(cat, o, profile)), profile, true);
  const [, last] = PAST_YEARS;
  const byCourse = new Map<string, { course: Course; points: StripPoint[]; opts: Opt[] }>();
  for (const { o, deepest: d } of ranked) {
    const course = cat.courseOf.get(`${o.degree}|${o.specialty}`)!;
    const g = byCourse.get(course.slug) ?? byCourse.set(course.slug, { course, points: [], opts: [] }).get(course.slug)!;
    if (!d) continue;
    g.points.push({ name: cat.collegeByKey.get(o.college)!.name, quota: o.quota, closing: d.closing, round: d.round!, category: d.category! });
    g.opts.push(o);
  }
  const courses = [...byCourse.values()].sort((a, b) => b.points.length - a.points.length || a.course.name.localeCompare(b.course.name));
  const summary = courses.map(({ course, points }) => {
    const xs = [...points].sort((a, b) => b.closing - a.closing);
    const reached = xs.filter((p) => p.closing >= profile.rank).length;
    return { course, options: xs.length, reached, closedBefore: xs.length - reached, deepest: xs[0] ?? null, median: median(xs.map((p) => p.closing)), shallowest: xs.at(-1) ?? null };
  });
  const shown: typeof courses = [];
  let dots = 0;
  for (const c of courses) {
    if (shown.length === STRIP_COURSES || (shown.length && dots + c.points.length > STRIP_DOTS)) break;
    shown.push(c);
    dots += c.points.length;
  }
  const strip = shown.map(({ course, points }) => ({ course, points }));
  // The round trend needs each option's closing per round of that year: full rows, for the shown courses only.
  const rows = await rowsFor(cat, shown.flatMap((c) => c.opts), profile, true);
  const trendRounds: Round[] = ["R1", "R2", "R3", "stray"];
  const trend = shown.map(({ course }) => ({
    course,
    points: trendRounds.map((round) => {
      const vals = rows.filter((r) => r.course.slug === course.slug).flatMap((r) => (r.grid[last]?.[round] ? [r.grid[last]![round]!.closing] : []));
      return { round, median: median(vals), n: vals.length };
    }),
  }));
  return { total: ranked.length, counts: countsOf(ranked), strip, summary, trend };
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
  let reachOf = new Map<string, { reach: Reach; provisional: boolean }>();
  if (profile) {
    const opts = [...mineOf.values()].flat();
    const inputs = await findReachInputs(cat, {
      cs: opts.length < cat.options.length / 2 ? [...new Set(opts.map((o) => o.cs))] : undefined,
      categories: eligibleCategories(profile.category, profile.pwd),
      pastYears: PAST_YEARS,
      latestYear: LATEST_YEAR,
    });
    const prov = latestR1Provisional(cat);
    reachOf = new Map([...inputs].map(([id, list]) => [id, labelOf(profile.rank, list, true, prov)]));
  }
  const rows = page.rows.map(({ college, allotments2025 }) => {
    const opts = byCollege.get(college.key) ?? [];
    const best = (mineOf.get(college.key) ?? [])
      .map((o) => ({ o, ...(reachOf.get(o.id) ?? { reach: "no-data" as Reach, provisional: false }) }))
      .reduce<{ o: Opt; reach: Reach; provisional: boolean } | null>((a, b) => (!a || reachOrder.indexOf(b.reach) < reachOrder.indexOf(a.reach) ? b : a), null);
    return {
      college,
      courses: [...new Map(opts.map((o) => cat.courseOf.get(`${o.degree}|${o.specialty}`)!).map((c) => [c.slug, c])).values()],
      quotas: [...new Set(opts.map((o) => o.quota))],
      allotments2025,
      bestReach: (profile && best ? best.reach : "no-data") as Reach,
      /** The option the best label comes from; provisional when that label rests on a provisional latest-year R1. */
      best: profile && best && best.reach !== "no-data" ? { course: cat.courseOf.get(`${best.o.degree}|${best.o.specialty}`)!, quota: best.o.quota, provisional: best.provisional } : null,
    };
  });
  return { ...page, rows };
}

export type AllotmentFilters = { year?: number; round?: Round; course?: string; quota?: string; category?: string; state?: string; from?: number; to?: number };

/**
 * Allotments (ranks only, never names), newest year, then round, then rank, one page. A page past the end returns the
 * last page (as every list here does: `page` says which).
 */
export async function listAllotments(f: AllotmentFilters, pg: PageQuery, collegeKey?: string) {
  const cat = await getCatalog();
  const course = f.course ? cat.courses.find((c) => c.slug === f.course) : undefined;
  // College, course and state become a list of CollegeSpecialty ids for the SQL WHERE.
  const narrow = collegeKey || f.course || f.state;
  const cs = narrow
    ? [...cat.pairs.values()]
        .filter((p) => (!collegeKey || p.college === collegeKey) && (!f.course || (course && p.degree === course.degree && p.specialty === course.specialty)) && (!f.state || cat.collegeByKey.get(p.college)?.state === f.state))
        .map((p) => p.cs)
    : undefined;
  const q = { cs, year: f.year, round: f.round, quota: f.quota, category: f.category, from: f.from, to: f.to };
  const at = (page: number) => findAllotments(cat, q, { limit: pg.pageSize, offset: (page - 1) * pg.pageSize, count: true });
  let page = Math.max(1, pg.page);
  let res = await at(page);
  const last = Math.max(1, Math.ceil(res.total / pg.pageSize));
  if (page > last) {
    page = last;
    res = await at(page);
  }
  const { total, rows } = res;
  const provisional = new Set(cat.sources.filter((s) => s.provisional).map((s) => `${s.year}|${s.round}`));
  return {
    total,
    page,
    pageSize: pg.pageSize,
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
