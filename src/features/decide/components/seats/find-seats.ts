import "server-only";
import { z } from "zod";
import { pageValue, parseSearchParams } from "../../lib/params";
import { classifyReach, eligibleCategories, LATEST_YEAR, PAST_YEARS, reachLabel, reachOrder, type Reach } from "../../lib/reach";
import { pairSchema, profileCourseFilter, profileQuotas, type Profile } from "../../profile";
import { getCatalog, type Catalog } from "../../server/catalog";
import { listNotices } from "../../server/notices";
import { findCutoffs } from "../../server/queries";
import { hasOption, listSeats, seatChanges, seatLists, type SeatFilters, type SeatRow } from "../../server/seats";
import { getCollege, getMeta, programOf, type OptionTerms, type PageQuery } from "../../service";
import { baseCategories, openQuotas, optionId, roundLabel, seatKindLabel, termLabel, type Category, type Cutoff, type Round, type SeatList, type Term } from "../../types";

export const seatSorts = ["reach", "closing", "seats", "college", "state"] as const;
export type SeatSort = (typeof seatSorts)[number];
export const seatCategories: Category[] = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)];

/** The past rounds every seat row shows, on its own quota and seat category: R2 and R3 of the two past years, and the latest R1. */
export const PAST_ROUNDS: { year: number; round: Round }[] = [
  ...PAST_YEARS.flatMap((year) => (["R2", "R3"] as const).map((round) => ({ year, round }))),
  { year: LATEST_YEAR, round: "R1" },
];

export type PastClosing = { year: number; round: Round; closing: number; provisional: boolean };
export type SeatHistory = {
  /** Closing ranks on the row's quota and seat category in every round the reach label counts (both past years, the latest R1), oldest first. */
  rounds: PastClosing[];
  /** The deepest of `rounds` in PAST_ROUNDS; null when none of them has one. */
  deepest: PastClosing | null;
  /** Options' label (lib/reach.ts) on this row's seat category alone; null without a rank, or on a seat category she can't take. */
  reach: Reach | null;
  /** The label rests on a provisional latest-year R1 (as OptionRow.reachProvisional). */
  reachProvisional: boolean;
  /** Fee, stipend, bond and seat-leaving penalty as published for the row's institute and program, each with its source. */
  terms: OptionTerms;
};
/**
 * `byList`: seats per SeatList key, never added across keys. List view: the row's own list. Compare view: every list of
 * the round that prints this row (absent = that list prints none); `list`/`seats` are then the current list's (0: none).
 */
export type SeatLine = SeatRow & SeatHistory & { byList: Record<string, number> };

/**
 * listSeats filters with several quotas and states (her profile can hold more than one) and a sort. A null in `quotas`
 * keeps the rows of a PDF that prints no quota. `nohist`: only rows whose course and quota is not an Options row (no
 * past allotments). `compare`: every list of the picked list's round side by side, one row per institute, course,
 * quota and seat category. `reachFor`: her rank and the seat categories she can take, for the reach labels.
 */
export type SeatQuery = Omit<SeatFilters, "quota" | "state"> & {
  quotas?: (string | null)[];
  states?: string[];
  sort?: SeatSort;
  nohist?: boolean;
  compare?: boolean;
  reachFor?: { rank: number; categories: string[] } | null;
};

const lastIfNull = (s: string | null) => s ?? "￿";

/**
 * Quota/state filters and the sort on rows in listSeats order (college name…); the sort is stable, so ties keep it.
 * `reach` (beyond her rank first, as Options) and `closing` (deepest past closing first) read the rows' history; missing last.
 */
