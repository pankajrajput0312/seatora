import "server-only";
import { z } from "zod";
import { listDay } from "../../lib/format";
import { pageValue, parseSearchParams } from "../../lib/params";
import { splitByTerms, termFilterLists, termFilters, termFilterShape, type TermFilters } from "../../lib/term-filters";
import { DEFAULT_EXAM, exams, latestOf, perGroup, type ExamKey } from "@/features/exams/registry";
import { classifyReach, deepestOf, eligibleCategories, LATEST_YEAR, latestRound, PAST_YEARS, reachLabel, reachOrder, type Reach } from "../../lib/reach";
import { pairSchema, profileCourseFilter, profileQuotas, type Profile } from "../../profile";
import { getCatalog, type Catalog } from "../../server/catalog";
import { listNotices } from "../../server/notices";
import { findCutoffs } from "../../server/queries";
import { allottedRows, hasOption, listSeats, seatChanges, seatLists, type SeatFilters, type SeatRow } from "../../server/seats";
import { courseTerms, type ProgrammeTerms } from "../../server/terms";
import { feeValue, getCollege, getMeta, programOf, type OptionTerms, type PageQuery } from "../../service";
import { baseCategories, openQuotas, optionId, roundLabel, rounds, seatKindLabel, seatKinds, termLabel, type Category, type Cutoff, type Round, type SeatKind, type SeatList, type Term } from "../../types";
import { collegeTypeLabel } from "../institute/college-type";
import { reportedCount } from "../institute/hospital-bits";
import { hospitalInfo, type HospitalInfo, type ReportedBeds } from "../institute/institute-data";
import { roundNameFrom } from "@/features/exams/exam";

export const seatSorts = ["reach", "closing", "seats", "college", "state", "fee", "bond"] as const;
export type SeatSort = (typeof seatSorts)[number];
export const seatCategories: Category[] = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)];

/** The past rounds every seat row shows, on its own quota and seat category: the latest R1 (that year's later rounds go with the other rounds the label counts), and R2 and R3 of the two past years (newest year first, as every list of rounds shows them). */
export const PAST_ROUNDS: { year: number; round: Round }[] = [
  { year: LATEST_YEAR, round: "R1" },
  ...[...PAST_YEARS].sort((a, b) => b - a).flatMap((year) => (["R2", "R3"] as const).map((round) => ({ year, round }))),
];

/** `n`: allotments MCC made in that round on the row's quota and seat category (not seats). */
export type PastClosing = { year: number; round: Round; closing: number; n: number; provisional: boolean };
export type SeatHistory = {
  /** Closing ranks on the row's quota and seat category in every round the reach label counts (both past years, the latest year's), oldest first. */
  rounds: PastClosing[];
  /** Every closing on the row's quota and seat category in every result in the data (all years and rounds), oldest first. */
  closings: PastClosing[];
  /** The deepest of `rounds` (lib/reach.ts deepestOf: every round, Stray included); null when none. */
  deepest: PastClosing | null;
  /**
   * Options' label (lib/reach.ts) on this row's seat category alone; "new" (as Options) when the course and quota has no
   * past allotment at all; null without a rank, or with a `noLabel` reason.
   */
  reach: Reach | null;
  /** With a rank, why the row has no label: a seat category she can't take, no quota printed, or a data gap (`NO_LABEL`). */
  noLabel: string | null;
  /** The label rests on the provisional latest round (as OptionRow.reachProvisional). */
  reachProvisional: boolean;
  /** Fee, stipend, bond and penalty terms as published for the row's institute and program, each with its source (CSV). */
  terms: OptionTerms;
  /** The same for the row's programme, read into figures (server/terms.ts): the row shows it as stat cells (TermStatCells). */
  fees: ProgrammeTerms;
};
/**
 * `byList`: seats per SeatList key, never added across keys. List view: the row's own list. Compare view: every list of
 * the round that prints this row (absent = that list prints none); `list`/`seats` are then the current list's (0: none).
 */
export type SeatLine = SeatRow &
  SeatHistory & {
    byList: Record<string, number>;
    /** The institute's type (inferred, not official), the beds its hospital reports and its MCC profile; null when the import has none. */
    hospital: Pick<HospitalInfo, "type" | "beds" | "mccProfileUrl"> | null;
  };

