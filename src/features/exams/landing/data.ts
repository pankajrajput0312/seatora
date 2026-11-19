// What an exam's landing page (/neet-pg, /neet-ss…) shows from its own data: counts, a few live examples and where its
// counselling stands, read through Decide's catalog and services. Server only: another exam's data reaches staff only.
// Read without a browser session (asTrustedServer): ./gate.ts has checked the caller (public exam, or staff).
import "server-only";
import { asTrustedServer, getCatalog, perImport, type Catalog } from "@/features/decide/server/catalog";
import { listNotices, roundStatus, scheduleYear } from "@/features/decide/server/notices";
import { findCutoffs } from "@/features/decide/server/queries";
import { seatLists } from "@/features/decide/server/seats";
import { courseTerms } from "@/features/decide/server/terms";
import { examGroupCourses } from "@/features/decide/service";
import { statCells } from "@/features/decide/lib/stat-format";
import { eligibleCategories, isStrayRound } from "@/features/decide/lib/reach";
import { stepsNow } from "@/features/decide/lib/round-status";
import { optionId, type BaseCategory, type Round } from "@/features/decide/types";
import type { Opt } from "@/features/decide/server/catalog";
import { db } from "@/lib/db";
import { quotaIn, roundIn, roundNamesOf, tidyLabel, type Exam } from "../exam";
import { yearName } from "../keys";
import { DEFAULT_EXAM, exams, headYearIn, restrictedQuota, type ExamKey } from "../registry";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const byAllotments = (year: number) => (a: Opt, b: Opt) => (b.byYear[year] ?? 0) - (a.byYear[year] ?? 0) || (a.id < b.id ? -1 : 1);
/** An option's institute, course name and slug, and quota as the exam names it. */
const nameIn = (cat: Catalog, E: Pick<Exam, "quotaNames" | "typos">, o: Opt) => {
  const course = cat.courseOf.get(`${o.degree}|${o.specialty}`);
  return { college: cat.collegeByKey.get(o.college)!, course: course ? `${course.degree} ${course.name}` : o.degree, courseSlug: course?.slug ?? "", quota: quotaIn(E, o.quota) };
};

export const landingData = (exam: ExamKey) => asTrustedServer(() => load(exam));
export type LandingData = Awaited<ReturnType<typeof load>>;

