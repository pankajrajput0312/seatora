import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { DEFAULT_EXAM, type ExamKey } from "@/features/exams/keys";
import { examYears, exams, groupOf, latestOf, perGroup } from "@/features/exams/registry";
import { hospitalInfo, type HospitalInfo } from "./components/institute/institute-data";
import { renameOptionId, type RenamedCollege } from "./lib/choices";
import { searchMatcher } from "./lib/college-aliases";
import { anyTermFilter, feeValue, profileTermFilters, splitByTerms, termsPass, termVerdict, type TermFilters } from "./lib/term-filters";
import { bestClosing, buildGrid, classifyReach, deepestByYear, eligibleCategories, LATEST_YEAR, PAST_YEARS, pastOf, reachEvidence, reachOrder, roundReachOrder, seatsBelow, YEARS, type Deepest, type GridCell, type Latest, type Reach, type ReachAt, type ReachInput, type SeatsBelow } from "./lib/reach";
import { pairKey, profileCourseFilter, profileHasCourse, profileQuotas, type Profile } from "./profile";
import { getCatalog, type Catalog, type Opt } from "./server/catalog";
import { findAllotments, findCutoffs, findReachInputs, type CutoffQuery } from "./server/queries";
import { hasOption, listSeats, optionSeats, pickLists, seatLists, type OptionSeats } from "./server/seats";
import { bucketOfDegree, collegeTerms, courseTerms, type Programme, type ProgrammeTerms } from "./server/terms";
import { optionId, rounds, seatKinds, type OptionSort, type Allotment, type Category, type College, type Course, type Cutoff, type Notice, type OptionsView, type Round, type SeatKind, type SeatList, type Source, type Term } from "./types";

// Data comes from Postgres (MCC import, prisma/import-mcc.ts) through ./server; the small, slow-changing part (colleges,
// courses, sources, terms, option list) is a per-process catalog, cutoffs and allotments are filtered in SQL per call.
// Without a database every call throws DataUnavailableError and Decide shows "Data unavailable": never stand-in data.
// Every call reads one exam (`exam`, default NEET PG; Decide pages pass features/exams/active.tsx activeExam()).

export { DataUnavailableError } from "./server/catalog";
export type { YearInfo } from "./server/catalog";

/** Colleges, courses and sources only. Cutoffs and allotments are queried per call, never loaded whole. */
export async function getDecideData(exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  return { colleges: cat.colleges, courses: cat.courses, sources: cat.sources };
}

/** By slug; an old slug (its college key was retired) gives the college it became (its `slug` is the new one). */
export async function getCollege(slug: string, exam: ExamKey = DEFAULT_EXAM): Promise<College | null> {
  return (await getCatalog(exam)).collegeBySlug.get(slug) ?? (await renamedCollege(slug, exam));
}

/** A retired key's entry: by the key, or by its hash (a key that held a person's name is stored only as its hash). */
const retiredGet = (m: Map<string, string>, k: string) => m.get(k) ?? m.get(`sha256:${createHash("sha256").update(k).digest("hex")}`);

/** The college an old institute slug leads to (its college key was retired: merged, or given a neutral name); else null. */
export async function renamedCollege(slug: string, exam: ExamKey = DEFAULT_EXAM): Promise<College | null> {
  const cat = await getCatalog(exam);
  const key = retiredGet(cat.retiredSlug, slug);
  return (key && cat.collegeByKey.get(key)) || null;
}

/** Option ids under the college key each college has now (an old compare link); other ids unchanged. */
export async function currentOptionIds(ids: string[], exam: ExamKey = DEFAULT_EXAM): Promise<string[]> {
  const cat = await getCatalog(exam);
  return ids.map((id) => renameOptionId(id, (k) => cat.collegeByKey.get(retiredGet(cat.retired, k) ?? "")));
}

/** Retired college keys (or "sha256:<hex>" of them) → the college each is now: the browser renames saved ids with it. */
export async function retiredKeys(exam: ExamKey = DEFAULT_EXAM): Promise<Record<string, RenamedCollege>> {
  const cat = await getCatalog(exam);
  return Object.fromEntries(
    [...cat.retired].map(([old, key]) => {
      const c = cat.collegeByKey.get(key)!; // catalog.ts keeps only keys of colleges it has
      return [old, { key, slug: c.slug, name: c.name }];
    }),
  );
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
  /** The label rests on the provisional latest round (latestRound): without that round it would be another label. */
  reachProvisional: boolean;
  /** With a profile: the label on each of her seat categories alone (`reach` is on all of them together). */
  reachBy?: Partial<Record<Category, Reach>>;
  /** Beside `reachBy`: the closing each of those labels rests on (lib/reach.ts reachEvidence), null without one. */
  reachAt?: Partial<Record<Category, ReachAt | null>>;
  latest: Deepest | null; // latest year's deepest, R1 up to its newest round (provisional while its source is)
  byYear: Record<number, Deepest | null>;
  /** year → round → deepest closing among eligible categories (with its seat category); n = allotments, all categories */
  grid: Record<number, Partial<Record<Round, GridCell>>>;
  /** Allotments made per year, every round and every seat category; null when the year has none. Not the seat matrix. */
  allotmentsByYear: Record<number, number | null>;
  /** Fee, stipend, bond and penalty terms as published, each with its source document. */
  terms: OptionTerms;
  /**
   * The same for this course and quota, read into figures (server/terms.ts courseTerms: that quota's fee-table record,
   * the specialty's own bond figure): what the stat cells (lib/stat-format.ts) and the term filters read.
   */
  fees: ProgrammeTerms;
  /** The institute's type (inferred, not official) and the beds its hospital reports; null when the import has neither (rowsFor, lastRanks). */
  hospital?: RowHospital;
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
  /** Options, Choices and institute rows: the same per list of that round (`seatLists`: clear, virtual, new). Kinds overlap: never add them. */
  seatsBy?: SeatsBy;
  /** Beside `seatsBy`, with a profile: the lists whose seats here are all on seat categories whose own label is not `reach` (lib/reach.ts). */
  seatsBelow?: SeatsBelow[];
  /** NEET SS: the option is another question group's than hers, so her rank isn't compared with it (`reach` "no-data"). */
  otherGroup?: true;
};

export type RowHospital = Pick<HospitalInfo, "type" | "beds" | "mccProfileUrl"> | null;
/** Rows with their institute's type, beds and MCC profile (hospitalInfo, read once per catalog; empty in tests). */
async function withHospital<T extends { college: { key: string } }>(rows: T[], exam: ExamKey): Promise<(T & { hospital: RowHospital })[]> {
  const info = await hospitalInfo(exam);
  return rows.map((r) => {
    const h = info.get(r.college.key);
    return { ...r, hospital: h && (h.type || h.beds || h.mccProfileUrl) ? { type: h.type, beds: h.beds, mccProfileUrl: h.mccProfileUrl } : null };
  });
}

