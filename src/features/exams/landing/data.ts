// What an exam's landing page (/neet-pg, /neet-ss…) shows from its own data: counts, a few live examples and where its
// counselling stands, read through Decide's catalog and services. Server only: another exam's data reaches staff only.
// Read without a browser session (asTrustedServer): ./gate.ts has checked the caller (public exam, or staff).
import "server-only";
import { asTrustedServer, getCatalog } from "@/features/decide/server/catalog";
import { listNotices, roundStatus, scheduleYear } from "@/features/decide/server/notices";
import { findCutoffs } from "@/features/decide/server/queries";
import { seatLists } from "@/features/decide/server/seats";
import { courseTerms } from "@/features/decide/server/terms";
import { examGroupCourses } from "@/features/decide/service";
import { statCells } from "@/features/decide/lib/stat-format";
import { stepsNow } from "@/features/decide/lib/round-status";
import type { Opt } from "@/features/decide/server/catalog";
import { quotaIn, roundIn, roundNamesOf, tidyLabel } from "../exam";
import { yearName } from "../keys";
import { DEFAULT_EXAM, exams, headYearIn, restrictedQuota, type ExamKey } from "../registry";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const byAllotments = (year: number) => (a: Opt, b: Opt) => (b.byYear[year] ?? 0) - (a.byYear[year] ?? 0) || (a.id < b.id ? -1 : 1);

export const landingData = (exam: ExamKey) => asTrustedServer(() => load(exam));
export type LandingData = Awaited<ReturnType<typeof load>>;

async function load(exam: ExamKey) {
  const [cat, lists, notices, year] = await Promise.all([getCatalog(exam), seatLists(exam), listNotices({}, exam), scheduleYear(exam)]);
  // The exam with its rounds' names and its latest complete year, as active.tsx examInfo has them (not imported: it
  // brings Decide's client components, and their JS, into this public route).
  const E = exam === DEFAULT_EXAM ? exams[exam] : { ...exams[exam], roundNames: roundNamesOf([...cat.sources, ...lists]) };
  const head = headYearIn(exam, cat.sources);
  const years = [...cat.meta.years].reverse();
  const nameOf = (o: Opt) => {
    const course = cat.courseOf.get(`${o.degree}|${o.specialty}`);
    return { college: cat.collegeByKey.get(o.college)!, course: course ? `${course.degree} ${course.name}` : o.degree, courseSlug: course?.slug ?? "", quota: quotaIn(E, o.quota) };
  };
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
    site: exams[exam].site ?? { url: "https://mcc.nic.in/", name: "MCC's website" },
  };
}