/**
 * listSeats filters with several quotas and states (her profile can hold more than one) and a sort. A null in `quotas`
 * keeps the rows of a PDF that prints no quota. `nohist`: only rows whose course and quota is not an Options row (no
 * past allotments). `compare`: every list of the picked list's round side by side, one row per institute, course,
 * quota and seat category; "all": every list of every round, plus the rows MCC allotted in some result that no list
 * prints (the Seats matrix's "All rounds"). `has`: only rows with seats in a list of these kinds in the picked list's
 * round (any of them). `reachFor`: her rank and the seat categories she can take, for the reach labels. `terms`: fee,
 * stipend, bond, leaving and college-type filters on each row's course and quota terms (lib/term-filters.ts).
 */
export type SeatQuery = Omit<SeatFilters, "quota" | "state"> & {
  quotas?: (string | null)[];
  states?: string[];
  sort?: SeatSort;
  nohist?: boolean;
  compare?: boolean | "all";
  has?: SeatKind[];
  reachFor?: { rank: number; categories: string[] } | null;
  terms?: TermFilters;
};

const lastIfNull = (s: string | null) => s ?? "￿";

/**
 * Quota/state filters and the sort on rows in listSeats order (college name…); the sort is stable, so ties keep it.
 * `reach` (beyond her rank first, as Options) and `closing` (deepest past closing first) read the rows' history, `fee`
 * (year-1 fee, lowest first; a range by its highest) and `bond` (fewest bond years first, no bond on record = 0) the
 * course's terms as the Fees page reads them (feeValue); not declared last.
 */
export function refineSeats<T extends SeatRow & Partial<Pick<SeatHistory, "reach" | "deepest" | "fees">>>(rows: T[], { quotas, states, sort = "college" }: Pick<SeatQuery, "quotas" | "states" | "sort">): T[] {
  const out = rows.filter(
    (r) => (!quotas?.length || quotas.includes(r.quota)) && (!states?.length || (r.college.state != null && states.includes(r.college.state))),
  );
  const deep = (r: T) => r.deepest?.closing ?? -1;
  const reach = (r: T) => (r.reach ? reachOrder.indexOf(r.reach) : reachOrder.length);
  if (sort === "state") out.sort((a, b) => lastIfNull(a.college.state).localeCompare(lastIfNull(b.college.state)));
  if (sort === "seats") out.sort((a, b) => b.seats - a.seats);
  if (sort === "closing") out.sort((a, b) => deep(b) - deep(a));
  if (sort === "reach") out.sort((a, b) => reach(a) - reach(b) || deep(b) - deep(a));
  // Lowest first, missing (Infinity) last; equal keys keep their order (Infinity - Infinity would be NaN).
  const asc = (key: (r: T) => number | null | undefined) => (a: T, b: T) => {
    const [x, y] = [key(a) ?? Infinity, key(b) ?? Infinity];
    return x === y ? 0 : x - y;
  };
  if (sort === "fee") out.sort(asc((r) => r.fees && feeValue.fee1(r.fees)));
  if (sort === "bond") out.sort(asc((r) => r.fees && feeValue.bondyrs(r.fees)));
  return out;
}

const some = <T>(xs: T[] | undefined) => (xs?.length ? xs : undefined);
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const catPos = (c: string) => seatCategories.indexOf(c as Category);

/** listSeats' order (institute, course, quota, seat category), for rows merged from several lists. */
const byInstitute = (a: SeatRow, b: SeatRow) =>
  a.college.name.localeCompare(b.college.name) ||
  a.college.key.localeCompare(b.college.key) ||
  a.degree.localeCompare(b.degree) ||
  (a.course?.name ?? a.specialty).localeCompare(b.course?.name ?? b.specialty) ||
  (a.quota ?? "").localeCompare(b.quota ?? "") ||
  catPos(a.category) - catPos(b.category);

/**
 * One row per institute, course, quota and seat category, with its seats in each list (a line a PDF prints twice is
 * summed, as seatCountsFor does). A line printing 0 seats is left out: it adds no seat (the one-list view shows it).
 */
function mergeLists(rows: SeatRow[], current: string) {
  const out = new Map<string, SeatRow & { byList: Record<string, number> }>();
  for (const x of rows) {
    if (x.seats === 0) continue;
    const k = [x.college.key, x.degree, x.specialty, x.quota, x.category].join("|");
    const m = out.get(k) ?? out.set(k, { ...x, list: current, seats: 0, byList: {} }).get(k)!;
    m.byList[x.list] = (m.byList[x.list] ?? 0) + x.seats;
    if (x.list === current) m.seats += x.seats;
  }
  return [...out.values()];
}