export function refineSeats<T extends SeatRow & Partial<Pick<SeatHistory, "reach" | "deepest">>>(rows: T[], { quotas, states, sort = "college" }: Pick<SeatQuery, "quotas" | "states" | "sort">): T[] {
  const out = rows.filter(
    (r) => (!quotas?.length || quotas.includes(r.quota)) && (!states?.length || (r.college.state != null && states.includes(r.college.state))),
  );
  const deep = (r: T) => r.deepest?.closing ?? -1;
  const reach = (r: T) => (r.reach ? reachOrder.indexOf(r.reach) : reachOrder.length);
  if (sort === "state") out.sort((a, b) => lastIfNull(a.college.state).localeCompare(lastIfNull(b.college.state)));
  if (sort === "seats") out.sort((a, b) => b.seats - a.seats);
  if (sort === "closing") out.sort((a, b) => deep(b) - deep(a));
  if (sort === "reach") out.sort((a, b) => reach(a) - reach(b) || deep(b) - deep(a));
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

/** One row per institute, course, quota and seat category, with its seats in each list (a line a PDF prints twice is summed, as seatCountsFor does). */
function mergeLists(rows: SeatRow[], current: string) {
  const out = new Map<string, SeatRow & { byList: Record<string, number> }>();
  for (const x of rows) {
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

/** Past closings, reach label and terms per row: one cutoff read for the rows' courses, quotas and seat categories. */
async function withHistory<T extends SeatRow>(cat: Catalog, rows: T[], reachFor: SeatQuery["reachFor"]): Promise<(T & SeatHistory)[]> {
  const opts = rows.filter((r) => r.cs && r.quota != null);
  const years = [...PAST_YEARS, LATEST_YEAR];
  const cutoffs = await findCutoffs(cat, { cs: uniq(opts.map((r) => r.cs!)), quotas: uniq(opts.map((r) => r.quota!)), categories: uniq(opts.map((r) => r.category)), years });
  const provisional = new Set(cat.sources.filter((s) => s.provisional).map((s) => s.key));
  const latestProvisional = cat.sources.some((s) => s.year === LATEST_YEAR && s.round === "R1" && s.provisional);
  const by = new Map<string, Cutoff[]>();
  for (const c of cutoffs) {
    const k = `${optionId(c)}|${c.category}`;
    (by.get(k) ?? by.set(k, []).get(k)!).push(c);
  }
  const opt = { latestYear: LATEST_YEAR, pastYears: PAST_YEARS };
  const shown = (c: { year: number; round: Round }) => PAST_ROUNDS.some((p) => p.year === c.year && p.round === c.round);
  return rows.map((r) => {
    const all = (r.quota != null && by.get(`${optionId({ college: r.college.key, degree: r.degree, specialty: r.specialty, quota: r.quota })}|${r.category}`)) || [];
    // The rounds the label counts (as classifyReach): both past years, every round, and the latest year's R1.
    const used = all.filter((c) => PAST_YEARS.includes(c.year) || (c.year === LATEST_YEAR && c.round === "R1"));
    const rounds = used.map((c) => ({ year: c.year, round: c.round, closing: c.closing, provisional: provisional.has(c.src) }));
    const deepest = rounds.filter(shown).reduce<PastClosing | null>((a, c) => (!a || c.closing > a.closing ? c : a), null);
    const reach = reachFor?.categories.includes(r.category) ? classifyReach(reachFor.rank, used, { ...opt, includeLatest: true }) : null;
    const reachProvisional = !!reach && latestProvisional && classifyReach(reachFor!.rank, used, { ...opt, includeLatest: false }) !== reach;
    return { ...r, rounds, deepest, reach, reachProvisional, terms: termsOf(cat, r.college.key, r.degree) };
  });
}

/**
 * Seat rows for the Seats page, its CSV and /api/v1/seats, each with its past closings, reach label and terms.
 * `seats[list key]` = Σ seats of every matching row of that one list (lists are never added together). Empty filter
 * arrays mean "all". `noState[list key]`: with a state filter, Σ seats of rows that match everything else but are at an
 * institute with no state in the data (the filter drops them). `pg` returns one page, without it every row.
 * ponytail: reads every matching row of the picked list(s) (≤ ~18k each, ~150 ms) and sorts/pages here; history is read
 * for the page only unless the sort needs it (reach, closing). Move sort and paging into SQL if lists grow.
 */
export async function findSeats(f: SeatQuery, pg?: PageQuery) {
  const { quotas, states, sort, nohist, compare, reachFor, courses, specialties, degrees, pairs, categories, ...rest } = f;
  const filters = { ...rest, courses: some(courses), specialties: some(specialties), degrees: some(degrees), pairs: some(pairs), categories: some(categories), quota: quotas?.length === 1 ? (quotas[0] ?? undefined) : undefined };
  // State is filtered here, not in SQL, so the rows a state filter drops for having no state can be counted.
  const [r, cat] = await Promise.all([listSeats(filters), getCatalog()]);
  let lists = r.lists;
  let lines = r.rows.map((x) => ({ ...x, byList: { [x.list]: x.seats } }));
  if (compare && r.lists.length) {
    const cur = r.lists[0];
    lists = (await seatLists()).filter((l) => l.year === cur.year && l.round === cur.round);
    const more = await Promise.all(lists.filter((l) => !r.lists.some((x) => x.key === l.key)).map((l) => listSeats({ ...filters, list: l.key })));
    lines = mergeLists([...r.rows, ...more.flatMap((m) => m.rows)], cur.key).sort(byInstitute);
  }
  const kept = nohist ? lines.filter((x) => !hasOption(cat, x)) : lines;
  const matching = refineSeats(kept, { quotas, states });
  const noState = states?.length ? refineSeats(kept, { quotas }).filter((x) => x.college.state == null) : [];
  const perList = (xs: typeof lines) => Object.fromEntries(lists.map((l) => [l.key, xs.reduce((a, x) => a + (x.byList[l.key] ?? 0), 0)]));
  const total = matching.length;
  const pageSize = pg?.pageSize ?? Math.max(1, total);
  const page = pg ? Math.min(Math.max(1, pg.page), Math.max(1, Math.ceil(total / pg.pageSize))) : 1;
  const cut = <T>(xs: T[]) => xs.slice((page - 1) * pageSize, page * pageSize);
  const rows: SeatLine[] =
    sort === "reach" || sort === "closing"
      ? cut(refineSeats(await withHistory(cat, matching, reachFor), { sort }))
      : await withHistory(cat, cut(refineSeats(matching, { sort })), reachFor);
  return { rows, total, page, pageSize, lists, seats: perList(matching), noState: perList(noState) };
}

// ---------- The Seats page's params, shared with its CSV (/api/v1/seats/export) ----------

const listParams = ["sp", "deg", "c", "quota", "st"];
/**
 * Seats page filters. Course, degree, exact course, quota and state are her profile params (sp, deg, c, quota, st), as
 * on Options, so her profile applies by default (no quota ticked: the open quotas); `scat` (seat category: absent = the
 * ones she can take, "all", or one) is not a profile key. `nohist=1`: only seats whose course and quota is not an option
 * (no past allotments). `view=compare`: every list of the round side by side. `sort` absent: reach with a rank, else institute.
 */
export const seatsParamsSchema = z.object({
  tab: z.enum(["matrix", "trends"]).default("matrix"),
  view: z.enum(["list", "compare"]).default("list"),
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
});
export type SeatsParams = z.infer<typeof seatsParamsSchema>;
/** Leniently, as pages do: a bad field falls back to its default. */
export const parseSeatsParams = (p: URLSearchParams) => parseSearchParams(seatsParamsSchema, p, listParams);

/**
 * What the Seats page shows for these params: the picked list (default the newest), her seat categories (`mine`), the
 * sort in force and the rows (`r`, null when no list is imported). `pageSize` gives page `f.page`; without it every row (CSV).
 */
export async function seatsView(f: SeatsParams, profile: Profile | null, pageSize?: number) {
  const [all, meta, inst] = await Promise.all([seatLists(), getMeta(), f.inst ? getCollege(f.inst) : null]);
  const course = meta.courses.find((c) => c.slug === f.course);
  const list = all.find((l) => l.key === f.list) ?? all[0] ?? null;
  const mine = profile ? eligibleCategories(profile.category, profile.pwd) : null;
  const sort: SeatSort = f.sort ?? (profile ? "reach" : "college");
  const base = { f, profile, all, meta, inst, course, list, mine, sort };
  if (!list) return { ...base, r: null };
  const cats = f.scat === "all" ? undefined : f.scat ? [f.scat] : (mine ?? undefined);
  // As on Options: with a profile, no quota ticked means the open quotas, never the restricted ones.
  const quotas = f.squota ? [f.squota] : profile ? profileQuotas(profile) : f.quota;
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
      compare: f.view === "compare",
      reachFor: profile && mine && { rank: profile.rank, categories: mine },
    },
    pageSize ? { page: f.page, pageSize } : undefined,
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
  const day = lists.some((x) => x !== l && x.kind === l.kind) ? l.key.match(/\d{4}-\d{2}-\d{2}/)?.[0] : undefined;
  return `${l.year} ${roundLabel[l.round]} ${seatKindLabel[l.kind].toLowerCase()}${day ? ` (${day} PDF)` : ""}`;
};
/** "2026 R2 clear vacancy seats", "2026 R2 newly added seats". */
const seatsCol = (l: SeatList, lists: SeatList[]) => `${listName(l, lists)}${l.kind === "new" ? "" : " seats"}`;
const docOf = (s: { name: string; url: string | null } | null | undefined) => s && (s.url ? `${s.name} (${s.url})` : s.name);

/**
 * The view as CSV (UTF-8, no BOM: the route adds it), in the page's order and filters, every matching row: seats per
 * list (never added), past closings, the reach label (with a rank), and terms each with its own document. After a blank
 * row: `notes` and the sources every column comes from (seat list PDFs with their date and the later MCC seat notices
 * they don't apply; the MCC result PDF of each round). "—" = not available.
 */
export async function seatsCsv(v: SeatsView & { r: NonNullable<SeatsView["r"]> }, notes: string[] = []) {
  const { r, profile, meta } = v;
  const round = r.lists[0];
  const notices = round ? await listNotices({ kind: "seat_matrix", year: round.year, round: round.round }) : [];
  const at = (x: SeatLine, p: { year: number; round: Round }) => x.rounds.find((c) => c.year === p.year && c.round === p.round);
  const label = (c: { year: number; round: Round }) => `${c.year} ${roundLabel[c.round]}`;
  const prov = (c: PastClosing) => `${label(c)}${c.provisional ? " (provisional)" : ""}`;
  const kinds = ["fee", "stipend", "bond", "penalty"] as const;
  const kindOf = { fee: "FEE", stipend: "STIPEND", bond: "BOND", penalty: "PENALTY" } as const;
  const head = [
    "Institute", "State", "Degree", "Course", "Quota", "Restricted quota", "Seat category",
    ...r.lists.map((l) => seatsCol(l, r.lists)),
    ...PAST_ROUNDS.map((p) => `${label(p)} closing rank`),
    "Deepest of these", "Deepest round", "Other closing ranks the reach label counts",
    ...(profile ? [`Reach at AIR ${profile.rank} (history, not a prediction)`] : []),
    ...kinds.flatMap((k) => [termLabel[kindOf[k]], `${termLabel[kindOf[k]]} source`]),
  ];
  const body = r.rows.map((x) => [
    x.college.name, x.college.state, x.degree, x.course?.name ?? x.specialty, x.quota, x.quota == null ? null : openQuotas.includes(x.quota) ? "No" : "Yes", x.category,
    ...r.lists.map((l) => x.byList[l.key]),
    ...PAST_ROUNDS.map((p) => at(x, p)?.closing),
    x.deepest?.closing, x.deepest && prov(x.deepest),
    x.rounds.filter((c) => !PAST_ROUNDS.some((p) => p.year === c.year && p.round === c.round)).map((c) => `${prov(c)}: ${c.closing}`).join("; "),
    ...(profile ? [x.reach ? `${reachLabel(x.reach, LATEST_YEAR, PAST_YEARS)}${x.reachProvisional ? " (provisional)" : ""}` : "Not a seat category you can take"] : []),
    ...kinds.flatMap((k) => [x.terms[k]?.text, docOf(x.terms[k]?.source)]),
  ]);
  const used = new Set(r.rows.flatMap((x) => x.rounds.map(label)));
  const sources = [
    ...r.lists.flatMap((l) => [
      [l.name, l.url, `${seatsCol(l, r.lists)}: MCC notice dated ${l.publishedAt ?? "—"}; the list as that PDF printed it`],
      ...seatChanges(l, v.all, notices).later.map((n) => [n.title, n.url, `MCC seat notice dated ${n.date}, after the ${listName(l, r.lists)} list: not applied here`]),
    ]),
    ...meta.sources.filter((s) => used.has(label(s))).map((s) => [s.name, s.url, `${label(s)} closing ranks${s.provisional ? " (provisional)" : ""}`]),
  ];
  const foot = [
    ...notes.map((n) => [n]),
    ["Closing rank = the highest All India Rank MCC allotted in that round on a seat of the row's quota and seat category. Seat columns are separate MCC lists of one round: they overlap, so never add them."],
    [],
    ["Source", "Link", "Note"],
    ...sources,
  ];
  return [head, ...body, [], ...foot].map(csvLine).join("\r\n") + "\r\n";
}
