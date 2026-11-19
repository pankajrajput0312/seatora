import "server-only";
import { DEFAULT_EXAM, type ExamKey } from "@/features/exams/keys";
import { exams } from "@/features/exams/registry";
import { db } from "@/lib/db";
import { websiteUrl } from "../../lib/stat-format";
import { anyTermFilter, termVerdict, typeFails, type TermFilters, type TermVerdict } from "../../lib/term-filters";
import { profileHasCourse, type Profile } from "../../profile";
import { dataVersion, getCatalog, type Catalog, type YearInfo } from "../../server/catalog";
import { infoRows, snapshotAt } from "../../server/snapshot";
import { clinicalFactsFor } from "../../server/facts";
import { countAllotments, type AllotmentCount } from "../../server/queries";
import { listSeats, seatLists, sumSeats, type SeatRow } from "../../server/seats";
import { courseTerms } from "../../server/terms";
import { baseCategories, openQuotas, roundLabel, type Round, type SeatList, type Source } from "../../types";
import type { CollegeType } from "./college-type";
import type { ValueMeta } from "./hospital-bits";
export type { ValueMeta };

// Institute page data (src/app/decide/institutes/[slug]) that the service does not return: the newest round's seat
// lists at this college, its allotments by quota and seat category, and the bundle schema 2 college fields. One exam's
// (default NEET PG).

export type RoundSeats = { list: SeatList; rows: SeatRow[] }[];

/**
 * The newest round's seat lists (clear, virtual, newly added: seatLists() order; a kind can have two PDFs), each with its
 * rows at this college, every course. Empty when no list is imported. Each list stays separate: they overlap.
 */
export async function roundSeatsAt(collegeKey: string, exam: ExamKey = DEFAULT_EXAM): Promise<RoundSeats> {
  const all = await seatLists(exam);
  const lists = all.filter((l) => l.year === all[0]?.year && l.round === all[0]?.round);
  return Promise.all(lists.map(async (list) => ({ list, rows: (await listSeats({ list: list.key, college: collegeKey }, undefined, exam)).rows })));
}

/** The college header's lists: the newest PDF of the clear and of the virtual vacancy list, of `round` (seatLists() order). */
export const headerLists = (round: SeatList[]) =>
  (["clear", "virtual"] as const).flatMap((kind) => round.filter((l) => l.kind === kind).slice(0, 1));

/** The header's numbers without the rows (tabs other than Courses and Seats): Σ seats here in each headerLists list. */
export async function roundSeatTotals(collegeKey: string, exam: ExamKey = DEFAULT_EXAM): Promise<{ list: SeatList; n: number }[]> {
  const all = await seatLists(exam);
  const lists = headerLists(all.filter((l) => l.year === all[0]?.year && l.round === all[0]?.round));
  if (!lists.length) return [];
  const sums = await db.$queryRaw<{ key: string; n: number }[]>`
    SELECT d.key, SUM(x.seats)::int AS n
    FROM "SeatCount" x JOIN "DataSource" d ON d.id = x."seatSourceId" JOIN "College" c ON c.id = x."collegeId"
    WHERE d.exam = ${exam} AND d.key = ANY(${lists.map((l) => l.key)}) AND c.key = ${collegeKey}
    GROUP BY 1`;
  return lists.map((list) => ({ list, n: sums.find((s) => s.key === list.key)?.n ?? 0 }));
}

/** One option's seats in ONE list's rows: its course and quota, in `categories` (all when omitted); null when the list prints none. */
export const optionSeats = (rows: SeatRow[], o: { degree: string; specialty: string; quota: string }, categories?: string[]) =>
  sumSeats(rows.filter((r) => r.degree === o.degree && r.specialty === o.specialty), { quota: o.quota, categories });

const categoryOrder: string[] = [...baseCategories, ...baseCategories.map((c) => `${c} PwD`)];
const pos = (xs: string[], x: string) => (xs.includes(x) ? xs.indexOf(x) : xs.length);

export type MixColumn = { label: string; year: number; round?: Round; provisional: boolean };
export type AllotmentMix = { columns: MixColumn[]; groups: { quota: string; rows: { category: string; values: (number | null)[] }[] }[] };

