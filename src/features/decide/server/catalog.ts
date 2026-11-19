import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cache as perRequest } from "react";
import { requireDecideAccess } from "@/features/auth/lib/session";
import { tidyLabel } from "@/features/exams/exam";
import { exams } from "@/features/exams/registry";
import { DEFAULT_EXAM, sessionExams, yearName, type ExamKey } from "@/features/exams/keys";
import { db } from "@/lib/db";
import { optionId, rounds, roundShort, type Allotment, type College, type Course, type Cutoff, type DecideData, type Round, type Source, type Term } from "../types";
import { termSourceName } from "@/features/cutoffs/lib/import-schema";
import { bucketOfDegree } from "./terms";
import { specialtyName } from "../lib/specialty-search";
import { catalogRows, markerOf, snapshotAt } from "./snapshot";

/** A course at a college (CollegeSpecialty). `cs` is its id: the DB id, or "college~degree~specialty" in memory (tests). */
export type Pair = { cs: string; college: string; degree: string; specialty: string };
/**
 * A choosable option (course at a college under one quota) with allotments made (Σ cutoff n) per year. `fresh`: no past
 * allotment at all, an option only because the newest round's seat lists print seats for it (service.ts newOptions;
 * `cs` "" and `byYear` empty); never in Catalog.options.
 */
export type Opt = Pair & { id: string; quota: string; byYear: Record<number, number>; fresh?: true };

/**
 * Everything small enough to keep in memory: colleges, courses, sources, terms and the option list. Cutoffs and
 * allotments (133k / 210k rows) are queried per request in ./queries.ts. One exam's: every query made with it is too.
 */
