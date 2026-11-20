// What NEET PG's public guides read from the data (/neet-pg/cutoff, /neet-pg/college-predictor's examples,
// /neet-pg/counselling-2026, /neet-pg/stipend-bond). Import data only, never a resident; read without a browser session
// (asTrustedServer: public pages), once per data version (perImport) where it is more than a lookup.
import "server-only";
import { asTrustedServer, getCatalog, perImport, type Opt } from "@/features/decide/server/catalog";
import { listNotices, roundStatus } from "@/features/decide/server/notices";
import { findCutoffs } from "@/features/decide/server/queries";
import { collegeTerms, type ProgrammeTerms } from "@/features/decide/server/terms";
import { NONE_DECLARED, statCells } from "@/features/decide/lib/stat-format";
import { latestRound } from "@/features/decide/lib/reach";
import { roundName, stepsNow } from "@/features/decide/lib/round-status";
import { optionId, rounds, type Round } from "@/features/decide/types";
import { db } from "@/lib/db";
import { DEFAULT_EXAM, exams } from "../registry";
import { coursePath, cutoffPath, roundsOf } from "./cutoff";
import { nameIn, type RankCheck } from "./data";

type LastRow = { slug: string; quota: string; year: number; round: Round; closing: number };

/**
 * Every NEET PG course with its latest last rank on Open seats in a main round (R1 to R3; a stray round's never counts):
 * All India, or for a course MCC allots only in the DNB quota (DNB, NBEMS Diploma), the DNB quota. Null: no Open
 * allotment in either, in any main round.
 */
const courseTable = perImport(async () => {
  const cat = await getCatalog();
  const rows = await db.$queryRaw<LastRow[]>`
    SELECT s.slug, c.quota, c."counsellingYear" AS year, c.round, MAX(c."closingRank") AS closing
    FROM "Cutoff" c JOIN "CollegeSpecialty" cs ON cs.id = c."collegeSpecialtyId" JOIN "Specialty" s ON s.id = cs."specialtyId"
    WHERE c.exam = ${DEFAULT_EXAM} AND c.category = 'Open' AND c.quota IN ('All India', 'DNB Quota')
      AND c.round IN ('R1', 'R2', 'R3') AND c."closingRank" IS NOT NULL
    GROUP BY s.slug, c.quota, c."counsellingYear", c.round`;
  const provisional = new Set(roundsOf(cat.sources).filter((r) => r.provisional).map(cutoffPath));
  const when = (r: LastRow) => r.year * 10 + rounds.indexOf(r.round);
  const bySlug = Map.groupBy(rows, (r) => r.slug);
  return cat.courses.map((c) => {
    const mine = bySlug.get(c.slug) ?? [];
    const aiq = mine.filter((r) => r.quota === "All India");
    const last = (aiq.length ? aiq : mine).toSorted((a, b) => when(b) - when(a))[0];
    return {
      course: `${c.degree} ${c.name}`,
      path: coursePath(c),
      last: last ? { ...last, page: cutoffPath(last), provisional: provisional.has(cutoffPath(last)) } : null,
    };
  });
});
export const courseLastRanks = () => asTrustedServer(() => courseTable());

/** The latest round with a result (lib/reach.ts latestRound): every option anyone can take with its last rank on Open seats, lowest first. */
const latestOpen = perImport(async () => {
  const cat = await getCatalog();
  const at = latestRound(cat.sources);
  const cuts = await findCutoffs(cat, { quotas: exams[DEFAULT_EXAM].quotas, categories: ["Open"], years: [at.year] });
  const by = new Map<string, { o: Opt; closing: number }>();
  for (const c of cuts) {
    const o = c.round === at.round ? cat.optionById.get(optionId(c)) : undefined;
    if (o && (by.get(o.id)?.closing ?? 0) < c.closing) by.set(o.id, { o, closing: c.closing });
  }
  const src = cat.sources.find((s) => s.year === at.year && s.round === at.round);
  return { cat, at, source: src ? { name: src.name, url: src.url } : null, opts: [...by.values()].sort((a, b) => a.closing - b.closing || (a.o.id < b.o.id ? -1 : 1)) };
});

/**
 * What each rank got in the latest round on Open seats, as the rank check's answer (./data.ts rankCheck, which reads last
 * year's Rounds 1 to 3): `n`, options whose last rank was at or after it; `rows`, the `take` tightest at different
 * institutes. History, not a prediction.
 */
export const rankBands = (ranks: number[], take = 3) =>
  asTrustedServer(async () => {
    const { cat, at, source, opts } = await latestOpen();
    const E = exams[DEFAULT_EXAM];
    const bands = ranks.map((rank): RankCheck => {
      const hits = opts.filter((x) => x.closing >= rank);
      const picked: typeof hits = [];
      for (const h of hits) if (picked.length < take && !picked.some((p) => p.o.college === h.o.college)) picked.push(h);
      return { rank, category: "Open", year: String(at.year), n: hits.length, rows: picked.map((h) => ({ id: h.o.id, ...nameIn(cat, E, h.o), round: roundName[at.round], closing: h.closing, source })) };
    });
    return { year: at.year, round: at.round, provisional: at.provisional, source, bands };
  });