/** As service.ts termsFor: the institute's published terms for the row's program (DNB/NBEMS seats vs medical-college seats). */
const termsOf = (cat: Catalog, college: string, degree: string): OptionTerms => {
  const get = (kind: Term["kind"]) => cat.termOf.get(`${college}|${programOf(degree)}|${kind}`);
  return { fee: get("FEE"), stipend: get("STIPEND"), bond: get("BOND"), penalty: get("PENALTY") };
};

/** Why a row with her rank has no label (SeatHistory.noLabel). */
export const NO_LABEL = {
  category: "Not a seat category you can take",
  quota: "Quota not printed in this PDF: no label",
  unlinked: "No label: its virtual vacancy seats mean MCC allotted it before, but the data links no past allotment to it here",
} as const;

/**
 * Past closings and reach label per row: one cutoff read for the rows' courses, quotas and seat categories, every year
 * in the data. `virtual`: the virtual vacancy list keys among the rows' lists.
 */
async function withHistory<T extends SeatRow & Pick<SeatHistory, "terms" | "fees"> & { byList: Record<string, number> }>(cat: Catalog, rows: T[], reachFor: SeatQuery["reachFor"], virtual: Set<string>): Promise<(T & SeatHistory)[]> {
  const opts = rows.filter((r) => r.cs && r.quota != null);
  const years = cat.meta.years.map((y) => y.year);
  const cutoffs = await findCutoffs(cat, { cs: uniq(opts.map((r) => r.cs!)), quotas: uniq(opts.map((r) => r.quota!)), categories: uniq(opts.map((r) => r.category)), years });
  const provisional = new Set(cat.sources.filter((s) => s.provisional).map((s) => s.key));
  const latest = latestOf(cat.sources, cat.exam);
  const { pastYears, latestYear } = exams[cat.exam];
  const by = new Map<string, Cutoff[]>();
  for (const c of cutoffs) {
    const k = `${optionId(c)}|${c.category}`;
    (by.get(k) ?? by.set(k, []).get(k)!).push(c);
  }
  const opt = { latest, pastYears };
  const counted = (c: { year: number; round: Round }) => pastYears.includes(c.year) || c.year === latestYear;
  return rows.map((r) => {
    const all = (r.quota != null && by.get(`${optionId({ college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota })}|${r.category}`)) || [];
    const closings = all.map((c) => ({ year: c.year, round: c.round, closing: c.closing, n: c.n, provisional: provisional.has(c.src) }));
    // The rounds the label counts (as classifyReach): both past years and the latest year, every round in the data.
    const used = all.filter(counted);
    const rounds = closings.filter(counted);
    const deepest = deepestOf(rounds);
    // As Options: a course and quota MCC never allotted in any result is "new". A row with no quota printed is no option,
    // so no label. A virtual vacancy is a seat someone holds from an earlier round: with no allotment it is a data gap
    // (one institute under two keys), never "new".
    const fresh = !hasOption(cat, r);
    const noLabel = !reachFor
      ? null
      : !reachFor.categories.includes(r.category)
        ? NO_LABEL.category
        : r.quota == null
          ? NO_LABEL.quota
          : fresh && Object.entries(r.byList).some(([k, n]) => virtual.has(k) && n > 0)
            ? NO_LABEL.unlinked
            : null;
    const reach = !reachFor || noLabel ? null : fresh ? "new" : classifyReach(reachFor.rank, used, { ...opt, includeLatest: true });
    const reachProvisional = !!reach && !fresh && latest.provisional && classifyReach(reachFor!.rank, used, { ...opt, includeLatest: false }) !== reach;
    return { ...r, closings, rounds, deepest, reach, noLabel, reachProvisional };
  });
}

const rowKey = (x: SeatRow) => [x.college.key, x.degree, x.specialty, x.quota, x.category].join("|");

/**
 * Seat rows for the Seats page, its CSV and /api/v1/seats, each with its past closings, reach label and terms.
 * `seats[list key]` = Σ seats of every matching row of that one list (lists are never added together). Empty filter
 * arrays mean "all". `noState[list key]`: with a state filter, Σ seats of rows that match everything else but are at an
 * institute with no state in the data (the filter drops them). `unknownTerms`: rows that match everything else but are
 * left out because a filtered fee, stipend, bond or leaving value is not declared (`terms.keepUnknown` adds them).
 * `pg` returns one page, without it every row.
 * ponytail: reads every matching row of the picked list(s) (≤ ~18k each, ~150 ms; "all": every list and every allotted
 * row) and sorts/pages here; history is read for the page only unless the sort needs it (reach, closing). Move sort and
 * paging into SQL if lists grow.
 */