export type Catalog = {
  exam: ExamKey;
  /** Tests only: the whole fixture in memory, filtered in JS instead of SQL. Null at runtime (Postgres). */
  mem: { cutoffs: Cutoff[]; allotments: Allotment[] } | null;
  colleges: College[];
  courses: Course[];
  sources: Source[];
  options: Opt[];
  terms: Term[];
  collegeByKey: Map<string, College>;
  collegeBySlug: Map<string, College>;
  courseOf: Map<string, Course>; // "degree|specialty", every course (`courses`: those with options)
  termOf: Map<string, Term>; // "college|program|kind"
  optionById: Map<string, Opt>;
  pairs: Map<string, Pair>; // cs → pair
  sourceById: Map<string, Source>; // DB id (in memory: key) → source
  /** Retired college key (or "sha256:<hex>" of it) → the key its college has now; only colleges still in the data. */
  retired: Map<string, string>;
  /** Slug of a college under a retired key (hashed like the key) → the key its college has now. */
  retiredSlug: Map<string, string>;
  /** Another exam's fee source: the MCC institute-profile snapshots its fee table was made from (empty for NEET PG). */
  feeDocs: { name: string; url: string | null }[];
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

/** Years and rounds come from the result PDFs, so labels say "provisional" only while a source is. Years as `exam` names them (INI-CET: "Jan 2026"). */
export function yearsOf(sources: Source[], exam: ExamKey = DEFAULT_EXAM): YearInfo[] {
  const ys = [...new Set(sources.map((s) => s.year))].sort((a, b) => b - a);
  return ys.map((year, i) => {
    const mine = sources.filter((s) => s.year === year);
    const rs = rounds.filter((r) => mine.some((s) => s.round === r));
    const provisional = mine.some((s) => s.provisional);
    const name = yearName(exam, year);
    const label = i === 0 ? `${name} (${rs.map((r) => roundShort(r, exam)).join(", ")}${provisional ? ", provisional" : ""})` : provisional ? `${name} (provisional)` : name;
    return { year, rounds: rs, provisional, label };
  });
}

const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

export function indexCatalog(p: {
  exam?: ExamKey;
  mem?: Catalog["mem"];
  colleges: College[];
  courses: Course[];
  sources: [id: string, source: Source][];
  pairs: Pair[];
  options: { cs: string; quota: string; year: number; n: number }[];
  terms: Term[];
  retired?: { oldKey: string; oldSlug: string | null; newKey: string | null }[];
  feeDocs?: Catalog["feeDocs"];
}): Catalog {
  const pairs = new Map(p.pairs.map((x) => [x.cs, x]));
  const collegeByKey = new Map(p.colleges.map((c) => [c.key, c]));
  const retired = (p.retired ?? []).filter((r): r is typeof r & { newKey: string } => r.newKey != null && collegeByKey.has(r.newKey));
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
    exam: p.exam ?? DEFAULT_EXAM,
    mem: p.mem ?? null,
    colleges: p.colleges,
    courses,
    sources,
    options,
    terms: p.terms,
    collegeByKey,
    collegeBySlug: new Map(p.colleges.map((c) => [c.slug, c])),
    // Every MCC course, with data or not: a course first seen in a seat list (a new option) still has its name.
    courseOf: new Map(p.courses.map((c) => [`${c.degree}|${c.specialty}`, c])),
    termOf: new Map(p.terms.map((t) => [`${t.college}|${t.program}|${t.kind}`, t])),
    optionById,
    pairs,
    sourceById: new Map(p.sources),
    retired: new Map(retired.map((r) => [r.oldKey, r.newKey])),
    retiredSlug: new Map(retired.flatMap((r) => (r.oldSlug ? [[r.oldSlug, r.newKey]] : []))),
    feeDocs: p.feeDocs ?? [],
    meta: {
      courses,
      // One name per specialty: a mixed-case MCC name over an ALL-CAPS one, tidied; listed A–Z.
      specialties: specialtyCodes
        .map((code) => {
          const names = courses.filter((c) => c.specialty === code).map((c) => c.name);
          return { code, name: specialtyName(names.find((n) => !/[A-Z]{3}/.test(n)) ?? names[0], code) };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      degrees: uniq(courses.map((c) => c.degree)),
      quotas: uniq(options.map((o) => o.quota)),
      states: uniq(p.colleges.map((c) => c.state)),
      sources,
      years: yearsOf(sources, p.exam ?? DEFAULT_EXAM),
    },
  };
}

/** In-memory catalog over a whole dataset (the unit-test fixture), as `exam`'s. */
export function memoryCatalog(d: DecideData, exam: ExamKey = DEFAULT_EXAM): Catalog {
  const cs = (c: { college: string; degree: string; specialty: string }) => `${c.college}~${c.degree}~${c.specialty}`;
  const pairs = new Map(d.cutoffs.map((c) => [cs(c), { cs: cs(c), college: c.college, degree: c.degree, specialty: c.specialty }]));
  return indexCatalog({
    exam,
    mem: { cutoffs: d.cutoffs, allotments: d.allotments },
    colleges: d.colleges,
    courses: d.courses,
    sources: d.sources.map((s) => [s.key, s]),
    pairs: [...pairs.values()],
    options: d.cutoffs.map((c) => ({ cs: cs(c), quota: c.quota, year: c.year, n: c.n })),
    terms: d.terms,
  });
}

/**
 * Drops a researcher's first-person working note left in imported text ("…; I did not retrieve its official text."):
 * not for readers. Fix at source too (the bond records' `years`); this keeps it off the page meanwhile.
 */
const WORKING_NOTE = /;?\s*\b(?:I|we) (?:did not|could not|have not|didn't|couldn't|haven't) [^."\\]*\./gi;
export const scrubNotes = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replace(WORKING_NOTE, (m) => (m.startsWith(";") ? "." : "")));

/**
 * A fee record's documents with a session-code year named as the exam names it (INI-CET's prospectus "20271" → "Jan
 * 2027"; display only: server/terms.ts and fees.tsx show a number year, the label already names the session). Every other
 * exam's records as they are.
 */
export const namedSessions = <R extends { sources: { year?: number | string | null }[] }>(exam: ExamKey, r: R): R =>
  sessionExams.includes(exam) ? { ...r, sources: r.sources.map((x) => (typeof x.year === "number" ? { ...x, year: yearName(exam, x.year) } : x)) } : r;

async function loadCatalog(exam: ExamKey, version: string): Promise<Catalog> {
  // NEET PG: the build's snapshot while no import has committed since (zero DB egress), else Postgres.
  const snap = exam === DEFAULT_EXAM ? await snapshotAt(version) : null;
  const { sources, colleges, specialties, pairs, terms, options, details, retired, feeTable: rawFees } = snap?.catalog ?? (await catalogRows(db, exam));
  const feeTable = rawFees.map((r) => namedSessions(exam, r));
  const detailsOf = new Map(details.map((d) => [d.id, scrubNotes(d.details)]));
  // FEE and STIPEND terms carry their college + program's fee-table records, as the bundle's terms do (details.records).
  const feeRecords = Map.groupBy(feeTable, (r) => `${r.collegeId}|${bucketOfDegree(r.programme)}`);
  const recordsOf = (t: { collegeId: string; program: string; kind: string }) => (t.kind === "FEE" || t.kind === "STIPEND" ? feeRecords.get(`${t.collegeId}|${t.program}`) : undefined);
  const collegeKey = new Map(colleges.map((c) => [c.id, c.key]));
  const spec = new Map(specialties.map((s) => [s.id, s]));
  // Another exam's bundle may carry only the fee table (MCC's institute profiles, no terms.ndjson): each college +
  // program with records and no FEE or STIPEND term gets one FEE term, its source the profile, its records attached, so
  // server/terms.ts reads it as NEET PG's. NEET PG's terms are its own (its FEE / STIPEND terms always exist).
  const termed = new Set(terms.filter((t) => t.kind === "FEE" || t.kind === "STIPEND").map((t) => `${t.collegeId}|${t.program}`));
  const feeOnly: Term[] =
    exam === DEFAULT_EXAM
      ? []
      : [...feeRecords].flatMap(([k, recs]) => {
          const [collegeId, program] = k.split("|");
          const college = collegeKey.get(collegeId);
          const r = recs[0];
          const url = r.fee_text_src?.url ?? r.sources[0]?.url ?? null;
          return termed.has(k) || !college ? [] : [{ college, program: program as Term["program"], kind: "FEE" as const, text: r.fee_text ?? "As the MCC institute profile declares it", amountInr: null, source: { name: r.sources.find((x) => x.url === url)?.label ?? (url ? termSourceName(url) : "MCC institute profile"), url, type: "OFFICIAL" as const }, details: { records: recs } }];
        });
  return indexCatalog({
    exam,
    // Beds and year established are not in the MCC data; type (inferred, College.typeBasis) is imported (bundle schema
    // 2) but not shown yet. Never guessed. website: the MCC profile's (a fee cell "On college website ↗" links it).
    colleges: colleges.map((c) => ({ key: c.key, slug: c.slug, name: c.name, state: c.state, pincode: c.pincode, address: c.address, type: null, beds: null, established: null, website: c.website })),
    // Another exam's course names with their bundle typos tidied (exams/exam.ts tidyLabel); NEET PG's as they are.
    courses: specialties.map((s) => ({ degree: s.degree, specialty: s.code ?? "", name: tidyLabel(exams[exam], s.name), slug: s.slug })),
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
      ...(detailsOf.has(t.id) && { details: detailsOf.get(t.id) }),
      ...(recordsOf(t) && { details: { records: recordsOf(t)! } }),
    })).concat(feeOnly),
    retired,
    feeDocs: exam === DEFAULT_EXAM ? [] : sources.filter((s) => s.key.startsWith("raw/profiles_")).map((s) => ({ name: s.name, url: s.url })),
  });
}

