import "server-only";
import { cache as perRequest } from "react";
import { requireDecideAccess } from "@/features/auth/lib/session";
import { db } from "@/lib/db";
import { optionId, roundLabel, rounds, type Allotment, type College, type Course, type Cutoff, type DecideData, type Round, type Source, type Term } from "../types";

/** A course at a college (CollegeSpecialty). `cs` is its id: the DB id, or "college~degree~specialty" in memory (tests). */
export type Pair = { cs: string; college: string; degree: string; specialty: string };
/** A choosable option (course at a college under one quota) with allotments made (Σ cutoff n) per year. */
export type Opt = Pair & { id: string; quota: string; byYear: Record<number, number> };

/**
 * Everything small enough to keep in memory: colleges, courses, sources, terms and the option list. Cutoffs and
 * allotments (133k / 210k rows) are queried per request in ./queries.ts.
 */
export type Catalog = {
  /** Tests only: the whole fixture in memory, filtered in JS instead of SQL. Null at runtime (Postgres). */
  mem: { cutoffs: Cutoff[]; allotments: Allotment[] } | null;
  colleges: College[];
  courses: Course[];
  sources: Source[];
  options: Opt[];
  terms: Term[];
  collegeByKey: Map<string, College>;
  collegeBySlug: Map<string, College>;
  courseOf: Map<string, Course>; // "degree|specialty"
  termOf: Map<string, Term>; // "college|program|kind"
  optionById: Map<string, Opt>;
  pairs: Map<string, Pair>; // cs → pair
  sourceById: Map<string, Source>; // DB id (in memory: key) → source
  meta: {
    courses: Course[];
    specialties: { code: string; name: string }[];
    degrees: string[];
    quotas: string[];
    states: string[];
    sources: Source[];
    /** Counselling years with result PDFs, newest first; label e.g. "2026 (R1, provisional)" or "2025". */
    years: YearInfo[];
  };
};
export type YearInfo = { year: number; rounds: Round[]; provisional: boolean; label: string };

/** Years and rounds come from the result PDFs, so labels say "provisional" only while a source is. */
export function yearsOf(sources: Source[]): YearInfo[] {
  const ys = [...new Set(sources.map((s) => s.year))].sort((a, b) => b - a);
  return ys.map((year, i) => {
    const mine = sources.filter((s) => s.year === year);
    const rs = rounds.filter((r) => mine.some((s) => s.round === r));
    const provisional = mine.some((s) => s.provisional);
    const label = i === 0 ? `${year} (${rs.map((r) => roundLabel[r]).join(", ")}${provisional ? ", provisional" : ""})` : provisional ? `${year} (provisional)` : String(year);
    return { year, rounds: rs, provisional, label };
  });
}

const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