/**
 * Allotments per quota × seat category: the newest result round, then each year (all its rounds; the newest year only
 * when it has more than that round). Open quotas first, then the rest by name; null = none in that column. Null when
 * there are no allotments.
 */
export function allotmentMix(rows: AllotmentCount[], years: YearInfo[], sources: Source[]): AllotmentMix | null {
  const [newest] = years;
  if (!newest?.rounds.length || !rows.length) return null;
  const round = newest.rounds.at(-1)!;
  const columns: MixColumn[] = [
    { label: `${newest.year} ${roundLabel[round]}`, year: newest.year, round, provisional: sources.some((s) => s.year === newest.year && s.round === round && s.provisional) },
    ...years
      .filter((y) => y.year !== newest.year || y.rounds.length > 1)
      .map((y) => ({ label: y.year === newest.year ? `${y.year} (${y.rounds.map((r) => roundLabel[r]).join(", ")})` : String(y.year), year: y.year, provisional: y.provisional })),
  ];
  const quotas = [...new Set(rows.map((r) => r.quota))].sort((a, b) => pos(openQuotas, a) - pos(openQuotas, b) || a.localeCompare(b));
  const cats = [...new Set(rows.map((r) => r.category as string))].sort((a, b) => pos(categoryOrder, a) - pos(categoryOrder, b) || a.localeCompare(b));
  const cell = (c: MixColumn, quota: string, category: string) => {
    const xs = rows.filter((r) => r.quota === quota && r.category === category && r.year === c.year && (!c.round || r.round === c.round));
    return xs.length ? xs.reduce((a, r) => a + r.n, 0) : null;
  };
  return {
    columns,
    groups: quotas.map((quota) => ({
      quota,
      rows: cats.filter((category) => rows.some((r) => r.quota === quota && r.category === category)).map((category) => ({ category, values: columns.map((c) => cell(c, quota, category)) })),
    })),
  };
}

/** allotmentMix of every course at this college, from the Allotment table. */
export async function allotmentMixAt(collegeKey: string, exam: ExamKey = DEFAULT_EXAM) {
  const cat = await getCatalog(exam);
  const cs = [...cat.pairs.values()].filter((p) => p.college === collegeKey).map((p) => p.cs);
  return allotmentMix(await countAllotments(cat, cs), cat.meta.years, cat.sources);
}

/**
 * The bed count the hospital reports (ClinicalFacts), with that value's provenance (its own entry, else the block's;
 * `own`: its own, so its flags are the count's: "rounded" = the source prints "270+").
 */
export type ReportedBeds = { n: number; kind: string | null; meta: ValueMeta | null; own: boolean };
/** College's schema 2 fields: every MCC id, its MCC profile, the website that profile declares, the inferred type, reported beds. */
export type HospitalInfo = { mccIds: string[]; mccProfileUrl: string | null; website: string | null; type: CollegeType | null; beds: ReportedBeds | null };

/**
 * A type its adapter only guessed ("default: no government word in the name"): another exam's own college (no NEET PG
 * row) shows "type not known" rather than Private. A college NEET PG has keeps NEET PG's record, as NEET PG shows it.
 */
export const unsureType = (basis: string) => /\bdefault\b/i.test(basis);

const infoMemo = new WeakMap<Catalog, Promise<Map<string, HospitalInfo>>>();
/** HospitalInfo of every college by College.key: one read per catalog (a new import is a new catalog). Empty in tests (memory catalog). */
export async function hospitalInfo(exam: ExamKey = DEFAULT_EXAM): Promise<Map<string, HospitalInfo>> {
  const cat = await getCatalog(exam);
  if (cat.mem) return new Map();
  let m = infoMemo.get(cat);
  if (!m) {
    // NEET PG: the build's snapshot while no import has committed since, else Postgres (server/snapshot.ts).
    m = dataVersion(exam)
      .then(async (v) => (exam === DEFAULT_EXAM ? (await snapshotAt(v))?.info : null) ?? (await infoRows(db, exam)))
      .then((rows) =>
        new Map(
          rows.map((r) => [
            r.key,
            {
              mccIds: r.ids ?? [],
              mccProfileUrl: r.url,
              website: r.web,
              type: r.type && r.basis && (r.pg !== false || !unsureType(r.basis)) ? { value: r.type as CollegeType["value"], basis: r.basis } : null,
              beds: r.beds != null && exams[exam].has.beds ? { n: r.beds, kind: r.kind, meta: r.meta, own: !!r.own } : null,
            },
          ]),
        ),
      );
    m.catch(() => infoMemo.delete(cat)); // don't keep a failed read
    infoMemo.set(cat, m);
  }
  return m;
}