export async function findSeats(f: SeatQuery, pg?: PageQuery, exam: ExamKey = DEFAULT_EXAM) {
  const { quotas, states, sort, nohist, compare, has, reachFor, terms, courses, specialties, degrees, pairs, categories, ...rest } = f;
  const filters = { ...rest, courses: some(courses), specialties: some(specialties), degrees: some(degrees), pairs: some(pairs), categories: some(categories), quota: quotas?.length === 1 ? (quotas[0] ?? undefined) : undefined };
  // State is filtered here, not in SQL, so the rows a state filter drops for having no state can be counted.
  const [r, cat, info] = await Promise.all([listSeats(filters, undefined, exam), getCatalog(exam), hospitalInfo(exam)]);
  const cur = r.lists[0];
  let lists = r.lists;
  let lines = r.rows.map((x) => ({ ...x, byList: { [x.list]: x.seats } }));
  if (compare && cur) {
    lists = (await seatLists(exam)).filter((l) => compare === "all" || (l.year === cur.year && l.round === cur.round));
    const [more, allotted] = await Promise.all([
      Promise.all(lists.filter((l) => !r.lists.some((x) => x.key === l.key)).map((l) => listSeats({ ...filters, list: l.key }, undefined, exam))),
      compare === "all" ? allottedRows(filters, exam) : [],
    ]);
    const merged = mergeLists([...r.rows, ...more.flatMap((m) => m.rows)], cur.key);
    const listed = new Set(merged.map(rowKey));
    lines = [...merged, ...allotted.filter((x) => !listed.has(rowKey(x))).map((x) => ({ ...x, list: cur.key, byList: {} }))].sort(byInstitute);
  }
  const round = cur ? lists.filter((l) => l.year === cur.year && l.round === cur.round) : [];
  const hasKind = (x: (typeof lines)[number]) => !has?.length || round.some((l) => has.includes(l.kind) && (x.byList[l.key] ?? 0) > 0);
  const { kept, unknown } = splitByTerms(
    lines
      .filter((x) => (!nohist || !hasOption(cat, x)) && hasKind(x))
      .map((x) => ({
        ...x,
        terms: termsOf(cat, x.college.key, x.degree),
        // The course's own programme bucket and quota, and its own bond figure where the record prices bonds by subject.
        fees: courseTerms(cat, x.college.key, x.degree, x.specialty, x.quota ?? undefined),
      })),
    terms,
    (x) => x.fees,
    (x) => info.get(x.college.key)?.type?.value,
  );
  const matching = refineSeats(kept, { quotas, states });
  const noState = states?.length ? refineSeats(kept, { quotas }).filter((x) => x.college.state == null) : [];
  const perList = (xs: typeof kept) => Object.fromEntries(lists.map((l) => [l.key, xs.reduce((a, x) => a + (x.byList[l.key] ?? 0), 0)]));
  const virtual = new Set(lists.filter((l) => l.kind === "virtual").map((l) => l.key));
  const total = matching.length;
  const pageSize = pg?.pageSize ?? Math.max(1, total);
  const page = pg ? Math.min(Math.max(1, pg.page), Math.max(1, Math.ceil(total / pg.pageSize))) : 1;
  const cut = <T>(xs: T[]) => xs.slice((page - 1) * pageSize, page * pageSize);
  const paged = await (sort === "reach" || sort === "closing"
    ? withHistory(cat, matching, reachFor, virtual).then((xs) => cut(refineSeats(xs, { sort })))
    : withHistory(cat, cut(refineSeats(matching, { sort })), reachFor, virtual));
  const rows: SeatLine[] = paged.map((x) => {
    const h = info.get(x.college.key);
    return { ...x, hospital: h && (h.type || h.beds || h.mccProfileUrl) ? { type: h.type, beds: h.beds, mccProfileUrl: h.mccProfileUrl } : null };
  });
  return { rows, total, page, pageSize, lists, seats: perList(matching), noState: perList(noState), unknownTerms: refineSeats(unknown, { quotas, states }).length };
}

// ---------- The Seats page's params, shared with its CSV (/api/v1/seats/export) ----------