async function load(exam: ExamKey) {
  const [cat, lists, notices, year] = await Promise.all([getCatalog(exam), seatLists(exam), listNotices({}, exam), scheduleYear(exam)]);
  // The exam with its rounds' names and its latest complete year, as active.tsx examInfo has them (not imported: it
  // brings Decide's client components, and their JS, into this public route).
  const E = exam === DEFAULT_EXAM ? exams[exam] : { ...exams[exam], roundNames: roundNamesOf([...cat.sources, ...lists]) };
  const head = headYearIn(exam, cat.sources);
  const years = [...cat.meta.years].reverse();
  const nameOf = (o: Opt) => nameIn(cat, E, o);
  // Options anyone can take that year, most allotments first (the biggest courses: the examples a reader recognises).
  const open = cat.options.filter((o) => !restrictedQuota(exam, o.quota) && o.byYear[head]).sort(byAllotments(head));

  /** One option's closing rank on Open seats, round by round, each with its result PDF. */
  const ladder = async (o: Opt | undefined) => {
    if (!o) return null;
    const cuts = await findCutoffs(cat, { cs: [o.cs], quotas: [o.quota], categories: ["Open"], years: [head] });
    const rounds = E.rounds.flatMap((r) => {
      const xs = cuts.filter((c) => c.round === r);
      if (!xs.length) return [];
      const src = cat.sources.find((s) => s.key === xs[0].src);
      return [{ round: r, name: roundIn(E, head, r), closing: Math.max(...xs.map((c) => c.closing)), source: src ? { name: src.name, url: src.url } : null }];
    });
    return rounds.length ? { ...nameOf(o), rawQuota: o.quota, year: yearName(exam, head), rounds } : null;
  };
  // The main quota's biggest option (NEET PG and MDS: All India; INI-CET: Open; NEET SS: any question group's).
  const main = exams[exam].quotas[0];
  const first = open.find((o) => !main || o.quota === main);
  const deemedOpt = exam === "neet-pg" || exam === "neet-mds" ? open.find((o) => o.quota === "Deemed/Paid Seats") : undefined;
  const [closing, deemed] = await Promise.all([ladder(first), ladder(deemedOpt)]);

  // A fee and bond example: that option's terms if they state a first-year fee and a bond or leaving penalty, else the
  // next biggest option's that do. ponytail: scans the top 300 options only; enough for every bundle today.
  const fee =
    [first, ...open.slice(0, 300)].flatMap((o) => {
      if (!o) return [];
      const t = courseTerms(cat, o.college, o.degree, o.specialty, o.quota);
      if (!t.years[0]?.fee || (t.bond.status !== "declared" && !t.bond.leaving.length)) return [];
      const srcs = [...new Set([t.years[0].fee.src, t.bond.src].filter((n): n is number => n != null))].flatMap((n) => t.sources.find((s) => s.n === n) ?? []);
      return [{ ...nameOf(o), cells: statCells(t).filter((c) => !c.missing).map((c) => ({ label: c.label, value: c.full })), sources: srcs.map((s) => ({ name: s.label, url: s.url, year: s.year != null ? yearName(exam, s.year) : "" })) }];
    })[0] ?? null;

  // The newest seat list (newest year and round first, clear vacancy before the other kinds).
  const seats = lists[0] ? { ...lists[0], roundName: roundIn(E, lists[0].year, lists[0].round), yearName: yearName(exam, lists[0].year) } : null;

  // NEET SS: its question groups, each with how many courses MCC allotted under it.
  const groups = exam === "neet-ss" ? Object.entries(await examGroupCourses(exam)).map(([group, courses]) => ({ group: tidyLabel(E, group), courses: courses.length })).sort((a, b) => b.courses - a.courses || a.group.localeCompare(b.group)) : [];

  const status = year == null ? null : await roundStatus(year, exam);
  const now = new Date();
  return {
    exam,
    E,
    head: yearName(exam, head),
    counts: {
      institutes: new Set(cat.options.map((o) => o.college)).size,
      courses: cat.courses.length,
      years: years.length,
      first: years[0] ? yearName(exam, years[0].year) : null,
      last: years.at(-1) ? yearName(exam, years.at(-1)!.year) : null,
      allotments: sum(cat.options.flatMap((o) => Object.values(o.byYear))),
      seatLists: lists.length,
      resultPdfs: cat.sources.length,
      termDocs: new Set(cat.terms.map((t) => t.source.url ?? t.source.name)).size,
      notices: notices.length,
    },
    closing,
    fee,
    seats,
    deemed,
    groups,
    /** The latest year's first result PDF (the question groups' source). */
    groupSource: groups.length ? (cat.sources.find((s) => s.year === exams[exam].latestYear) ?? null) : null,
    status: status && { year: yearName(exam, status.year, true), asOf: status.asOf, steps: stepsNow(status, now) },
    notices: notices.filter((n) => n.url).slice(0, 3),
    /** The newest notice's date (any kind, with or without a link): "latest MCC notice 17 Nov" beside when Seatora checked. */
    latestNotice: notices[0]?.date ?? null,
    /** The newest schedule notice with a link: the schedule, public on MCC's site. */
    schedule: notices.find((n) => n.kind === "schedule" && n.url) ?? null,
    site: exams[exam].site ?? { url: "https://mcc.nic.in/", name: "MCC's website" },
  };
}

/**
 * NEET PG's options anyone can take (open quotas) with their head year's closing on one category's seats (the
 * categories she can be allotted, eligibleCategories) in each main round, Round 1 to 3 (a stray round never counts, as
 * Options' "Reached"), once per category per data version. ponytail: reads the category's head-year cutoffs (~15k rows)
 * once per server instance; push the rank filter into SQL if rank checks ever get heavy traffic.
 */
