// NEET PG's residents on the public pages (/neet-pg/residents, one page per state, the sitemap and llms.txt): COUNTS
// ONLY, by state, hospital, course and year of admission. No resident's name, rank, quota, round or category is read
// here (the SQL never selects one): names stay behind sign-in (features/decide/server/residents.ts), and residents
// hidden on request (HiddenResident sets Resident.hidden) are left out of every count, as the app leaves them out.
import "server-only";
import { cache } from "react";
import { siteConfig } from "@/config/site";
import { formatRank } from "@/features/cutoffs/lib/format";
import { planLimits } from "@/features/plans/plans";
import { db } from "@/lib/db";
import { DEFAULT_EXAM } from "../keys";

/** One hospital, course and year's count (the SQL's rows). */
type Row = { slug: string; hospital: string; state: string | null; degree: string; course: string; year: number; n: number };
/** One admitted list: its year, MCC's label for it ("up to Round 3") and its PDF (DataSource), with when Seatora added it. */
type List = { year: number; label: string; doc: string | null; url: string | null; added: Date | null };

const n = formatRank;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** "Jammu and Kashmir" → "jammu-and-kashmir". */
export const stateSlug = (state: string) => state.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** /neet-pg/residents, or a state's page. */
export const residentsPath = (state?: string) => `/neet-pg/residents${state ? `/${stateSlug(state)}` : ""}`;

/** The counts from the SQL's rows: every hospital (most residents first), every state, the degrees. Pure (residents.test.ts). */
export function residentsOf(rows: Row[], lists: List[]) {
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a);
  const by = new Map<string, { slug: string; hospital: string; state: string | null; byYear: Map<number, number>; courses: Map<string, number> }>();
  for (const r of rows) {
    const h = by.get(r.slug) ?? by.set(r.slug, { slug: r.slug, hospital: r.hospital, state: r.state, byYear: new Map(), courses: new Map() }).get(r.slug)!;
    h.byYear.set(r.year, (h.byYear.get(r.year) ?? 0) + r.n);
    h.courses.set(r.course, (h.courses.get(r.course) ?? 0) + r.n);
  }
  const hospitals = [...by.values()]
    .map((h) => ({
      slug: h.slug,
      hospital: h.hospital,
      state: h.state,
      /** Per year, as `years` (newest first). */
      byYear: years.map((y) => h.byYear.get(y) ?? 0),
      total: sum([...h.byYear.values()]),
      courses: [...h.courses].map(([course, k]) => ({ course, n: k })).sort((a, b) => b.n - a.n || a.course.localeCompare(b.course)),
    }))
    .sort((a, b) => b.total - a.total || a.hospital.localeCompare(b.hospital));
  const states = [...new Set(hospitals.flatMap((h) => h.state ?? []))]
    .map((state) => {
      const hs = hospitals.filter((h) => h.state === state);
      return { state, slug: stateSlug(state), hospitals: hs.length, residents: sum(hs.map((h) => h.total)) };
    })
    .sort((a, b) => b.residents - a.residents || a.state.localeCompare(b.state));
  const courses = new Set(rows.map((r) => r.course));
  const degrees = [...new Set(rows.map((r) => r.degree))]
    .map((degree) => {
      const xs = rows.filter((r) => r.degree === degree);
      return { degree, courses: new Set(xs.map((r) => r.course)).size, residents: sum(xs.map((r) => r.n)) };
    })
    .sort((a, b) => b.residents - a.residents);
  const added = lists.flatMap((l) => (l.added ? [l.added.getTime()] : []));
  return {
    total: sum(rows.map((r) => r.n)),
    years,
    courses: courses.size,
    degrees,
    hospitals,
    states,
    // Field by field: only what is named here leaves this function.
    lists: lists.map(({ year, label, doc, url, added }) => ({ year, label, doc, url, added })),
    /** When the newest admitted list reached Seatora (the sitemap's lastmod); null without one. */
    updated: added.length ? new Date(Math.max(...added)) : null,
  };
}
export type Residents = ReturnType<typeof residentsOf>;

/**
 * Every count the public pages show, once per render; null when no resident is loaded. A failed read throws (a page
 * keeps its last good render; the sitemap and llms.txt catch it).
 */