const listParams = ["sp", "deg", "c", "quota", "st", "has", ...termFilterLists];
/**
 * Seats page filters. Course, degree, exact course, quota and state are her profile params (sp, deg, c, quota, st), as
 * on Options, so her profile applies by default (no quota ticked: the open quotas); `scat` (seat category: absent = the
 * ones she can take, "all", or one) is not a profile key. `nohist=1`: only seats whose course and quota is not an option
 * (no past allotments). `view`: `matrix` (default: one row per institute, course, quota and seat category with seats in the
 * round's lists, every closing rank; `rounds=all` adds every earlier list and the rows MCC allotted that no list prints),
 * `list` (one list) or `compare` (every list of the round side by side). `has`: rows with seats in the round's clear,
 * virtual or newly added list (any ticked). `sort` absent: reach with a rank, else institute. Fee, stipend, bond, leaving,
 * college type and `nd`: lib/term-filters.ts (on Seats an absent cap is no cap, not her profile's).
 */
export const seatsParamsSchema = z.object({
  tab: z.enum(["matrix", "trends"]).default("matrix"),
  view: z.enum(["matrix", "list", "compare"]).default("matrix"),
  rounds: z.literal("all").optional(),
  has: z.array(z.enum(seatKinds)).default([]),
  list: z.string().max(200).optional(),
  sp: z.array(z.string().max(100)).default([]),
  deg: z.array(z.string().max(100)).default([]),
  /** Exact courses (profile pairs); when any, they replace sp x deg. A malformed one is dropped, the rest kept. */
  c: z.array(z.string().max(200)).default([]).transform((xs) => xs.filter((x) => pairSchema.safeParse(x).success)),
  quota: z.array(z.string().max(100)).default([]),
  st: z.array(z.string().max(100)).default([]),
  scat: z.enum(["all", ...seatCategories]).optional(),
  /** One option (links from Options and institute pages): institute slug, course slug, quota. They override the profile's courses, states and quotas. */
  inst: z.string().max(200).optional(),
  course: z.string().max(100).optional(),
  squota: z.string().max(100).optional(),
  nohist: z.literal("1").optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(seatSorts).optional(),
  page: pageValue.default(1),
  ...termFilterShape,
});
export type SeatsParams = z.infer<typeof seatsParamsSchema>;
/** Leniently, as pages do: a bad field falls back to its default. */
export const parseSeatsParams = (p: URLSearchParams) => parseSearchParams(seatsParamsSchema, p, listParams);

/**
 * What the Seats page shows for these params: the picked list (default the newest), her seat categories (`mine`), the
 * sort in force and the rows (`r`, null when no list is imported). `pageSize` gives page `f.page`; without it every row (CSV).
 */
export async function seatsView(f: SeatsParams, profile: Profile | null, pageSize?: number, exam: ExamKey = DEFAULT_EXAM) {
  const [all, meta, inst] = await Promise.all([seatLists(exam), getMeta(exam), f.inst ? getCollege(f.inst, exam) : null]);
  const course = meta.courses.find((c) => c.slug === f.course);
  const list = all.find((l) => l.key === f.list) ?? all[0] ?? null;
  const mine = profile ? eligibleCategories(profile.category, profile.pwd) : null;
  const sort: SeatSort = f.sort ?? (profile ? "reach" : "college");
  const base = { f, profile, all, meta, inst, course, list, mine, sort };
  if (!list) return { ...base, r: null };
  const cats = f.scat === "all" ? undefined : f.scat ? [f.scat] : (mine ?? undefined);
  // As on Options: with a profile, no quota ticked means the open quotas, never the restricted ones.
  const quotas = f.squota ? [f.squota] : profile ? profileQuotas(profile, exams[exam].quotas) : f.quota;
  const r = await findSeats(
    {
      list: list.key,
      college: inst?.key,
      courses: course ? [course.slug] : undefined,
      ...(course ? {} : profileCourseFilter({ specialties: f.sp, degrees: f.deg, pairs: f.c })),
      // A PDF that prints no quota (shown as "—") is not filtered on quota.
      quotas: quotas.length ? [...quotas, null] : [],
      states: inst ? [] : f.st,
      categories: cats,
      nohist: !!f.nohist,
      q: f.q?.trim() || undefined,
      sort,
      compare: f.view === "list" ? false : f.view === "matrix" && f.rounds ? "all" : true,
      has: f.view === "matrix" ? f.has : undefined,
      // NEET SS: no label without her question group (a rank compares only within one group).
      reachFor: profile && mine && (!perGroup(exam) || profile.quotas.length > 0) ? { rank: profile.rank, categories: mine } : null,
      // An absent fee / bond cap is her profile's, as on Options.
      terms: termFilters(f, profile),
    },
    pageSize ? { page: f.page, pageSize } : undefined,
    exam,
  );
  return { ...base, r };
}
export type SeatsView = Awaited<ReturnType<typeof seatsView>>;