const rankTable = perImport(async (category) => {
  const exam = DEFAULT_EXAM;
  const E = exams[exam];
  const cat = await getCatalog(exam);
  const head = headYearIn(exam, cat.sources);
  const cuts = await findCutoffs(cat, { quotas: E.quotas, categories: eligibleCategories(category as BaseCategory, false), years: [head] });
  const by = new Map<string, Map<Round, { closing: number; src: string }>>();
  for (const c of cuts) {
    if (isStrayRound(c.round)) continue;
    const id = optionId(c);
    const rounds = by.get(id) ?? by.set(id, new Map()).get(id)!;
    const was = rounds.get(c.round);
    if (!was || c.closing > was.closing) rounds.set(c.round, { closing: c.closing, src: c.src });
  }
  const rows = [...by].flatMap(([id, rs]) => {
    const o = cat.optionById.get(id);
    return o ? [{ o, rounds: E.rounds.flatMap((r) => (rs.has(r) ? [{ round: r, ...rs.get(r)! }] : [])) }] : [];
  });
  return { cat, E, head, rows };
});

/**
 * Where a NEET PG rank got in last year, for the public rank check (no sign-in): `n`, how many options anyone can take
 * closed at or after `rank` on `category`'s seats in a main round of the head year; `rows`, the `take` tightest at
 * different institutes (the most sought seats that still took the rank), each with the first round that took it and
 * that round's result PDF. History, not a prediction.
 */
export const rankCheck = (rank: number, category: BaseCategory, take = 5) =>
  asTrustedServer(async () => {
    const { cat, E, head, rows } = await rankTable(category);
    const hits = rows.flatMap(({ o, rounds }) => {
      const r = rounds.find((x) => x.closing >= rank);
      return r ? [{ o, ...r }] : [];
    });
    hits.sort((a, b) => a.closing - b.closing || (a.o.id < b.o.id ? -1 : 1));
    const picked: typeof hits = [];
    for (const h of hits) if (picked.length < take && !picked.some((p) => p.o.college === h.o.college)) picked.push(h);
    return {
      rank,
      category,
      year: yearName(DEFAULT_EXAM, head),
      n: hits.length,
      rows: picked.map((h) => {
        const src = cat.sources.find((s) => s.key === h.src);
        return { id: h.o.id, ...nameIn(cat, E, h.o), round: roundIn(E, head, h.round), closing: h.closing, source: src ? { name: src.name, url: src.url } : null };
      }),
    };
  });
export type RankCheck = Awaited<ReturnType<typeof rankCheck>>;

/**
 * Residents for the public pages, counts only (never a name, which only signed-in members see): every resident Seatora
 * shows (not hidden) and the years they cover, and at one institute (`collegeKey`) how many per course and
 * year, the biggest courses first. Null when no resident is loaded.
 */
export async function residentCounts(collegeKey: string | null, take = 5) {
  const [all] = await db.$queryRaw<{ n: number; y0: number | null; y1: number | null }[]>`
    SELECT count(*)::int AS n, min(year) AS y0, max(year) AS y1 FROM "Resident" WHERE NOT hidden`;
  if (!all?.n) return null;
  const at = collegeKey
    ? await db.resident.groupBy({ by: ["specialtyId", "year"], where: { hidden: false, college: { key: collegeKey } }, _count: { _all: true } })
    : [];
  const names = new Map((await db.specialty.findMany({ where: { id: { in: [...new Set(at.map((g) => g.specialtyId))] } }, select: { id: true, degree: true, name: true } })).map((s) => [s.id, `${s.degree} ${s.name}`]));
  const years = [...new Set(at.map((g) => g.year))].sort();
  const courses = [...new Set(at.map((g) => g.specialtyId))]
    .map((id) => ({ course: names.get(id) ?? "", byYear: years.map((y) => at.find((g) => g.specialtyId === id && g.year === y)?._count._all ?? 0) }))
    .sort((a, b) => sum(b.byYear) - sum(a.byYear) || a.course.localeCompare(b.course));
  return { ...all, at: { years, courses: courses.slice(0, take), more: Math.max(0, courses.length - take), total: sum(courses.map((c) => sum(c.byYear))) } };
}