/** Seats of one option per seat list kind; null = that list prints none; a kind with no list is absent. */
export type SeatsBy = Partial<Record<SeatKind, number | null>>;

/**
 * The view when none is asked for: "round" while the newest seat lists' round has no allotment result in the data
 * (its choice filling: the 2026 R2 lists before the 2026 R2 result), else "all"; never "round" without seat lists.
 * From SeatSource and the result PDFs (`sources`), never a date.
 */
export function optionsView(asked: OptionsView | undefined, lists: SeatList[], sources: Pick<Source, "year" | "round">[]): OptionsView {
  const l = lists[0];
  if (!l) return "all";
  return asked ?? (sources.some((s) => s.year === l.year && s.round === l.round) ? "all" : "round");
}

/**
 * `view` undefined: optionsView's default. `showClosed` undefined: the view's (round: shown, all: hidden). `hasSeats`:
 * only options with seats in one list of the newest round (true = clear vacancy) or in "any" of them; false = with or
 * without; undefined: the view's (round: "any", all: with or without).
 */
/** `terms`: fee, stipend, bond, leaving and college-type filters (lib/term-filters.ts); given, they replace her profile's fee and bond caps. */
export type OptionFilters = { search?: string; reach?: Reach[]; includeProvisional?: boolean; showClosed?: boolean; hasSeats?: boolean | SeatKind | "any"; view?: OptionsView; terms?: TermFilters; sort?: OptionSort };

/** Seats per kind in one option's own cells (OptionSeats.cells, `lists` order), in `categories` (all when omitted); null = that list prints none. */
export function seatsByKind(lists: SeatList[], s: Pick<OptionSeats, "cells"> | undefined, categories?: string[]) {
  const mine = lists.map((_, i) => (s?.cells[i] ?? []).filter((c) => !categories || categories.includes(c.category)));
  const by: SeatsBy = Object.fromEntries(lists.map((l, i) => [l.kind, mine[i].length ? mine[i].reduce((a, c) => a + c.seats, 0) : null]));
  return { by, mine };
}

/** The option has seats (more than 0) in that list kind, or in any list. */
export const hasSeatsIn = (by: SeatsBy, kind: SeatKind | "any") => (kind === "any" ? Object.values(by).some((n) => (n ?? 0) > 0) : (by[kind] ?? 0) > 0);

/**
 * The round view's summary: of the options with seats in the round's lists (`by`), how many are in the clear vacancy
 * list, only in the virtual vacancy list, only in the newly added list, have newly added seats at all (most are also
 * clear vacancies), and have no past allotment (`fresh`). Lists overlap: clear + virtualOnly + newOnly = options.
 */
export function roundSummary(xs: { by: SeatsBy; fresh?: boolean }[]) {
  const withSeats = xs.filter((x) => hasSeatsIn(x.by, "any"));
  const n = (f: (x: (typeof xs)[number]) => boolean) => withSeats.filter(f).length;
  const clear = (x: { by: SeatsBy }) => hasSeatsIn(x.by, "clear");
  const virtual = (x: { by: SeatsBy }) => hasSeatsIn(x.by, "virtual");
  return {
    options: withSeats.length,
    clear: n(clear),
    virtualOnly: n((x) => !clear(x) && virtual(x)),
    newOnly: n((x) => !clear(x) && !virtual(x)),
    withNew: n((x) => hasSeatsIn(x.by, "new")),
    fresh: n((x) => !!x.fresh),
  };
}
export type RoundSummary = ReturnType<typeof roundSummary>;

/** Fee/stipend/bond terms are published per program: DNB, DrNB and NBEMS Diploma seats vs medical-college seats (MD, MS, Diploma, MCh…). */
export const programOf = bucketOfDegree;

function termsFor(cat: Catalog, college: string, degree: string): OptionTerms {
  const program = programOf(degree);
  const get = (kind: Term["kind"]) => cat.termOf.get(`${college}|${program}|${kind}`);
  return { fee: get("FEE"), stipend: get("STIPEND"), bond: get("BOND"), penalty: get("PENALTY") };
}

export { feeValue };

const provisionalKeys = (cat: Catalog) => new Set(cat.sources.filter((s) => s.provisional).map((s) => s.key));

/**
 * Her label, and whether it rests on the provisional latest round (`latest.provisional`, latestRound): the label it
 * would be without that round differs.
 */
function labelOf(rank: number, list: ReachInput[], includeLatest: boolean, latest: Latest & { provisional: boolean }): { reach: Reach; provisional: boolean } {
  const opt = { latest, pastYears: pastOf(latest) };
  const reach = classifyReach(rank, list, { ...opt, includeLatest });
  return { reach, provisional: includeLatest && latest.provisional && classifyReach(rank, list, { ...opt, includeLatest: false }) !== reach };
}

function sumByYear(list: Cutoff[], years: number[]) {
  return Object.fromEntries(years.map((y) => {
    const xs = list.filter((c) => c.year === y);
    return [y, xs.length ? xs.reduce((s, c) => s + c.n, 0) : null];
  })) as Record<number, number | null>;
}