export const residentsData = cache(async (): Promise<Residents | null> => {
  const [rows, lists] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT c.slug, c.name AS hospital, c.state, s.degree, s.degree || ' ' || s.name AS course, r.year, count(*)::int AS n
      FROM "Resident" r JOIN "College" c ON c.id = r."collegeId" JOIN "Specialty" s ON s.id = r."specialtyId"
      WHERE NOT r.hidden
      GROUP BY c.id, s.id, r.year`,
    db.$queryRaw<List[]>`
      SELECT l.year, l.list AS label, d.name AS doc, d.url, d."createdAt" AS added
      FROM (SELECT DISTINCT year, list, "sourceKey" FROM "Resident" WHERE NOT hidden) l
      LEFT JOIN "DataSource" d ON d.exam = ${DEFAULT_EXAM} AND d.key = l."sourceKey"
      ORDER BY l.year DESC, l.list`,
  ]);
  return rows.length ? residentsOf(rows, lists) : null;
});

/** "2023–2025". */
export const yearsOf = (r: Pick<Residents, "years">) => (r.years.length > 1 ? `${r.years.at(-1)}–${r.years[0]}` : String(r.years[0]));
/** "2025 up to Round 3, 2024 final list (26 Mar 2025) and 2023 up to Round 3": each year's list as MCC labels it. */
export const listsLine = (r: Pick<Residents, "lists">) => {
  const xs = r.lists.map((l) => `${l.year} ${l.label}`);
  return xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : (xs[0] ?? "");
};

/**
 * A residents page's words: `title` (≤ 50 characters: the layout adds " · Seatora"), `h1`, `description` (≤ 155) and
 * `intro` (also the Dataset's description), for a state's page too (`state`), every figure from the data.
 */
export function residentsWords(r: Residents, state?: Residents["states"][number]) {
  const years = yearsOf(r);
  const [y0, y1] = [r.years.at(-1), r.years[0]];
  const lists = `MCC's official admitted candidates lists: ${listsLine(r)}`;
  if (!state) {
    return {
      title: `NEET PG Residents List by College (${years})`,
      h1: `NEET PG Residents List by College (${years})`,
      description: `${n(r.total)} NEET PG residents at ${n(r.hospitals.length)} hospitals by state, college, course and year (${years}), from MCC's admitted lists. Names after sign-up.`,
      intro: [
        `Who is doing their MD, MS or DNB at each hospital: ${n(r.total)} residents admitted through MCC's NEET PG counselling from ${y0} to ${y1}, at ${n(r.hospitals.length)} hospitals in ${r.states.length} states and union territories, in ${r.courses} courses.`,
        `Counted from ${lists}. This page shows counts only, by state, hospital, course and year; each resident's name, course, year and All India Rank are for signed-in members.`,
      ],
    };
  }
  const long = `${state.state} NEET PG Residents by College`;
  return {
    title: long.length <= 50 ? long : `NEET PG Residents in ${state.state}`,
    h1: `NEET PG Residents in ${state.state} Colleges (${years})`,
    description: `${n(state.residents)} NEET PG residents at ${n(state.hospitals)} ${state.state} hospitals by college, course and year (${years}), from MCC's admitted lists.`,
    intro: [
      `${n(state.residents)} residents admitted through MCC's NEET PG counselling from ${y0} to ${y1} at ${n(state.hospitals)} hospitals in ${state.state}, with each hospital's courses.`,
      `Counted from ${lists}. Counts only; the names are for signed-in members. State quota seats, filled in ${state.state}'s own counselling, are not in MCC's lists, so these are not all the residents.`,
    ],
  };
}

/** The residents page's questions (llms-full.txt's too), in plain words. */
export function residentsFaqs(r: Residents) {
  const mail = siteConfig.contactEmail;
  const free = planLimits("FREE").residents;
  return [
    {
      q: "Where do the names come from?",
      a: `From MCC's official admitted candidates lists, one per counselling year: ${listsLine(r)}. Each list prints the name, college and course of every candidate admitted through MCC's counselling. Seatora adds the All India Rank from that year's NBEMS NEET PG result where it is known. It holds no contact details.`,
    },
    {
      q: "Are these lists official?",
      a: "Yes. MCC (the Medical Counselling Committee) publishes the admitted candidates lists on its PG counselling site, and every count here is taken from them, less any names hidden on request. Seatora itself is independent: not affiliated with MCC, NBEMS or NMC.",
    },
    {
      q: "Can a resident hide their name?",
      a: `Yes. If your name is listed and you want it hidden, ${mail ? `email us at ${mail}` : "write to us from the Contact page"} with your name and college. We will hide it from the site for every year and course at that college and keep it hidden when the lists are refreshed.`,
    },
    {
      q: "Which years and courses are covered?",
      a: `Residents admitted from ${r.years.at(-1)} to ${r.years[0]}: ${listsLine(r)}. ${r.courses} courses: ${r.degrees.map((d) => `${d.degree} (${d.courses})`).join(", ")}.`,
    },
    {
      q: "Is state quota included?",
      a: "No. MCC's admitted lists cover only the seats filled through MCC's counselling: the All India Quota, deemed and central universities, DNB and MCC's other quotas. State quota seats are filled in each state's own counselling and are not in them, so a hospital's count here is not all its residents.",
    },
    {
      q: "How do I see the names?",
      a: `Create a free account: signed-in members see each resident's name, course, year and, where NBEMS has published it, All India Rank${Number.isFinite(free) ? ` (a free account: ${free} residents searches a day)` : ""}. This page and the state pages show counts only.`,
    },
  ];
}

/** The page's Dataset (schema.org): counts only, created by Seatora from MCC's admitted lists. */
export function residentsLd(r: Residents, w: ReturnType<typeof residentsWords>, path: string, state?: string) {
  return {
    "@type": "Dataset",
    name: w.h1,
    description: w.intro.join(" "),
    url: `${siteConfig.url}${path}`,
    temporalCoverage: r.years.length > 1 ? `${r.years.at(-1)}/${r.years[0]}` : String(r.years[0]),
    spatialCoverage: state ? { "@type": "State", name: state, containedInPlace: { "@type": "Country", name: "India" } } : { "@type": "Country", name: "India" },
    inLanguage: "en-IN",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    isBasedOn: r.lists.map((l) => ({
      "@type": "DigitalDocument",
      name: `${l.doc ?? `MCC admitted candidates list (${l.label})`}, ${l.year}`,
      ...(l.url && { url: l.url }),
      temporalCoverage: String(l.year),
      publisher: { "@type": "GovernmentOrganization", name: "Medical Counselling Committee (MCC)", url: "https://mcc.nic.in/" },
    })),
    variableMeasured: ["Residents admitted through MCC's NEET PG counselling, by hospital", "Residents by course", "Residents by year of admission", "Residents by state"],
    keywords: ["NEET PG residents list", "PG residents by college", "MCC admitted candidates list", ...(state ? [`${state} PG residents`] : [])],
  };
}