/** The website as declared on the college's MCC profile, as a link (lib/stat-format.ts). */
export { websiteUrl };

/**
 * A college's clinical facts (server/facts.ts) with its course rows in her profile first (`mine`; only when she ticked
 * courses), each keeping its index `i` (its values_meta key, "courses[i]"). Null when the import has none.
 */
export async function clinicalAt(collegeKey: string, profile: Profile | null, exam: ExamKey = DEFAULT_EXAM) {
  const [facts, cat] = await Promise.all([clinicalFactsFor(collegeKey, exam), getCatalog(exam)]);
  if (!facts) return null;
  const ticked = !!profile && (profile.specialties.length > 0 || profile.degrees.length > 0 || !!profile.pairs?.length);
  // The row names a course as "DNB Anaesthesiology": degree and name.
  const byName = new Map([...cat.courseOf.values()].map((c) => [`${c.degree} ${c.name}`.toLowerCase(), c]));
  const courses = (facts.courses ?? []).map((c, i) => {
    const known = byName.get(c.course.toLowerCase());
    return { ...c, i, mine: !!profile && ticked && !!known && profileHasCourse(profile, known) };
  });
  return { ...facts, courses: courses.sort((a, b) => Number(b.mine) - Number(a.mine)) };
}
export type ClinicalAt = NonNullable<Awaited<ReturnType<typeof clinicalAt>>>;

const rank: Record<TermVerdict, number> = { pass: 2, unknown: 1, fail: 0 };
/**
 * Institutes by the term filters (lib/term-filters.ts): an institute passes when one of its options (course × quota;
 * with `course`, that course's only) passes. `unknown`: institutes left out only because a filtered value is not
 * declared (what "Include not declared", nd=keep, would add; none when it is ticked). Null when no filter is set.
 */
export async function institutesByTerms(tf: TermFilters, course?: string | string[], exam: ExamKey = DEFAULT_EXAM): Promise<{ pass: Set<string>; unknown: Set<string> } | null> {
  if (!anyTermFilter(tf)) return null;
  const [cat, info] = await Promise.all([getCatalog(exam), hospitalInfo(exam)]);
  const best = new Map<string, TermVerdict>();
  for (const o of cat.options) {
    if (best.get(o.college) === "pass" || (course?.length && ![course].flat().includes(cat.courseOf.get(`${o.degree}|${o.specialty}`)?.slug ?? ""))) continue;
    const v = termVerdict(courseTerms(cat, o.college, o.degree, o.specialty, o.quota), info.get(o.college)?.type?.value, tf);
    const was = best.get(o.college);
    if (!was || rank[v] > rank[was]) best.set(o.college, v);
  }
  // No option (no past allotments): only its type can be checked; a cap has nothing to read (unknown), "No bond" fails.
  const capped = [tf.minStipend, tf.maxFee, tf.maxBondYears, tf.maxBondInr, tf.maxLeavingInr].some((v) => v != null);
  for (const c of cat.colleges) {
    if (best.has(c.key)) continue;
    const t = info.get(c.key)?.type?.value;
    best.set(c.key, typeFails(t, tf) || tf.maxBondYears === 0 ? "fail" : capped ? "unknown" : "pass");
  }
  const keys = (v: TermVerdict) => new Set([...best].filter(([, x]) => x === v).map(([k]) => k));
  const pass = keys("pass");
  const unknown = keys("unknown");
  if (tf.keepUnknown) for (const k of unknown) pass.add(k);
  return { pass, unknown: tf.keepUnknown ? new Set() : unknown };
}