/** `eligible` overrides the seat categories that give closings (Last ranks: one chosen category). */
function buildRow(cat: Catalog, o: Opt, list: Cutoff[], her: Profile | null, includeProvisional: boolean, eligibleOverride?: Set<string>): OptionRow {
  // NEET SS: a rank is within one question group; another group's option is built as without a profile.
  const otherGroup = !!her && perGroup(cat.exam) && !her.quotas.includes(o.quota);
  const profile = otherGroup ? null : her;
  const college = cat.collegeByKey.get(o.college)!;
  const course = cat.courseOf.get(`${o.degree}|${o.specialty}`)!;
  const eligible = eligibleOverride ?? (profile ? new Set<string>(eligibleCategories(profile.category, profile.pwd)) : null);
  const mine = eligible ? list.filter((c) => eligible.has(c.category)) : list;
  const provisional = provisionalKeys(cat);
  const deepest = deepestByYear(mine, provisional);
  const t = termsFor(cat, college.key, course.degree);
  const fees = courseTerms(cat, college.key, course.degree, course.specialty, o.quota);
  const latest = latestOf(cat.sources, cat.exam);
  const years = examYears(cat.exam);
  const label: { reach: Reach; provisional: boolean } = o.fresh
    ? { reach: "new", provisional: false }
    : profile ? labelOf(profile.rank, mine, includeProvisional, latest) : { reach: "no-data", provisional: false };
  const opt = { latest, pastYears: pastOf(latest), includeLatest: includeProvisional };
  const reachBy = profile && !eligibleOverride && !o.fresh ? Object.fromEntries([...eligible!].map((c) => [c, classifyReach(profile.rank, mine.filter((x) => x.category === c), opt)])) : undefined;
  // The closing each of those labels rests on, for the notes that say them beside the option's own (seatsBelowNotes).
  const reachAt = reachBy && Object.fromEntries(Object.entries(reachBy).map(([c, r]) => [c, reachEvidence(mine.filter((x) => x.category === c), r!, opt)]));
  return {
    id: o.id,
    college: { key: college.key, slug: college.slug, name: college.name, state: college.state, type: college.type },
    course,
    quota: o.quota,
    reach: label.reach,
    reachProvisional: label.provisional,
    ...(reachBy && { reachBy, reachAt }),
    latest: deepest.get(latest.year) ?? null,
    byYear: Object.fromEntries(years.map((y) => [y, deepest.get(y) ?? null])),
    grid: buildGrid(list, eligible, provisional),
    allotmentsByYear: sumByYear(list, years),
    terms: t,
    fees,
    feeInr: t.fee?.amountInr ?? null,
    feeText: t.fee?.text ?? null,
    stipendText: t.stipend?.text ?? null,
    bondText: t.bond?.text ?? null,
    bondYears: feeValue.bondyrs(fees),
    penaltyText: t.penalty?.text ?? null,
    ...(otherGroup && { otherGroup: true as const }),
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
// Overview labels the same options twice (dashboard and listOptions' counts): one read.
type ReachQuery = Parameters<typeof findReachInputs>[1];
const reachOnce = cache((cat: Catalog, query: string) => findReachInputs(cat, JSON.parse(query) as ReachQuery));
const reachInputs = (cat: Catalog, q: ReachQuery) => reachOnce(cat, JSON.stringify(q));

/** Cutoffs of the given options only: their CollegeSpecialty ids (and quotas, when few) go into the SQL WHERE. */
async function rowsFor(cat: Catalog, opts: Opt[], profile: Profile | null, includeProvisional: boolean, narrow = true) {
  const old = opts.filter((o) => !o.fresh); // new options have no cutoffs to read
  const quotas = [...new Set(old.map((o) => o.quota))];
  const query: CutoffQuery = narrow ? { cs: [...new Set(old.map((o) => o.cs))], quotas: quotas.length < cat.meta.quotas.length ? quotas : undefined } : {};
  const cutoffs = await cutoffsOnce(cat, JSON.stringify(query));
  const groups = groupByOption(cutoffs);
  return withHospital(opts.map((o) => buildRow(cat, o, groups.get(o.id) ?? [], profile, includeProvisional)), cat.exam);
}

/** Her profile's course, degree, quota (none ticked: the open quotas only) and state on one option (any without a profile). */
function inProfile(cat: Catalog, o: Pick<Opt, "college" | "degree" | "specialty"> & { quota: string | null }, p: Profile | null) {
  if (!p) return true;
  const state = cat.collegeByKey.get(o.college)?.state ?? null;
  return profileHasCourse(p, o) && o.quota != null && profileQuotas(p, cat.exam).includes(o.quota) && (!p.states.length || (state != null && p.states.includes(state)));
}
/** The course and quota's terms (the same figures as the Fees page and the stat cells), for the term filters. */
const optTerms = (cat: Catalog, o: Pick<Opt, "college" | "degree" | "specialty"> & { quota: string | null }) => courseTerms(cat, o.college, o.degree, o.specialty, o.quota ?? undefined);
/**
 * Her profile filters on one option (inProfile) and the term filters `tf` (lib/term-filters.ts; default: her fee and
 * bond caps; an unknown value fails unless `keepUnknown`). `types`: college types (hospitalInfo), for a type filter.
 */
function optMatches(cat: Catalog, o: Pick<Opt, "college" | "degree" | "specialty"> & { quota: string | null }, p: Profile | null, tf: TermFilters | null = p && profileTermFilters(p), types?: Map<string, HospitalInfo>) {
  return inProfile(cat, o, p) && (!anyTermFilter(tf) || termsPass(optTerms(cat, o), types?.get(o.college)?.type?.value, tf!));
}
/** College types, read only when a type filter needs them. */
const typesFor = (tf: TermFilters | null | undefined, exam: ExamKey) => (tf?.types?.length ? hospitalInfo(exam) : Promise.resolve(undefined));

type Ranked = { o: Opt; reach: Reach; provisional: boolean; deepest: ReachInput | undefined };

/**
 * Every option given, labelled, deepest closing of the later past year first within a label (`deepest`, with its round
 * and seat category). From one SQL row per option (findReachInputs), never every cutoff: a profile with no course
 * ticked covers ~11,800 options, and only a page of them is built in full.
 */
async function rankOptions(cat: Catalog, opts: Opt[], profile: Profile | null, includeProvisional: boolean): Promise<Ranked[]> {
  const { pastYears, latestYear } = exams[cat.exam];
  const inputs = await reachInputs(cat, {
    cs: opts.length < cat.options.length / 2 ? [...new Set(opts.map((o) => o.cs))] : undefined,
    categories: profile ? eligibleCategories(profile.category, profile.pwd) : undefined,
    pastYears,
    latestYear,
  });
  const latest = latestOf(cat.sources, cat.exam);
  const ranked = opts.map((o) => {
    const list = inputs.get(o.id) ?? [];
    const label = profile ? labelOf(profile.rank, list, includeProvisional, latest) : { reach: "no-data" as const, provisional: false };
    const deepest = list.filter((c) => c.year === pastYears[1]).reduce<ReachInput | undefined>((a, c) => (!a || c.closing > a.closing ? c : a), undefined);
    return { o, ...label, deepest };
  });
  return ranked.sort((a, b) => reachOrder.indexOf(a.reach) - reachOrder.indexOf(b.reach) || (b.deepest?.closing ?? 0) - (a.deepest?.closing ?? 0));
}

const countsOf = (xs: { reach: Reach }[]) => Object.fromEntries(reachOrder.map((r) => [r, xs.filter((x) => x.reach === r).length])) as Record<Reach, number>;

/**
 * Seats in `list` that match her courses, quotas, states and seat categories (fee and bond caps aside, as on Seats) but
 * whose course and quota is not an option: no past allotments, so no closing rank to label. All of a college's without
 * a profile. Null when there is no list. Options and institute pages name them and link Seats (`nohist=1`).
 */
async function unlistedOf(cat: Catalog, list: SeatList | null, profile: Profile | null, college?: string) {
  if (!list) return null;
  const p = profile && { ...profile, maxFeeLakh: null, maxBondYears: null };
  const { rows } = await listSeats(
    {
      list: list.key,
      college,
      ...(p && profileCourseFilter(p)),
      categories: p ? eligibleCategories(p.category, p.pwd) : undefined,
    },
    undefined,
    cat.exam,
  );
  const out = rows.filter((r) => !hasOption(cat, r) && optMatches(cat, { college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota }, p));
  const options = new Set(out.map((r) => [r.college.key, r.degree, r.specialty, r.quota].join("~"))).size;
  return { list, options, seats: out.reduce((a, r) => a + r.seats, 0) };
}

/** Options page: seats in her profile with no option, in the newest clear vacancy list or that round's `kind` list (see unlistedOf). */
export async function unlistedSeats(profile: Profile, kind: SeatKind = "clear", exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  return unlistedOf(cat, (await roundLists(cat)).find((l) => l.kind === kind) ?? null, profile);
}

/**
 * The newest clear vacancy list's round: one list per kind (seatKinds order), clear first; empty without a clear list.
 * ponytail: a round with two PDFs of one kind (2025 R2 newly added) gives the newest; list both if a current round has two.
 */
async function roundLists(cat: Catalog): Promise<SeatList[]> {
  const all = cat.mem ? [] : await seatLists(cat.exam);
  const [clear] = pickLists(all, {});
  return !clear ? [] : seatKinds.flatMap((kind) => pickLists(all, { kind, year: clear.year, round: clear.round }).slice(0, 1));
}

/** The seat lists behind the R2 seats columns (Options, Choices). */
export const currentSeatLists = async (exam: ExamKey = DEFAULT_EXAM) => roundLists(await getCatalog(exam));

/** Her seat categories; null (every category) without a profile. */
const seatCats = (profile: Profile | null) => (profile ? eligibleCategories(profile.category, profile.pwd) : undefined);

/** The seats of these options in each list: one read for their colleges and courses. */
const seatsOfOpts = async (cat: Catalog, lists: SeatList[], opts: Pick<Opt, "college" | "degree" | "specialty">[]) =>
  opts.length ? optionSeats(lists, { colleges: [...new Set(opts.map((o) => o.college))], pairs: [...new Set(opts.map(pairKey))] }, cat.exam) : new Map<string, OptionSeats>();

/**
 * Options with no past allotment (not in the catalog) whose course and quota the lists of `seats` print seats for, in
 * her profile (courses, quotas, state, fee and bond caps; any without a profile). Ids follow optionId, so a saved choice
 * keeps its id once MCC results give it history. Seats outside the MCC course list are left out (no course to name).
 */
export function newOptions(cat: Catalog, seats: Map<string, OptionSeats>, profile: Profile | null, match = (o: OptionSeats) => optMatches(cat, o, profile)): Opt[] {
  return [...seats].flatMap(([id, s]): Opt[] =>
    cat.optionById.has(id) || !cat.collegeByKey.has(s.college) || !cat.courseOf.has(`${s.degree}|${s.specialty}`) ||
    !s.cells.some((xs) => xs.some((c) => c.seats > 0)) || !match(s)
      ? []
      : [{ cs: "", id, college: s.college, degree: s.degree, specialty: s.specialty, quota: s.quota, byYear: {}, fresh: true }],
  );
}

/** One option id as its parts; null when it can't be one. */
const parseOptionId = (id: string) => {
  const [college, degree, specialty, quota, ...rest] = id.split("~");
  return quota && !rest.length ? { college, degree, specialty, quota } : null;
};

/**
 * Saved or compared ids as options, in order: known options, and new ones (newOptions) the round's lists print seats
 * for, whatever her profile. Unknown ids are left out. `seats`: the options' seats in `lists`, every seat category.
 */
async function optionsByIds(cat: Catalog, lists: SeatList[], ids: string[], withSeats: boolean) {
  const unknown = ids.filter((id) => !cat.optionById.has(id)).flatMap((id) => parseOptionId(id) ?? []);
  const known = ids.flatMap((id) => cat.optionById.get(id) ?? []);
  const seats = withSeats || unknown.length ? await seatsOfOpts(cat, lists, [...known, ...unknown]) : new Map<string, OptionSeats>();
  const fresh = new Map(newOptions(cat, seats, null).map((o) => [o.id, o]));
  return { opts: ids.flatMap((id) => cat.optionById.get(id) ?? fresh.get(id) ?? []), seats };
}

/**
 * Rows with their seats in each list (`seatsBy`, one kind each, never added; `seats` = the clear vacancy list's), in
 * her seat categories (all without a profile), and with a profile `seatsBelow`. `seats` = optionSeats of these rows.
 */
function withSeats(rows: OptionRow[], lists: SeatList[], seats: Map<string, OptionSeats>, profile: Profile | null): OptionRow[] {
  const categories = seatCats(profile);
  return rows.map((r) => {
    const { by: seatsBy, mine } = seatsByKind(lists, seats.get(r.id), categories);
    const cats = Object.fromEntries(lists.map((l, i) => [l.kind, mine[i].filter((c) => c.seats > 0).map((c) => c.category)]));
    return { ...r, seats: seatsBy.clear ?? null, seatsBy, seatsBelow: r.reachBy ? seatsBelow(r.reach, r.reachBy, cats, r.reachAt) : [] };
  });
}

/** Choices: saved options (ids, new ones too), labelled, with their seats in each list of the newest round, as on Options. Unknown ids are left out. */
export async function choiceOptions(ids: string[], profile: Profile | null, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const lists = await roundLists(cat);
  const { opts, seats } = await optionsByIds(cat, lists, ids, true);
  return { lists, rows: withSeats(await rowsFor(cat, opts, profile, true), lists, seats, profile) };
}

/**
 * Options in her profile, labelled by reach, in the view asked for (OptionsView; default optionsView). `counts` are per
 * label before the reach filter, closed included (what the reach chips show). Pass `pg` to get one page; `total` counts
 * every row. `seatList` is the clear vacancy list behind each row's `seats` (null: no list), `seatLists` that round's
 * lists behind `seatsBy`. `view`, `showClosed` and `seats` (the seats filter: a kind, "any", null = with or without) are
 * the ones applied; `summary` (round view) counts her profile's options with seats in the round, search aside; `noState`
 * (round view, state filter) the options with seats in the round that only the state filter drops (institute without a state).
 * `f.terms` (else her fee and bond caps): the term filters on each option's course and quota (lib/term-filters.ts).
 * Round view order: roundReachOrder, then clear vacancy seats, then deepest closing.
 */
export async function listOptions(profile: Profile | null, f: OptionFilters = {}, pg?: PageQuery, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const includeProvisional = f.includeProvisional ?? true;
  const lists = await roundLists(cat);
  const view = optionsView(f.view, lists, cat.sources);
  const round = view === "round";
  const kind: SeatKind | "any" | null = f.hasSeats === undefined ? (round ? "any" : null) : f.hasSeats === true ? "clear" : f.hasSeats || null;
  const showClosed = (f.showClosed ?? round) || !!f.reach?.includes("closed-before");
  // Every word in the institute's name, state, address (its city) or the course; a short name ("KEM") as its official words.
  const match = searchMatcher(f.search);
  const text = (o: Opt) => {
    if (!match) return true;
    const college = cat.collegeByKey.get(o.college)!;
    const course = cat.courseOf.get(`${o.degree}|${o.specialty}`)!;
    return match(`${college.name} ${college.state ?? ""} ${college.address ?? ""} ${course.name} ${course.degree}`);
  };
  const tf = f.terms ?? (profile && profileTermFilters(profile));
  const types = await typesFor(tf, cat.exam);
  const matches = (o: Parameters<typeof optMatches>[1]) => optMatches(cat, o, profile, tf, types);
  const split = splitByTerms(cat.options.filter((o) => inProfile(cat, o, profile)), tf, (o) => optTerms(cat, o), (o) => types?.get(o.college)?.type?.value);
  const mine = split.kept;
  const opts = mine.filter(text);
  // Options left out only because a filtered term is not declared: labelled and filtered as the shown ones, for the count.
  const unknownOpts = split.unknown.filter(text);
  // Seats of every option in her profile (courses, quotas, seat categories) when the view or a seats filter needs them,
  // in one read beside the labels; else just the page's, below.
  const [profileSeats, labelled, labelledUnknown] = await Promise.all([
    round || kind ? optionSeats(lists, profile ? { ...profileCourseFilter(profile), quotas: profileQuotas(profile, cat.exam), categories: seatCats(profile) } : {}, cat.exam) : null,
    rankOptions(cat, opts, profile, includeProvisional),
    unknownOpts.length ? rankOptions(cat, unknownOpts, profile, includeProvisional) : [],
  ]);
  const fresh = profileSeats && round ? newOptions(cat, profileSeats, profile, matches) : [];
  const freshUnknown = profileSeats && round && tf && !tf.keepUnknown && anyTermFilter(tf)
    ? newOptions(cat, profileSeats, profile, (o) => inProfile(cat, o, profile) && termVerdict(optTerms(cat, o), types?.get(o.college)?.type?.value, tf) === "unknown")
    : [];
  const by = new Map(profileSeats ? [...mine, ...fresh, ...split.unknown, ...freshUnknown].map((o) => [o.id, seatsByKind(lists, profileSeats.get(o.id)).by]) : []);
  const asNew = (o: Opt): Ranked => ({ o, reach: "new", provisional: false, deepest: undefined });
  const ranked: Ranked[] = [...labelled, ...fresh.filter(text).map(asNew)];
  const clear = (x: Ranked) => by.get(x.o.id)?.clear ?? 0;
  if (round) ranked.sort((a, b) => roundReachOrder.indexOf(a.reach) - roundReachOrder.indexOf(b.reach) || clear(b) - clear(a) || (b.deepest?.closing ?? 0) - (a.deepest?.closing ?? 0));
  // Her sort (stable: ties keep the label order); a missing value last either way.
  const key: Record<Exclude<OptionSort, "label">, (x: Ranked) => number | null | undefined> = {
    deep: (x) => (x.deepest ? -x.deepest.closing : null),
    tight: (x) => x.deepest?.closing,
    fee: (x) => feeValue.fee1(optTerms(cat, x.o)),
    stipend: (x) => { const v = feeValue.stip1(optTerms(cat, x.o)); return v == null ? null : -v; },
  };
  if (f.sort && f.sort !== "label") {
    const k = key[f.sort];
    ranked.sort((a, b) => { const [x, y] = [k(a) ?? Infinity, k(b) ?? Infinity]; return x === y ? 0 : x - y; });
  }
  const has = (x: Ranked, k: SeatKind | "any") => hasSeatsIn(by.get(x.o.id) ?? {}, k);
  const inReach = (x: Ranked) => !f.reach?.length || f.reach.includes(x.reach);
  const inView = (xs: Ranked[]) => (kind ? xs.filter((x) => has(x, kind)) : xs);
  const open = (xs: Ranked[]) => (showClosed ? xs : xs.filter((r) => r.reach !== "closed-before"));
  const every = inView(ranked);
  const all = every.filter(inReach);
  const shown = open(all);
  // With the clear vacancy filter, the options it hides that have seats in the round's virtual vacancy list are counted.
  const virtualList = kind === "clear" ? (lists.find((l) => l.kind === "virtual") ?? null) : null;
  const virtualOnly = virtualList ? ranked.filter((x) => !has(x, "clear") && has(x, "virtual") && inReach(x) && (showClosed || x.reach !== "closed-before")).length : 0;
  const page = paged(shown, pg);
  const pageOpts = page.rows.map((x) => x.o);
  const [built, seats] = await Promise.all([
    rowsFor(cat, pageOpts, profile, includeProvisional, pageOpts.length < cat.options.length / 2),
    profileSeats ?? seatsOfOpts(cat, lists, pageOpts),
  ]);
  const hidden = all.filter((r) => !showClosed && r.reach === "closed-before");
  // Round view with a state filter: options with seats in the round left out only because their institute has no state
  // in the data (as Seats counts them).
  const anyState = round && profile?.states.length ? { ...profile, states: [] } : null;
  const noState = anyState
    ? [...profileSeats!.values()].filter((s) => {
        const c = cat.collegeByKey.get(s.college);
        return c && c.state == null && cat.courseOf.has(`${s.degree}|${s.specialty}`) && optMatches(cat, s, anyState, tf, types) && hasSeatsIn(seatsByKind(lists, s).by, "any");
      }).length
    : 0;
  return {
    ...page,
    rows: withSeats(built, lists, seats, profile),
    view,
    showClosed,
    seats: kind,
    summary: round ? roundSummary([...mine, ...fresh].map((o) => ({ by: by.get(o.id)!, fresh: o.fresh }))) : null,
    noState,
    /** Options this view would show but for a filtered fee, stipend, bond or leaving value that is not declared (nd=keep adds them). */
    unknownTerms: open(inView([...labelledUnknown, ...freshUnknown.filter(text).map(asNew)]).filter(inReach)).length,
    hiddenClosed: hidden.length,
    /** Of the hidden ones, those whose label rests on the provisional latest round alone. */
    hiddenProvisional: hidden.filter((r) => r.provisional).length,
    counts: countsOf(every),
    seatList: lists[0] ?? null,
    seatLists: lists,
    /** With the clear vacancy filter: options shown but for that filter that have seats only in `list`, the round's virtual vacancy list. */
    virtualOnly: virtualList ? { list: virtualList, options: virtualOnly } : null,
  };
}

/** Compare: options by id (new ones too), labelled; unknown ids are left out. */
/** Compare: the ids as rows (unknown ones left out), with their seats in each list of the newest round (`seatsBy`, as Choices). */
export async function getOptionsByIds(ids: string[], profile: Profile | null, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const lists = await roundLists(cat);
  const { opts, seats } = await optionsByIds(cat, lists, ids, ids.length > 0);
  return withSeats(await rowsFor(cat, opts, profile, true), lists, seats, profile); // no ids → no query (cs = [])
}

const sumYear = (opts: Opt[], year: number) => (opts.some((o) => o.byYear[year] != null) ? opts.reduce((s, o) => s + (o.byYear[year] ?? 0), 0) : null);

/**
 * One institute: every option here (`options`, with `seats` in `seatList` and `seatsBy` per list of its round), the ones
 * in her profile (`yours`), the seats here in her profile that are no option (`unlisted`: in `seatList`; `unlistedBy`:
 * in each list of its round, never added), allotments per year, terms per program.
 */
export async function getInstitute(slug: string, profile: Profile | null, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const college = cat.collegeBySlug.get(slug);
  if (!college) return null;
  const known = cat.options.filter((o) => o.college === college.key);
  const [built, lists] = await Promise.all([rowsFor(cat, known, profile, true), roundLists(cat)]);
  const seatList = lists[0] ?? null;
  const [seats, unlistedBy] = await Promise.all([optionSeats(lists, { colleges: [college.key] }, cat.exam), Promise.all(lists.map((l) => unlistedOf(cat, l, profile, college.key)))]);
  // Courses and quotas with seats in the round's lists but no past allotment here: options too, labelled "new".
  const fresh = newOptions(cat, seats, null);
  const opts = [...known, ...fresh];
  const options = withSeats([...built, ...(await rowsFor(cat, fresh, profile, true))], lists, seats, profile);
  const mine = new Set(opts.filter((o) => optMatches(cat, o, profile)).map((o) => o.id));
  const allotmentsByYear = examYears(exam).map((year) => ({ year, n: sumYear(opts, year) }));
  const terms = { md: termsFor(cat, college.key, "MD"), dnb: termsFor(cat, college.key, "DNB") };
  /** Fees, stipend and bond per programme offered here (server/terms.ts). */
  const fees = collegeTerms(cat, college.key);
  return { college, options, yours: options.filter((o) => mine.has(o.id)), allotmentsByYear, terms, fees, seatList, unlisted: unlistedBy[0] ?? null, unlistedBy: unlistedBy.filter((u) => !!u) };
}

/** `quotas`: only these (NEET SS: her question group's quotas, where her rank means something). */
export async function rankScan(rank: number, year: number, window = 500, exam: ExamKey = DEFAULT_EXAM, quotas?: string[]) {
  const cat = await getCatalog(exam);
  const { rows } = await findAllotments(cat, { year, from: Math.max(1, rank - window), to: rank + window, ...(quotas && { quotas }) });
  const out = rows.map((a) => {
    const c = cat.collegeByKey.get(a.college);
    return { ...a, collegeName: c?.name ?? a.college, collegeSlug: c?.slug ?? "" };
  });
  return rounds.map((round) => ({ round, rows: out.filter((r) => r.round === round) })).filter((g) => g.rows.length);
}

/**
 * One NEET PG rank's allotments in a year, round by round (rank = one candidate per year): the seat, MCC's status
 * (allotted / fresh / upgraded), the candidate's option number (R2 / R3) and own category, and the seat the PDF prints
 * one round back with its remark. Ranks and seats only, never a name; history, not a prediction.
 */
export async function rankJourney(year: number, rank: number, exam: ExamKey = DEFAULT_EXAM, quotas?: string[]) {
  const cat = await getCatalog(exam);
  const { rows } = await findAllotments(cat, { year, from: rank, to: rank, ...(quotas && { quotas }) });
  return rows.map((a) => ({ ...a, ...seatNames(cat, a), prev: namedPrev(cat, a.prev) }));
}

/** A seat's institute name and slug (a key not in the catalog: the key, no slug) and course name. */
function seatNames(cat: Catalog, s: { college: string; degree: string; specialty: string }) {
  const c = cat.collegeByKey.get(s.college);
  return { collegeName: c?.name ?? s.college, collegeSlug: c?.slug ?? "", courseName: `${s.degree} ${cat.courseOf.get(`${s.degree}|${s.specialty}`)?.name ?? s.specialty}` };
}
/** The seat an allotment held one round back, with its names. */
const namedPrev = (cat: Catalog, p: Allotment["prev"]) => p && { ...p, ...seatNames(cat, p) };

/** `terms`: fee, stipend, bond, leaving and college-type filters on each option's course and quota (lib/term-filters.ts). */
/**
 * `courses`: several courses at once (Last ranks: her courses), else `specialty` (and `degree`). `quotas`: any of these
 * (her quotas), else `quota`. `search`: institute or state words.
 */
export type LastRanksFilters = {
  degree?: string; specialty?: string; courses?: { degree: string; specialty: string }[]; category?: string; quota?: string; quotas?: string[]; search?: string;
  years?: number[]; sort?: { year: number; round: Round; dir: "asc" | "desc" }; terms?: TermFilters;
  /** Only options with some round (from year `since`) closing between `min` and `max` (either may be open). */
  closing?: { min?: number; max?: number; since?: number };
};

/**
 * Every institute's closing rank by year and round for one course, on one seat category (all when omitted); bracketed
 * n counts allotments in every category. `years` keeps only those years (in SQL, so totals and every field agree).
 * `rows` holds options with a closing on that category (sorted by name, or by one year/round column); `empty` counts
 * the rest; `columns` lists the years and rounds that have data.
 */
export async function lastRanks(f: LastRanksFilters, pg?: PageQuery, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const types = await typesFor(f.terms, cat.exam);
  const q = f.search?.trim().toLowerCase();
  const course = (o: Opt) => (f.courses ? f.courses.some((c) => c.degree === o.degree && c.specialty === o.specialty) : o.specialty === f.specialty && (!f.degree || o.degree === f.degree));
  const quotas = f.quotas?.length ? f.quotas : f.quota ? [f.quota] : undefined;
  const text = (o: Opt) => {
    if (!q) return true;
    const c = cat.collegeByKey.get(o.college);
    return `${c?.name ?? ""} ${c?.state ?? ""}`.toLowerCase().includes(q);
  };
  const opts = cat.options.filter((o) => course(o) && (!quotas || quotas.includes(o.quota)) && text(o) && optMatches(cat, o, null, f.terms ?? null, types));
  const groups = groupByOption(await findCutoffs(cat, { cs: [...new Set(opts.map((o) => o.cs))], quotas, years: f.years?.length ? f.years : undefined }));
  const eligible = f.category ? new Set([f.category]) : undefined;
  const built = await withHospital(opts.map((o) => buildRow(cat, o, groups.get(o.id) ?? [], null, true, eligible)), cat.exam);
  let rows = built.filter((r) => Object.keys(r.grid).length > 0);
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r.grid).map(Number)))].sort().map((year) => ({
    year,
    rounds: rounds.filter((rd) => rows.some((r) => r.grid[year]?.[rd])),
    provisional: rows.some((r) => Object.values(r.grid[year] ?? {}).some((c) => c?.provisional)),
  }));
  const empty = built.length - rows.length;
  // The closing-rank filter: a row's best closing in the range (-1: none), so the best chances come first unless sorted.
  const cl = f.closing;
  const ranged = !!(cl?.min || cl?.max);
  const best = (r: OptionRow) => bestClosing(r.grid, cl ?? {});
  if (ranged) rows = rows.filter((r) => best(r) >= 0);
  const s = f.sort;
  if (s) {
    const v = (x: OptionRow) => x.grid[s.year]?.[s.round]?.closing ?? (s.dir === "asc" ? Infinity : -1);
    rows = rows.sort((a, b) => (s.dir === "asc" ? v(a) - v(b) : v(b) - v(a)));
  } else if (ranged) rows = rows.sort((a, b) => best(b) - best(a));
  else rows = rows.sort((a, b) => a.college.name.localeCompare(b.college.name));
  return { ...paged(rows, pg), empty, columns };
}