/** The counselling year's round steps now (MCC's notices) and its latest notices with a link, newest first. */
export const counselling = (year: number) =>
  asTrustedServer(async () => {
    const [status, notices] = await Promise.all([roundStatus(year), listNotices({ year })]);
    return { status: status && { asOf: status.asOf, steps: stepsNow(status, new Date()) }, notices: notices.filter((n) => n.url) };
  });

export type Range = { n: number; min: number; max: number };
const widen = (r: Range | undefined, lo: number, hi: number): Range => (r ? { n: r.n + 1, min: Math.min(r.min, lo), max: Math.max(r.max, hi) } : { n: 1, min: lo, max: hi });
type BondClass = "bond" | "none" | "unknown";
/** The bond as its cell reads it (lib/stat-format.ts, never a new reading): a bond, no bond (or none declared under NBEMS's rule), or not known. */
const bondOf = (cell: { tone: string | null; full: string }): BondClass => (cell.tone === "bond" ? "bond" : cell.full === "No bond" || cell.full === NONE_DECLARED ? "none" : "unknown");
/** Year 1's stipend a month when a document gives the college's own figure (or NMC's filing); never an NBEMS minimum. */
const ownStipend = (t: ProgrammeTerms) => {
  const f = t.years[0]?.stipend;
  return f && (f.kind === "declared" || f.kind === "nmc") ? f : null;
};

/**
 * Stipends and bonds of every institute with MCC allotments, from the same terms and cells as Decide's: `rows`, one per
 * institute (its first programme: MD/MS before Diploma, DNB…); `types`, year 1's own stipends per programme; `states`,
 * per state the MD/MS and DNB stipend ranges and the MD/MS bonds (three states, years, penalty); `dnb`, DNB seats' bonds;
 * `rules`, the state rules MCC seats' bonds are read from, each with its document.
 */
const stipendTable = perImport(async () => {
  const cat = await getCatalog();
  const used = new Set(cat.options.map((o) => o.college));
  const types = new Map<string, { own?: Range; floor: number; none: number }>();
  const states = new Map<string, { md?: Range; dnb?: Range; colleges: number; bond: Record<BondClass, number>; years?: Range; penalty?: Range }>();
  const dnb: Record<BondClass, number> = { bond: 0, none: 0, unknown: 0 };
  const rules = new Map<string, { state: string; text: string; source: { label: string; url: string | null } | null; colleges: Set<string> }>();
  const rows = cat.colleges.flatMap((c) => {
    const ts = collegeTerms(cat, c.key);
    if (!used.has(c.key) || !ts.length) return [];
    const state = c.state ?? "State not known";
    const s = states.get(state) ?? states.set(state, { colleges: 0, bond: { bond: 0, none: 0, unknown: 0 } }).get(state)!;
    for (const t of ts) {
      const own = ownStipend(t);
      const ty = types.get(t.programme) ?? types.set(t.programme, { floor: 0, none: 0 }).get(t.programme)!;
      if (own) ty.own = widen(ty.own, own.min ?? own.inr, own.inr);
      else if (t.years[0]?.stipend?.kind === "minimum") ty.floor++;
      else ty.none++;
      if (own && t.programme === "MD/MS") s.md = widen(s.md, own.min ?? own.inr, own.inr);
      if (own && t.programme === "DNB") s.dnb = widen(s.dnb, own.min ?? own.inr, own.inr);
      const b = bondOf(statCells(t)[2]);
      if (t.programme === "MD/MS") {
        s.colleges++;
        s.bond[b]++;
        if (b === "bond" && t.bond.years) s.years = widen(s.years, t.bond.years, t.bond.years);
        const a = t.bond.amount;
        // A figure a document states (or per year × its years); one Seatora computes from words ("double the stipend") is left to the college's page.
        if (b === "bond" && a.state === "figure" && a.max != null && !a.formula) s.penalty = widen(s.penalty, a.min ?? a.max, a.max);
      }
      if (t.programme === "DNB") dnb[b]++;
      if (t.bond.basis === "state_rule" && t.bond.text) {
        const text = t.bond.text.split(" — ")[0];
        const src = t.sources.find((x) => x.n === t.bond.src);
        const k = `${state}|${text}`;
        (rules.get(k) ?? rules.set(k, { state, text, source: src ? { label: src.label, url: src.url } : null, colleges: new Set() }).get(k)!).colleges.add(c.key);
      }
    }
    const t = ts[0];
    const [, stipend, bond, inr] = statCells(t);
    const fromRule = t.bond.basis === "state_rule" || !!t.bond.yearsFrom;
    return [{
      name: c.name,
      slug: c.slug,
      state,
      programme: t.programme,
      stipend: stipend.marker ? `${stipend.full} (${stipend.marker})` : stipend.full,
      bond: bond.tone === "bond" ? `${bond.full}${inr.tone !== "muted" && inr.full.includes("₹") ? `, ${inr.short} penalty` : ""}${fromRule ? " (state rule)" : ""}` : bond.full,
    }];
  });
  rows.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  return {
    rows,
    types: [...types].map(([programme, x]) => ({ programme, ...x })),
    states: [...states].map(([state, x]) => ({ state, ...x })).sort((a, b) => a.state.localeCompare(b.state)),
    dnb,
    rules: [...rules.values()].map((r) => ({ ...r, colleges: r.colleges.size })).sort((a, b) => a.state.localeCompare(b.state) || b.colleges - a.colleges),
  };
});
export const stipendBond = () => asTrustedServer(() => stipendTable());