export function indexCatalog(p: {
  mem?: Catalog["mem"];
  colleges: College[];
  courses: Course[];
  sources: [id: string, source: Source][];
  pairs: Pair[];
  options: { cs: string; quota: string; year: number; n: number }[];
  terms: Term[];
}): Catalog {
  const pairs = new Map(p.pairs.map((x) => [x.cs, x]));
  const optionById = new Map<string, Opt>();
  for (const o of p.options) {
    const pair = pairs.get(o.cs);
    if (!pair) continue;
    const id = optionId({ ...pair, quota: o.quota });
    const opt = optionById.get(id) ?? optionById.set(id, { ...pair, id, quota: o.quota, byYear: {} }).get(id)!;
    opt.byYear[o.year] = (opt.byYear[o.year] ?? 0) + o.n;
  }
  const options = [...optionById.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  // Only courses that have data: a Specialty row left by an older import (no cutoffs any more) is not a filter choice.
  const used = new Set(options.map((o) => `${o.degree}|${o.specialty}`));
  const courses = p.courses.filter((c) => used.has(`${c.degree}|${c.specialty}`)).sort((a, b) => a.degree.localeCompare(b.degree) || a.name.localeCompare(b.name));
  const sources = p.sources.map(([, s]) => s);
  const specialtyCodes = uniq(courses.map((c) => c.specialty));
  return {
    mem: p.mem ?? null,
    colleges: p.colleges,
    courses,
    sources,
    options,
    terms: p.terms,
    collegeByKey: new Map(p.colleges.map((c) => [c.key, c])),
    collegeBySlug: new Map(p.colleges.map((c) => [c.slug, c])),
    courseOf: new Map(courses.map((c) => [`${c.degree}|${c.specialty}`, c])),
    termOf: new Map(p.terms.map((t) => [`${t.college}|${t.program}|${t.kind}`, t])),
    optionById,
    pairs,
    sourceById: new Map(p.sources),
    meta: {
      courses,
      specialties: specialtyCodes.map((code) => ({ code, name: courses.find((c) => c.specialty === code)!.name })),
      degrees: uniq(courses.map((c) => c.degree)),
      quotas: uniq(options.map((o) => o.quota)),
      states: uniq(p.colleges.map((c) => c.state)),
      sources,
      years: yearsOf(sources),
    },
  };
}

/** In-memory catalog over a whole dataset (the unit-test fixture). */
export function memoryCatalog(d: DecideData): Catalog {
  const cs = (c: { college: string; degree: string; specialty: string }) => `${c.college}~${c.degree}~${c.specialty}`;
  const pairs = new Map(d.cutoffs.map((c) => [cs(c), { cs: cs(c), college: c.college, degree: c.degree, specialty: c.specialty }]));
  return indexCatalog({
    mem: { cutoffs: d.cutoffs, allotments: d.allotments },
    colleges: d.colleges,
    courses: d.courses,
    sources: d.sources.map((s) => [s.key, s]),
    pairs: [...pairs.values()],
    options: d.cutoffs.map((c) => ({ cs: cs(c), quota: c.quota, year: c.year, n: c.n })),
    terms: d.terms,
  });
}

async function loadCatalog(): Promise<Catalog> {
  const [sources, colleges, specialties, pairs, terms, options] = await Promise.all([
    db.dataSource.findMany({ select: { id: true, key: true, name: true, url: true, counsellingYear: true, round: true, provisional: true } }),
    db.college.findMany({ select: { id: true, key: true, slug: true, name: true, state: true, pincode: true, address: true }, orderBy: { name: "asc" } }),
    db.specialty.findMany({ select: { id: true, slug: true, name: true, degree: true, code: true } }),
    db.collegeSpecialty.findMany({ select: { id: true, collegeId: true, specialtyId: true } }),
    db.collegeTerm.findMany({ select: { collegeId: true, program: true, kind: true, text: true, amountInr: true, source: { select: { name: true, url: true, type: true } } } }),
    db.$queryRaw<{ cs: string; quota: string; year: number; n: number }[]>`
      SELECT "collegeSpecialtyId" AS cs, quota, "counsellingYear" AS year, SUM(n)::int AS n FROM "Cutoff" GROUP BY 1, 2, 3`,
  ]);
  const collegeKey = new Map(colleges.map((c) => [c.id, c.key]));
  const spec = new Map(specialties.map((s) => [s.id, s]));
  return indexCatalog({
    // Type, beds, year established and website are not in the MCC data; never guessed.
    colleges: colleges.map((c) => ({ key: c.key, slug: c.slug, name: c.name, state: c.state, pincode: c.pincode, address: c.address, type: null, beds: null, established: null, website: null })),
    courses: specialties.map((s) => ({ degree: s.degree, specialty: s.code ?? "", name: s.name, slug: s.slug })),
    // Allotment-result PDFs only; term documents have no year or round and travel with their term.
    sources: sources.flatMap((s): [string, Source][] =>
      s.counsellingYear != null && s.round ? [[s.id, { key: s.key, url: s.url, year: s.counsellingYear, round: s.round as Round, provisional: s.provisional, name: s.name }]] : [],
    ),
    pairs: pairs.map((p) => ({ cs: p.id, college: collegeKey.get(p.collegeId)!, degree: spec.get(p.specialtyId)!.degree, specialty: spec.get(p.specialtyId)!.code ?? "" })),
    options,
    terms: terms.map((t) => ({
      college: collegeKey.get(t.collegeId)!,
      program: t.program as Term["program"],
      kind: t.kind,
      text: t.text,
      amountInr: t.amountInr,
      source: { name: t.source.name, url: t.source.url, type: t.source.type },
    })),
  });
}

// ponytail: one catalog per process, re-validated on every request against the data version: the marker row
// prisma/import-mcc.ts writes last in its transaction, so it changes only once an import has committed (never mid-import).
// Checked per request, not per minute: a catalog older than the cutoffs would drop rows whose source or course it
// doesn't know (e.g. right after the provisional-to-final swap). One primary-key read, once per render (React cache).
// Multi-instance deploys each hold their own copy, which is fine.
let cache: { version: string; catalog: Promise<Catalog> } | null = null;
let testCatalog: Catalog | null = null;
const access = perRequest(() => requireDecideAccess());
const dataVersion = perRequest(async () => {
  const marker = await db.dataSource.findUnique({ where: { key: "import/mcc" }, select: { createdAt: true } });
  return marker?.createdAt.toISOString() ?? "";
});

/** No database configured or reachable: Decide shows "Data unavailable", never stand-in data. */
export class DataUnavailableError extends Error {
  constructor(message = "The MCC data is not available") {
    super(message);
    this.name = "DataUnavailableError";
  }
}

/** Unit tests only: serve this in-memory dataset instead of Postgres (null to reset). */
export function setTestCatalog(d: DecideData | null) {
  testCatalog = d && memoryCatalog(d);
}

export async function getCatalog(): Promise<Catalog> {
  if (testCatalog) return testCatalog;
  if (!process.env.DATABASE_URL) throw new DataUnavailableError("DATABASE_URL is not set");
  // Every Decide page, API route and Server Action reads through here. src/middleware.ts checks only the access cookie's
  // signature, so a copied cookie with no live session is sent to sign-in (pages; the API answers 401 first in handle()).
  // Open while the gate is off (development, unit tests).
  await access();
  // Read before loading: an import committing during the load leaves the old version cached, so the next check reloads.
  const version = await dataVersion();
  if (cache?.version !== version) {
    const catalog = loadCatalog();
    catalog.catch(() => (cache = null)); // don't keep a failed load
    cache = { version, catalog };
  }
  return cache.catalog;
}