// ---------- CSV ----------

/** One CSV field: "—" when missing; quoted when needed; a leading = + - @ is escaped so a spreadsheet never runs it as a formula. */
const field = (v: string | number | null | undefined) => {
  if (v == null || v === "") return "—";
  const s = typeof v === "number" ? String(v) : /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csvLine = (xs: (string | number | null | undefined)[]) => xs.map(field).join(",");

const listName = (l: SeatList, lists: SeatList[]) => {
  const day = lists.some((x) => x !== l && x.kind === l.kind && x.year === l.year && x.round === l.round) ? listDay(l) : undefined;
  return `${l.year} ${roundNameFrom(l.name, l.round)} ${seatKindLabel[l.kind].toLowerCase()}${day ? ` (${day} PDF)` : ""}`;
};
/** "2026 R2 clear vacancy seats", "2026 R2 newly added seats". */
const seatsCol = (l: SeatList, lists: SeatList[]) => `${listName(l, lists)}${l.kind === "new" ? "" : " seats"}`;
const docOf = (s: { name: string; url: string | null } | null | undefined) => s && (s.url ? `${s.name} (${s.url})` : s.name);

/**
 * The view as CSV (UTF-8, no BOM: the route adds it), in the page's order and filters, every matching row: seats per
 * list (never added), past closings (matrix: every round of every year, each with its allotments), the reach label (with
 * a rank), and terms each with its own document, the course's figures as the Fees page reads them, its beds and type. After a blank
 * row: `notes` and the sources every column comes from (seat list PDFs with their date, the later MCC seat notices they
 * don't apply and the same-day ones they may already include; the MCC result PDF of each round). "—" = not available.
 */
/** The CSV's Beds note: how the source prints a rounded count ("270+"), and a conflict in the source. */
function bedsNote(b: ReportedBeds) {
  const c = reportedCount(b);
  return [c.text.endsWith("+") && `the source prints ${c.text}`, c.conflicting && "the source prints conflicting figures"].filter(Boolean).join("; ") || null;
}

export async function seatsCsv(v: SeatsView & { r: NonNullable<SeatsView["r"]> }, notes: string[] = []) {
  const { r, profile, meta } = v;
  const matrix = v.f.view === "matrix";
  const latest = latestRound(meta.sources);
  // The matrix's closing columns: every year with results, newest first (the latest year's rounds with a result, every round of the others).
  const closingCols = matrix ? meta.years.flatMap((y, i) => (i === 0 ? y.rounds : rounds).map((round) => ({ year: y.year, round }))) : [];
  // MCC seat notices of each round the lists are from (one round, but every round with "All rounds").
  const roundOf = (l: SeatList) => `${l.year}|${l.round}`;
  const firsts = [...new Map(r.lists.map((l) => [roundOf(l), l])).values()];
  const notices = new Map(await Promise.all(firsts.map(async (l) => [roundOf(l), await listNotices({ kind: "seat_matrix", year: l.year, round: l.round })] as const)));
  const at = (x: SeatLine, p: { year: number; round: Round }) => x.rounds.find((c) => c.year === p.year && c.round === p.round);
  const label = (c: { year: number; round: Round }) => `${c.year} ${roundLabel[c.round]}`;
  const prov = (c: PastClosing) => `${label(c)}${c.provisional ? " (provisional)" : ""}`;
  const kinds = ["fee", "stipend", "bond", "penalty"] as const;
  const kindOf = { fee: "FEE", stipend: "STIPEND", bond: "BOND", penalty: "PENALTY" } as const;
  const head = [
    "Institute", "State", "Degree", "Course", "Quota", "Restricted quota", "Seat category",
    ...r.lists.map((l) => seatsCol(l, r.lists)),
    ...(matrix
      ? closingCols.flatMap((p) => [`${label(p)} closing rank`, `${label(p)} allotted`])
      : [...PAST_ROUNDS.map((p) => `${label(p)} closing rank`), "Deepest closing (every round counted, Stray included)", "Deepest round", "Other closing ranks the reach label counts"]),
    "Fee year 1 ₹", "Stipend year 1 ₹/month", "Bond years", "Bond ₹ (highest)", "Leaving penalty ₹ (highest)", "Beds", "Beds note", "Type",
    ...(profile ? [`${matrix ? "Your chances" : "Reach"} at AIR ${profile.rank} (history, not a prediction)`] : []),
    ...kinds.flatMap((k) => [termLabel[kindOf[k]], `${termLabel[kindOf[k]]} source`]),
  ];
  const all = (x: SeatLine, p: { year: number; round: Round }) => x.closings.find((c) => c.year === p.year && c.round === p.round);
  const body = r.rows.map((x) => [
    x.college.name, x.college.state, x.degree, x.course?.name ?? x.specialty, x.quota, x.quota == null ? null : openQuotas.includes(x.quota) ? "No" : "Yes", x.category,
    ...r.lists.map((l) => x.byList[l.key]),
    ...(matrix
      ? closingCols.flatMap((p) => [all(x, p)?.closing, all(x, p)?.n])
      : [
          ...PAST_ROUNDS.map((p) => at(x, p)?.closing),
          x.deepest?.closing, x.deepest && prov(x.deepest),
          x.rounds.filter((c) => !PAST_ROUNDS.some((p) => p.year === c.year && p.round === c.round)).map((c) => `${prov(c)}: ${c.closing}`).join("; "),
        ]),
    feeValue.fee1(x.fees), feeValue.stip1(x.fees), feeValue.bondyrs(x.fees), feeValue.bond(x.fees), feeValue.leave(x.fees), x.hospital?.beds?.n, x.hospital?.beds && bedsNote(x.hospital.beds), x.hospital?.type && collegeTypeLabel[x.hospital.type.value],
    ...(profile ? [x.reach ? `${reachLabel(x.reach, latest, PAST_YEARS, true, x.category)}${x.reachProvisional ? " (provisional)" : ""}` : x.noLabel] : []),
    ...kinds.flatMap((k) => [x.terms[k]?.text, docOf(x.terms[k]?.source)]),
  ]);
  const used = new Set(r.rows.flatMap((x) => (matrix ? x.closings : x.rounds).map(label)));
  const sources = [
    ...r.lists.flatMap((l) => {
      const c = seatChanges(l, v.all, notices.get(roundOf(l)) ?? []);
      return [
        [l.name, l.url, `${seatsCol(l, r.lists)}: MCC notice dated ${l.publishedAt ?? "—"}; the list as that PDF printed it`],
        ...c.later.map((n) => [n.title, n.url, `MCC seat notice dated ${n.date}, after the ${listName(l, r.lists)} list: not applied here`]),
        ...c.sameDay.map((n) => [n.title, n.url, `MCC seat notice dated ${n.date}, the same day as the ${listName(l, r.lists)} list: it may already include it`]),
      ];
    }),
    ...meta.sources.filter((s) => used.has(label(s))).map((s) => [s.name, s.url, `${label(s)} closing ranks${s.provisional ? " (provisional)" : ""}`]),
  ];
  const foot = [
    ...notes.map((n) => [n]),
    ["Closing rank = the highest All India Rank MCC allotted in that round on a seat of the row's quota and seat category. Seat columns are separate MCC lists of one round: they overlap, so never add them."],
    ...(matrix ? [["Allotted = allotments MCC made in that round on the row's quota and seat category (not seats). Provisional results are marked in the sources below."]] : []),
    ["Fee, stipend, bond and leaving figures are the course's programme terms as the Fees page reads them (a fee range: its highest; an NBEMS fee ceiling or stipend minimum is that limit, not the hospital's own figure: the term column says so; bond and leaving: the highest amount for the course; Bond years and Bond ₹ 0 = no bond on record, a record says so); — = not declared, or declared in words only (see the term columns). Beds = as the hospital reports them (self-reported, not verified by Seatora; its period and source are on the institute's Hospital facts tab; Beds note: a count the source prints rounded, e.g. 270+, or conflicting figures in the source). Type = inferred from the institute's name and quota (a few from Seatora's research on the hospital), not an official field."],
    [],
    ["Source", "Link", "Note"],
    ...sources,
  ];
  return [head, ...body, [], ...foot].map(csvLine).join("\r\n") + "\r\n";
}
