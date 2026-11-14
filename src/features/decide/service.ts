import "server-only";
import { decideDemoData } from "./data/decide.demo";
import { bondYears } from "./lib/format";
import { classifyReach, deepestByYear, eligibleCategories, reachOrder, type Deepest, type Reach } from "./lib/reach";
import type { Profile } from "./profile";
import { optionId, rounds, type Allotment, type College, type Course, type Cutoff, type DecideData, type Round, type Term } from "./types";

// ponytail: reads the bundled demo dataset. To go live, replace getDecideData() (and the in-memory filters below
// where they get slow) with Prisma queries over the models from prisma/import-mcc.ts. Components don't change.
export async function getDecideData(): Promise<DecideData> {
  return decideDemoData;
}

export const LATEST_YEAR = 2026;
export const PAST_YEARS: [number, number] = [2024, 2025];
export const YEARS = [2024, 2025, 2026];

export type OptionRow = {
  id: string;
  college: Pick<College, "key" | "slug" | "name" | "state" | "type">;
  course: Course;
  quota: string;
  reach: Reach;
  latest: Deepest | null; // 2026 R1 (provisional)
  byYear: Record<number, Deepest | null>;
  /** year → round → deepest closing among eligible categories, with allotments made */
  grid: Record<number, Partial<Record<Round, { closing: number; n: number; category: string }>>>;
  feeInr: number | null;
  feeText: string | null;
  stipendText: string | null;
  bondText: string | null;
  bondYears: number | null;
  penaltyText: string | null;
};

export type OptionFilters = { search?: string; reach?: Reach[]; includeProvisional?: boolean; showClosed?: boolean };

function termsFor(terms: Term[], college: string, degree: string) {
  const program = degree === "MD" ? "MD" : "DNB";
  const get = (kind: Term["kind"]) => terms.find((t) => t.college === college && t.program === program && t.kind === kind);
  return { fee: get("FEE"), stipend: get("STIPEND"), bond: get("BOND"), penalty: get("PENALTY") };
}

function buildRow(d: DecideData, key: string, list: Cutoff[], profile: Profile | null, includeProvisional: boolean): OptionRow {
  const [c0] = list;
  const college = d.colleges.find((c) => c.key === c0.college)!;
  const course = d.courses.find((c) => c.degree === c0.degree && c.specialty === c0.specialty)!;
  const eligible = profile ? new Set<string>(eligibleCategories(profile.category, profile.pwd)) : null;
  const mine = eligible ? list.filter((c) => eligible.has(c.category)) : list;
  const provisional = new Set(d.sources.filter((s) => s.provisional).map((s) => s.key));
  const deepest = deepestByYear(mine, provisional);
  const grid: OptionRow["grid"] = {};
  for (const c of mine) {
    const cell = ((grid[c.year] ??= {})[c.round] ??= { closing: 0, n: 0, category: c.category });
    cell.n += c.n;
    if (c.closing > cell.closing) Object.assign(cell, { closing: c.closing, category: c.category });
  }
  const t = termsFor(d.terms, college.key, course.degree);
  return {
    id: key,
    college: { key: college.key, slug: college.slug, name: college.name, state: college.state, type: college.type },
    course,
    quota: c0.quota,
    reach: profile ? classifyReach(profile.rank, mine, { latestYear: LATEST_YEAR, pastYears: PAST_YEARS, includeLatest: includeProvisional }) : "no-data",
    latest: mine.find((c) => c.year === LATEST_YEAR && c.round === "R1") ? deepest.get(LATEST_YEAR) ?? null : null,
    byYear: Object.fromEntries(YEARS.map((y) => [y, deepest.get(y) ?? null])),
    grid,
    feeInr: t.fee?.amountInr ?? null,
    feeText: t.fee?.text ?? null,
    stipendText: t.stipend?.text ?? null,
    bondText: t.bond?.text ?? null,
    bondYears: bondYears(t.bond?.text),
    penaltyText: t.penalty?.text ?? null,
  };
}