/**
 * Allotments made per option and year (Σ cutoff n, every round), from the catalog: no cutoff rows are read. `profile`:
 * only her courses (profileHasCourse).
 */
export async function allotmentTrends(f: { specialty?: string; degree?: string; profile?: Pick<Profile, "specialties" | "degrees" | "pairs"> | null }, pg?: PageQuery, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const rows = cat.options
    .filter((o) => (!f.specialty || o.specialty === f.specialty) && (!f.degree || o.degree === f.degree) && (!f.profile || profileHasCourse(f.profile, o)))
    .map((o) => {
      const c = cat.collegeByKey.get(o.college)!;
      return {
        id: o.id,
        college: { key: c.key, slug: c.slug, name: c.name, state: c.state, type: c.type },
        course: cat.courseOf.get(`${o.degree}|${o.specialty}`)!,
        quota: o.quota,
        byYear: Object.fromEntries(examYears(exam).map((y) => [y, o.byYear[y] ?? null])) as Record<number, number | null>,
      };
    });
  return paged(rows, pg);
}

export async function getMeta(exam: ExamKey = DEFAULT_EXAM) {
  return (await getCatalog(exam)).meta;
}

/** NEET SS: the question groups of its latest year (the group system a candidate sits now), A–Z; none for other exams. */
export async function examGroups(exam: ExamKey) {
  if (!perGroup(exam)) return [];
  const cat = await getCatalog(exam);
  const y = exams[exam].latestYear;
  return [...new Set(cat.options.filter((o) => o.byYear[y]).flatMap((o) => groupOf(o.quota) ?? []))].sort();
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
export async function dashboard(profile: Profile, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const ranked = await rankOptions(cat, cat.options.filter((o) => optMatches(cat, o, profile)), profile, true);
  const [, last] = exams[exam].pastYears;
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
  // The round trend: each shown option's deepest closing per round of that year on her seat categories (an option row's
  // grid cell). That year's cutoffs on her categories only, no full rows: reading every year and category of ~1,000
  // options and building their rows was most of Home's server time.
  const shownOpts = shown.flatMap((c) => c.opts);
  const quotas = [...new Set(shownOpts.map((o) => o.quota))];
  const byOpt = groupByOption(await cutoffsOnce(cat, JSON.stringify({ cs: [...new Set(shownOpts.map((o) => o.cs))], quotas: quotas.length < cat.meta.quotas.length ? quotas : undefined, categories: eligibleCategories(profile.category, profile.pwd), years: [last] } satisfies CutoffQuery)));
  // Another exam: the rounds it has (NEET SS has no R3), special stray aside as for NEET PG.
  const trendRounds: Round[] = exam === DEFAULT_EXAM ? ["R1", "R2", "R3", "stray"] : exams[exam].rounds.filter((r) => r !== "special_stray");
  const trend = shown.map(({ course, opts }) => ({
    course,
    points: trendRounds.map((round) => {
      const vals = opts.flatMap((o) => {
        const deepest = Math.max(0, ...(byOpt.get(o.id) ?? []).filter((c) => c.round === round).map((c) => c.closing));
        return deepest ? [deepest] : [];
      });
      return { round, median: median(vals), n: vals.length };
    }),
  }));
  return { total: ranked.length, counts: countsOf(ranked), strip, summary, trend };
}

// ---------- Institutes, allotments, fees ----------

/** `only`: these college keys (a term filter's verdict); `bedsOf`: the beds to sort "beds" by (else the catalog's). */
export type InstituteFilters = {
  search?: string;
  state?: string | string[];
  type?: string;
  course?: string | string[];
  sort?: "name" | "beds" | "established" | "allotments";
  only?: Set<string>;
  bedsOf?: (collegeKey: string) => number | null | undefined;
};

/**
 * Institutes, sorted, one page at a time. With a profile, `bestReach` is the best label among the options here that
 * match her profile (course, degree, quota, state, fee, bond), and `best` names that option.
 */
export async function listInstitutes(profile: Profile | null, f: InstituteFilters = {}, pg?: PageQuery, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const match = searchMatcher(f.search);
  const byCollege = new Map<string, Opt[]>();
  for (const o of cat.options) (byCollege.get(o.college) ?? byCollege.set(o.college, []).get(o.college)!).push(o);
  const colleges = cat.colleges
    .filter((c) => !match || match(`${c.name} ${c.state ?? ""} ${c.address ?? ""}`))
    .filter((c) => !f.state?.length || [f.state].flat().includes(c.state ?? ""))
    .filter((c) => !f.type || c.type === f.type)
    .filter((c) => !f.only || f.only.has(c.key))
    .filter((c) => !f.course?.length || (byCollege.get(c.key) ?? []).some((o) => [f.course].flat().includes(cat.courseOf.get(`${o.degree}|${o.specialty}`)!.slug)))
    // `allotments2025`: the later past year's (NEET PG: 2025; the name kept for its readers).
    .map((college) => ({ college, allotments2025: sumYear(byCollege.get(college.key) ?? [], exams[exam].pastYears[1]) }));
  const by = f.sort ?? "name";
  const beds = (c: (typeof colleges)[number]["college"]) => (f.bedsOf ? f.bedsOf(c.key) : c.beds) ?? -1;
  colleges.sort((a, b) =>
    by === "beds" ? (beds(b.college) - beds(a.college) || a.college.name.localeCompare(b.college.name))
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
    const inputs = await reachInputs(cat, {
      cs: opts.length < cat.options.length / 2 ? [...new Set(opts.map((o) => o.cs))] : undefined,
      categories: eligibleCategories(profile.category, profile.pwd),
      pastYears: exams[exam].pastYears,
      latestYear: exams[exam].latestYear,
    });
    const latest = latestOf(cat.sources, exam);
    reachOf = new Map([...inputs].map(([id, list]) => [id, labelOf(profile.rank, list, true, latest)]));
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
      /** The option the best label comes from; provisional when that label rests on the provisional latest round. */
      best: profile && best && best.reach !== "no-data" ? { course: cat.courseOf.get(`${best.o.degree}|${best.o.specialty}`)!, quota: best.o.quota, provisional: best.provisional } : null,
    };
  });
  return { ...page, rows };
}

