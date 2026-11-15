import "server-only";
import { db } from "@/lib/db";
import { profileHasCourse, type Profile } from "../../profile";
import { getCatalog, type Catalog, type YearInfo } from "../../server/catalog";
import { clinicalFactsFor } from "../../server/facts";
import { countAllotments, type AllotmentCount } from "../../server/queries";
import { listSeats, seatLists, sumSeats, type SeatRow } from "../../server/seats";
import { baseCategories, openQuotas, roundLabel, type Round, type SeatList, type Source } from "../../types";
import type { CollegeType } from "./college-type";
import type { ValueMeta } from "./hospital-bits";
export type { ValueMeta };

// Institute page data (src/app/decide/institutes/[slug]) that the service does not return: the newest round's seat
// lists at this college, its allotments by quota and seat category, and the bundle schema 2 college fields.

export type RoundSeats = { list: SeatList; rows: SeatRow[] }[];

/**
 * The newest round's seat lists (clear, virtual, newly added: seatLists() order; a kind can have two PDFs), each with its
 * rows at this college, every course. Empty when no list is imported. Each list stays separate: they overlap.
 */
export async function roundSeatsAt(collegeKey: string): Promise<RoundSeats> {
  const all = await seatLists();
  const lists = all.filter((l) => l.year === all[0]?.year && l.round === all[0]?.round);
  return Promise.all(lists.map(async (list) => ({ list, rows: (await listSeats({ list: list.key, college: collegeKey })).rows })));
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
export async function allotmentMixAt(collegeKey: string) {
  const cat = await getCatalog();
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

const infoMemo = new WeakMap<Catalog, Promise<Map<string, HospitalInfo>>>();
/** HospitalInfo of every college by College.key: one read per catalog (a new import is a new catalog). Empty in tests (memory catalog). */
export async function hospitalInfo(): Promise<Map<string, HospitalInfo>> {
  const cat = await getCatalog();
  if (cat.mem) return new Map();
  let m = infoMemo.get(cat);
  if (!m) {
    type Row = { key: string; ids: string[] | null; url: string | null; web: string | null; type: string | null; basis: string | null; beds: number | null; kind: string | null; meta: ValueMeta | null; own: boolean | null };
    m = db
      .$queryRaw<Row[]>`
        SELECT c.key, c."mccIds" AS ids, c."mccProfileUrl" AS url, c.website AS web, c.type, c."typeBasis" AS basis,
          (f.data->'facts'->>'beds_total')::int AS beds, f.data->'facts'->>'beds_kind' AS kind,
          COALESCE(f.data->'values_meta'->'facts.beds_total', f.data->'values_meta'->'facts') AS meta, f.data->'values_meta' ? 'facts.beds_total' AS own
        FROM "College" c LEFT JOIN "ClinicalFacts" f ON f."collegeId" = c.id`
      .then((rows) =>
        new Map(
          rows.map((r) => [
            r.key,
            {
              mccIds: r.ids ?? [],
              mccProfileUrl: r.url,
              website: r.web,
              type: r.type && r.basis ? { value: r.type as CollegeType["value"], basis: r.basis } : null,
              beds: r.beds != null ? { n: r.beds, kind: r.kind, meta: r.meta, own: !!r.own } : null,
            },
          ]),
        ),
      );
    m.catch(() => infoMemo.delete(cat)); // don't keep a failed read
    infoMemo.set(cat, m);
  }
  return m;
}

/**
 * The website as declared on the college's MCC profile, as a link: "www.x.in" gets http:// (browsers upgrade it);
 * null for anything that isn't an http(s) address (another scheme, or not a URL).
 */
export function websiteUrl(w: string | null): string | null {
  if (!w) return null;
  const u = /^[a-z][a-z\d+.-]*:/i.test(w) ? w : `http://${w}`;
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:" ? p.href : null;
  } catch {
    return null;
  }
}

/**
 * A college's clinical facts (server/facts.ts) with its course rows in her profile first (`mine`; only when she ticked
 * courses), each keeping its index `i` (its values_meta key, "courses[i]"). Null when the import has none.
 */
export async function clinicalAt(collegeKey: string, profile: Profile | null) {
  const [facts, cat] = await Promise.all([clinicalFactsFor(collegeKey), getCatalog()]);
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