function groupOptions(d: DecideData) {
  const groups = new Map<string, Cutoff[]>();
  for (const c of d.cutoffs) {
    const k = optionId(c);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  return groups;
}

function matchesProfile(row: OptionRow, p: Profile | null) {
  if (!p) return true;
  return (
    (!p.specialties.length || p.specialties.includes(row.course.specialty)) &&
    (!p.degrees.length || p.degrees.includes(row.course.degree)) &&
    (!p.quotas.length || p.quotas.includes(row.quota)) &&
    (!p.states.length || (row.college.state != null && p.states.includes(row.college.state))) &&
    (p.maxFeeLakh == null || row.feeInr == null || row.feeInr <= p.maxFeeLakh * 100000) &&
    (p.maxBondYears == null || row.bondYears == null || row.bondYears <= p.maxBondYears)
  );
}

export async function listOptions(profile: Profile | null, f: OptionFilters = {}) {
  const d = await getDecideData();
  const includeProvisional = f.includeProvisional ?? true;
  const q = f.search?.trim().toLowerCase();
  const all = [...groupOptions(d)]
    .map(([k, list]) => buildRow(d, k, list, profile, includeProvisional))
    .filter((r) => matchesProfile(r, profile))
    .filter((r) => !q || `${r.college.name} ${r.college.state} ${r.course.name} ${r.course.degree}`.toLowerCase().includes(q))
    .filter((r) => !f.reach?.length || f.reach.includes(r.reach))
    .sort((a, b) => reachOrder.indexOf(a.reach) - reachOrder.indexOf(b.reach) || (b.byYear[2025]?.closing ?? 0) - (a.byYear[2025]?.closing ?? 0));
  const closed = all.filter((r) => r.reach === "closed-before");
  const rows = f.showClosed || f.reach?.includes("closed-before") ? all : all.filter((r) => r.reach !== "closed-before");
  return { rows, hiddenClosed: rows === all ? 0 : closed.length };
}

export async function reachCounts(profile: Profile) {
  const { rows } = await listOptions(profile, { showClosed: true });
  return Object.fromEntries(reachOrder.map((r) => [r, rows.filter((x) => x.reach === r).length])) as Record<Reach, number>;
}

export async function getOptionsByIds(ids: string[], profile: Profile | null) {
  const d = await getDecideData();
  const groups = groupOptions(d);
  return ids.flatMap((id) => (groups.has(id) ? [buildRow(d, id, groups.get(id)!, profile, true)] : []));
}

export async function getInstitute(slug: string, profile: Profile | null) {
  const d = await getDecideData();
  const college = d.colleges.find((c) => c.slug === slug);
  if (!college) return null;
  const groups = groupOptions(d);
  const options = [...groups].filter(([, l]) => l[0].college === college.key).map(([k, l]) => buildRow(d, k, l, profile, true));
  const allotmentsByYear = YEARS.map((year) => ({
    year,
    n: d.cutoffs.filter((c) => c.college === college.key && c.year === year).reduce((s, c) => s + c.n, 0),
  }));
  const terms = { md: termsFor(d.terms, college.key, "MD"), dnb: termsFor(d.terms, college.key, "DNB") };
  return { college, options, allotmentsByYear, terms, isDemo: d.isDemo };
}

export async function rankScan(rank: number, year: number, window = 500) {
  const d = await getDecideData();
  const name = (k: string) => d.colleges.find((c) => c.key === k);
  const rows = d.allotments
    .filter((a) => a.year === year && Math.abs(a.rank - rank) <= window)
    .sort((a, b) => rounds.indexOf(a.round) - rounds.indexOf(b.round) || a.rank - b.rank)
    .map((a: Allotment) => ({ ...a, collegeName: name(a.college)?.name ?? a.college, collegeSlug: name(a.college)?.slug ?? "" }));
  return rounds.map((round) => ({ round, rows: rows.filter((r) => r.round === round) })).filter((g) => g.rows.length);
}

export async function lastRanks(f: { degree?: string; specialty: string; category?: string; quota?: string }) {
  const d = await getDecideData();
  const groups = [...groupOptions(d)].filter(([, l]) => l[0].specialty === f.specialty && (!f.degree || l[0].degree === f.degree) && (!f.quota || l[0].quota === f.quota));
  return groups.map(([k, list]) => {
    const scoped = f.category ? list.filter((c) => c.category === f.category) : list;
    const row = buildRow(d, k, scoped.length ? scoped : list, null, true);
    return scoped.length ? row : { ...row, grid: {} };
  });
}

export async function allotmentTrends(f: { specialty?: string; degree?: string }) {
  const d = await getDecideData();
  const groups = [...groupOptions(d)].filter(([, l]) => (!f.specialty || l[0].specialty === f.specialty) && (!f.degree || l[0].degree === f.degree));
  return groups.map(([k, list]) => {
    const row = buildRow(d, k, list, null, true);
    const byYear = Object.fromEntries(YEARS.map((y) => [y, list.filter((c) => c.year === y).reduce((s, c) => s + c.n, 0)])) as Record<number, number>;
    return { id: k, college: row.college, course: row.course, quota: row.quota, byYear };
  });
}

export async function getMeta() {
  const d = await getDecideData();
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
  return {
    isDemo: d.isDemo,
    courses: d.courses,
    specialties: uniq(d.courses.map((c) => c.specialty)).map((s) => ({ code: s, name: d.courses.find((c) => c.specialty === s)!.name })),
    degrees: uniq(d.courses.map((c) => c.degree)),
    quotas: uniq(d.cutoffs.map((c) => c.quota)),
    states: uniq(d.colleges.map((c) => c.state)),
    sources: d.sources,
  };
}

export async function getNotices() {
  const d = await getDecideData();
  return [...d.notices].sort((a, b) => b.date.localeCompare(a.date));
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Everything the overview dashboard draws, from the same rows Options uses so the numbers always agree. */
export async function dashboard(profile: Profile) {
  const { rows } = await listOptions(profile, { showClosed: true });
  const counts = Object.fromEntries(reachOrder.map((r) => [r, rows.filter((x) => x.reach === r).length])) as Record<Reach, number>;
  const courses = [...new Map(rows.map((r) => [r.course.slug, r.course])).values()];
  const strip = courses.map((course) => ({
    course,
    points: rows
      .filter((r) => r.course.slug === course.slug && r.byYear[2025])
      .map((r) => ({ id: r.id, name: r.college.name, slug: r.college.slug, quota: r.quota, closing: r.byYear[2025]!.closing, round: r.byYear[2025]!.round, category: r.byYear[2025]!.category, reached: r.byYear[2025]!.closing >= profile.rank })),
  }));
  const trendRounds: Round[] = ["R1", "R2", "R3", "stray"];
  const trend = courses.map((course) => ({
    course,
    points: trendRounds.map((round) => {
      const vals = rows.filter((r) => r.course.slug === course.slug).flatMap((r) => (r.grid[2025]?.[round] ? [r.grid[2025]![round]!.closing] : []));
      return { round, median: median(vals), n: vals.length };
    }),
  }));
  return { total: rows.length, counts, strip, trend };
}