/** `terms`: fee, stipend, bond, leaving and college-type filters on each allotment's course and quota (lib/term-filters.ts). */
/** `course`: one course slug; `courses`: any of these (with `course`, both narrow). */
/** `quotas`: any of these (NEET SS: her question group's). */
export type AllotmentFilters = { year?: number; round?: Round; course?: string; courses?: string[]; quota?: string; quotas?: string[]; category?: string; state?: string; from?: number; to?: number; terms?: TermFilters };

/**
 * Allotments (ranks only, never names), newest year, then round, then rank, one page. A page past the end returns the
 * last page (as every list here does: `page` says which). Each row: `fees` (its course and quota's terms, courseTerms)
 * and `hospital` (type and beds, or null).
 */
export async function listAllotments(f: AllotmentFilters, pg: PageQuery, collegeKey?: string, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const course = f.course ? cat.courses.find((c) => c.slug === f.course) : undefined;
  const courses = f.courses?.length ? cat.courses.filter((c) => f.courses!.includes(c.slug)) : null;
  // College, course and state become a list of CollegeSpecialty ids for the SQL WHERE.
  const narrow = collegeKey || f.course || courses || f.state;
  const cs = narrow
    ? [...cat.pairs.values()]
        .filter(
          (p) =>
            (!collegeKey || p.college === collegeKey) &&
            (!f.course || (course && p.degree === course.degree && p.specialty === course.specialty)) &&
            (!courses || courses.some((c) => p.degree === c.degree && p.specialty === c.specialty)) &&
            (!f.state || cat.collegeByKey.get(p.college)?.state === f.state),
        )
        .map((p) => p.cs)
    : undefined;
  // Term filters: the courses and quotas (options) whose terms pass, into the SQL WHERE as (course, quota) pairs.
  const tf = anyTermFilter(f.terms) ? f.terms! : null;
  const types = await typesFor(tf, cat.exam);
  const inCs = cs && new Set(cs);
  const csQuota = tf
    ? cat.options.filter((o) => (!inCs || inCs.has(o.cs)) && (!f.quota || o.quota === f.quota) && optMatches(cat, o, null, tf, types)).map((o) => [o.cs, o.quota] as [string, string])
    : undefined;
  const q = { cs, csQuota, year: f.year, round: f.round, quota: f.quota, ...(f.quotas && { quotas: f.quotas }), category: f.category, from: f.from, to: f.to };
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
    rows: await withHospital(rows.map((a) => {
      const t = termsFor(cat, a.college, a.degree);
      const c = cat.courseOf.get(`${a.degree}|${a.specialty}`);
      return {
        ...a,
        college: cat.collegeByKey.get(a.college)!,
        prev: namedPrev(cat, a.prev),
        courseName: `${a.degree} ${c?.name ?? a.specialty}`,
        courseSlug: c?.slug ?? "",
        provisional: provisional.has(`${a.year}|${a.round}`),
        terms: t,
        fees: courseTerms(cat, a.college, a.degree, a.specialty, a.quota),
        feeInr: t.fee?.amountInr ?? null,
        feeText: t.fee?.text ?? null,
        stipendText: t.stipend?.text ?? null,
        bondText: t.bond?.text ?? null,
        penaltyText: t.penalty?.text ?? null,
      };
    }), cat.exam),
  };
}