// ponytail: one catalog per exam per process, re-validated on every request against that exam's data version: the marker
// row prisma/import-mcc.ts writes last in its transaction, so it changes only once an import has committed (never mid-import).
// Checked per request, not per minute: a catalog older than the cutoffs would drop rows whose source or course it
// doesn't know (e.g. right after the provisional-to-final swap). One primary-key read, once per render (React cache).
// Multi-instance deploys each hold their own copy, which is fine.
const cache = new Map<ExamKey, { version: string; catalog: Promise<Catalog> }>();
let testCatalog: Catalog | null = null;
const trusted = new AsyncLocalStorage<true>();
/**
 * Runs `fn` with Decide's data readable without a browser session: only for server work that has checked its caller
 * itself (the WhatsApp webhook verifies Meta's signature). Pages and the API still go through requireDecideAccess.
 */
export const asTrustedServer = <T>(fn: () => Promise<T>) => trusted.run(true, fn);
const access = perRequest(() => (trusted.getStore() ? undefined : requireDecideAccess()));
export const dataVersion = perRequest((exam: ExamKey) => markerOf(db, exam));

/** No database configured or reachable: Decide shows "Data unavailable", never stand-in data. */
export class DataUnavailableError extends Error {
  constructor(message = "The MCC data is not available") {
    super(message);
    this.name = "DataUnavailableError";
  }
}

/** Unit tests only: serve this in-memory dataset (as `exam`'s) instead of Postgres (null to reset). */
export function setTestCatalog(d: DecideData | null, exam: ExamKey = DEFAULT_EXAM) {
  testCatalog = d && memoryCatalog(d, exam);
}

/** The exam's catalog (default NEET PG: what every caller that names none reads). */
export async function getCatalog(exam: ExamKey = DEFAULT_EXAM): Promise<Catalog> {
  if (testCatalog) return testCatalog;
  if (!process.env.DATABASE_URL) throw new DataUnavailableError("DATABASE_URL is not set");
  // Every Decide page, API route and Server Action reads through here. src/middleware.ts checks only the access cookie's
  // signature, so a copied cookie with no live session is sent to sign-in (pages; the API answers 401 first in handle()).
  // Open while the gate is off (development, unit tests).
  // Access and version in parallel (one round trip less per request); a redirect from access() still wins.
  // Read before loading: an import committing during the load leaves the old version cached, so the next check reloads.
  const [, version] = await Promise.all([access(), dataVersion(exam)]);
  const hit = cache.get(exam);
  if (hit?.version === version) return hit.catalog;
  const catalog = loadCatalog(exam, version);
  catalog.catch(() => cache.delete(exam)); // don't keep a failed load
  cache.set(exam, { version, catalog });
  return catalog;
}

/**
 * `load(key, exam)` once per exam's data version per process, shared across requests and users, like the catalog: only
 * for import data (seat lists, MCC notices), never per-user or resident data. Results are shared: callers must not
 * mutate them. Tests with an in-memory catalog read through.
 */
export function perImport<T>(load: (key: string, exam: ExamKey) => Promise<T>): (key?: string, exam?: ExamKey) => Promise<T> {
  const memo = new Map<ExamKey, { version: string; values: Map<string, Promise<T>> }>();
  return async (key = "", exam = DEFAULT_EXAM) => {
    await getCatalog(exam); // same access and availability as the rest of Decide
    if (testCatalog) return load(key, exam);
    const version = await dataVersion(exam);
    if (memo.get(exam)?.version !== version) memo.set(exam, { version, values: new Map() });
    const { values } = memo.get(exam)!;
    const hit = values.get(key);
    if (hit) return hit;
    const p = load(key, exam);
    values.set(key, p);
    p.catch(() => values.delete(key)); // don't keep a failed read
    return p;
  };
}