export const feeSorts = ["fee1", "feetotal", "stip1", "bondyrs", "bond", "leave", "name"] as const;
export type FeeSort = (typeof feeSorts)[number];
/**
 * The term filters (lib/term-filters.ts: caps in ₹ on the programme's figures; a capped value that is not declared fails
 * unless `keepUnknown`). `bond`: declared, or "none" = no bond on record (a record says so; never an unknown one).
 */
export type FeeFilters = TermFilters & {
  /** Course slugs (lib/course-filter.ts: her courses by default): one row per institute × course, its own terms. */
  courses?: Set<string>;
  programmes?: Programme[];
  states?: string[];
  search?: string;
  bond?: "declared" | "none";
  sort?: FeeSort;
  dir?: "asc" | "desc";
};
/** `course`: the row's course (with a course filter), else the row is the whole programme (every course of it there). */
export type FeeRow = { college: Pick<College, "key" | "slug" | "name" | "state">; course?: Pick<Course, "slug" | "degree" | "name">; terms: ProgrammeTerms };

/** Each college's courses (its CollegeSpecialty pairs), once per catalog. */
const coursesByCollege = new WeakMap<Catalog, Map<string, Course[]>>();
function collegeCourses(cat: Catalog, college: string) {
  let m = coursesByCollege.get(cat);
  if (!m) {
    m = new Map();
    for (const p of cat.pairs.values()) {
      const c = cat.courseOf.get(`${p.degree}|${p.specialty}`);
      if (c) (m.get(p.college) ?? m.set(p.college, []).get(p.college)!).push(c);
    }
    coursesByCollege.set(cat, m);
  }
  return m.get(college) ?? [];
}

/** Nothing declared for the programme: no fee, stipend, bond or Round 2 forfeit. */
export const nothingDeclared = (t: ProgrammeTerms) => !t.years.some((y) => y.fee || y.stipend) && t.bond.status === "not_declared" && !t.resignForfeit && !t.resignForfeitText && !t.unread.length;

/**
 * One row per institute × programme it offers (from its courses), declared or not. Sorted by one column (unknown values
 * last in both directions, then by name); `undeclared` counts the matching rows with nothing declared; `unknownTerms` the
 * rows left out only because a filtered value is not declared (`keepUnknown` adds them).
 */
export async function listFees(f: FeeFilters, pg?: PageQuery, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const q = f.search?.trim().toLowerCase();
  const types = await typesFor(f, cat.exam);
  const { kept: rows, unknown } = splitByTerms(
    cat.colleges
      .filter((c) => (!f.states?.length || (c.state != null && f.states.includes(c.state))) && (!q || `${c.name} ${c.state ?? ""}`.toLowerCase().includes(q)))
      .flatMap((c): FeeRow[] => {
        const college = { key: c.key, slug: c.slug, name: c.name, state: c.state };
        // With courses: a row per course there, with that course's own terms (its bond by specialty, its fee variant).
        if (f.courses)
          return [...new Map(collegeCourses(cat, c.key).filter((x) => f.courses!.has(x.slug)).map((x) => [x.slug, x])).values()].map((x) => ({
            college, course: { slug: x.slug, degree: x.degree, name: x.name }, terms: courseTerms(cat, c.key, x.degree, x.specialty),
          }));
        return collegeTerms(cat, c.key).map((terms) => ({ college, terms }));
      })
      .filter(({ terms: t }) => (!f.programmes?.length || f.programmes.includes(t.programme)) && (!f.bond || t.bond.status === (f.bond === "declared" ? "declared" : "none"))),
    f,
    (r) => r.terms,
    (r) => types?.get(r.college.key)?.type?.value,
  );
  const by = f.sort ?? "fee1";
  const sign = (f.dir ?? (by === "stip1" ? "desc" : "asc")) === "asc" ? 1 : -1;
  const name = (a: FeeRow, b: FeeRow) => a.college.name.localeCompare(b.college.name);
  rows.sort((a, b) => {
    if (by === "name") return sign * name(a, b);
    const [x, y] = [feeValue[by](a.terms), feeValue[by](b.terms)];
    return x == null || y == null ? (x == null ? 1 : 0) - (y == null ? 1 : 0) || name(a, b) : sign * (x - y) || name(a, b);
  });
  return { ...paged(rows, pg), undeclared: rows.filter((r) => nothingDeclared(r.terms)).length, unknownTerms: unknown.length };
}
