// What a Decide client component knows of the exam it shows (DecideShell's ExamContext): NEET PG's object is here; any
// other exam's comes from the server, to staff only (./registry.ts is server-only), so a member's browser never gets one.
import { LATEST_YEAR, PAST_YEARS } from "@/features/decide/lib/reach";
import { baseCategories, openQuotas, openQuotasNote, quotaScopeNote, roundLabel, rounds, type Round, type Source } from "@/features/decide/types";
import type { ExamKey } from "./keys";

/** The datasets an exam has. A page that needs one it lacks is left out of the nav and says so (pageNeeds). */
export type ExamHas = Record<"residents" | "fees" | "bonds" | "clinical" | "seats" | "scoreRank" | "merit" | "allotments" | "notices" | "beds", boolean>;
export type Exam = {
  key: ExamKey;
  label: string;
  /** The years the reach labels count: the latest year (R1 to its newest round) and the two before it. */
  latestYear: number;
  pastYears: [number, number];
  /** The rounds its results have. */
  rounds: readonly Round[];
  /** Seat categories its results print; one ("Open") = no category to pick. */
  categories: readonly string[];
  /** Its results print PwD seats: the profile asks. */
  pwd: boolean;
  /** Quotas any candidate can take (NEET PG: types.ts openQuotas); NEET SS: none, she picks her question group. */
  quotas: string[];
  /** The Quota filter's note when none is ticked, and what Seatora covers (the State filter's note). */
  quotasNote: string;
  scopeNote: string;
  /** "AIR" or "Rank" (a NEET SS rank is within a question group), and the field's name. */
  rankWord: string;
  rankName: string;
  /** A rank is within one question group, which rides in the quota label (NEET SS). */
  perGroup: boolean;
  /** A rank to show in examples and placeholders ("e.g. 42,284"), one this exam's results have. */
  exampleRank: string;
  has: ExamHas;
  /** From its data (features/exams/active.tsx examInfo; never NEET PG's): "year|round" → the round's name as that year's MCC PDFs call it, where not roundLabel's. */
  roundNames?: Record<string, string>;
  /** From its data: the latest year whose counselling is complete (headlines: "Allotments 2025", "2025 deepest"). */
  headYear?: number;
  /** A quota as MCC words it now, one name everywhere (display only; the data, filters and links keep the key). */
  quotaNames?: Record<string, string>;
  /** Label typos in its bundle (a course or question group name), shown as `to` (display only). */
  typos?: [from: string, to: string][];
  /** What its result PDFs are, in a source line, when not "MCC allotment results" (INI-CET: AIIMS's). */
  resultsName?: string;
};

export const neetPg: Exam = {
  key: "neet-pg",
  label: "NEET PG",
  latestYear: LATEST_YEAR,
  pastYears: PAST_YEARS,
  rounds,
  categories: baseCategories,
  pwd: true,
  quotas: openQuotas,
  quotasNote: openQuotasNote,
  scopeNote: quotaScopeNote,
  rankWord: "AIR",
  rankName: "All India Rank",
  perGroup: false,
  exampleRank: "42,284",
  has: { residents: true, fees: true, bonds: true, clinical: true, seats: true, scoreRank: true, merit: true, allotments: true, notices: true, beds: true },
};

/** The question group a NEET SS quota label names: "All India (Medical Group)" → "Medical Group"; null without one. */
export const groupOf = (quota: string) => /\((.+)\)$/.exec(quota)?.[1] ?? null;
/** Her question groups (from her quotas), e.g. "Medical Group"; empty for other exams or none picked. */
export const groupsIn = (E: Pick<Exam, "perGroup">, quotas: readonly string[]) => (E.perGroup ? [...new Set(quotas.map(groupOf).filter((g): g is string => !!g))] : []);
/** A quota only some candidates can take (NEET PG: not in types.ts openQuotas); NEET SS: none (its quotas are question groups). */
export const isRestricted = (E: Pick<Exam, "perGroup" | "quotas">, quota: string) => !E.perGroup && !E.quotas.includes(quota);

/** Decide pages that need more than cutoffs, and what: without it the nav hides them (DecideShell) and they say so (./active.tsx examGate). */
export const pageNeeds: Record<string, keyof ExamHas> = {
  "/decide/residents": "residents",
  "/decide/seats": "seats",
  "/decide/counselling": "notices",
  "/decide/rank-tools": "scoreRank",
  "/decide/fees": "fees",
  "/decide/allotments": "allotments",
  "/decide/rank-scan": "allotments",
  "/decide/rank-journey": "allotments",
};
export const examShows = (E: Pick<Exam, "has">, href: string) => {
  const need = pageNeeds[href];
  return !need || E.has[need];
};

/**
 * A round as one MCC PDF's name calls it: NEET SS's last round is a "Mop-up" some years, NEET MDS's R3 was till 2022;
 * INI-CET's rounds after Round 2 are AIIMS's "Open Round"s ("Open Round 2" where it numbers them).
 */
export function roundNameFrom(name: string, round: Round) {
  const open = /open round(?:[- ]*(\d+))?/i.exec(name);
  if (open) return open[1] ? `Open Round ${open[1]}` : "Open Round";
  if (/special mop-?up/i.test(name)) return "Special mop-up";
  if (/mop-?up/i.test(name)) return round === "R3" ? "R3 (Mop-up)" : "Mop-up";
  return roundLabel[round];
}
/** Every round its result PDFs (or, without one, its seat lists) name otherwise than roundLabel, by "year|round". */
export function roundNamesOf(sources: Pick<Source, "year" | "round" | "name">[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sources) {
    const k = `${s.year}|${s.round}`;
    const n = roundNameFrom(s.name, s.round);
    if (!(k in out) && n !== roundLabel[s.round]) out[k] = n;
  }
  return out;
}
/** A round's name in that year (NEET PG: roundLabel, as ever). */
export const roundIn = (E: Pick<Exam, "roundNames">, year: number, round: Round) => E.roundNames?.[`${year}|${round}`] ?? roundLabel[round];

/**
 * The newest year whose counselling is over, from the result PDFs: a later year has results, or it has a result after
 * Round 2 (Round 3, a mop-up or a stray round). Null without results.
 */
export function completeYear(sources: Pick<Source, "year" | "round">[]): number | null {
  const years = [...new Set(sources.map((s) => s.year))].sort((a, b) => b - a);
  return years.find((y, i) => i > 0 || sources.some((s) => s.year === y && s.round !== "R1" && s.round !== "R2")) ?? null;
}
/** The year headlines name: the latest complete one (another exam: from its data), NEET PG's later past year as before. */
export const headYearOf = (E: Pick<Exam, "headYear" | "pastYears">) => E.headYear ?? E.pastYears[1];

/** A label with the exam's bundle typos tidied (Exam.typos; display only, the data as it is). */
export const tidyLabel = (E: Pick<Exam, "typos">, s: string) => (E.typos ?? []).reduce((x, [from, to]) => x.split(from).join(to), s);
/**
 * A quota as the exam's MCC words it, display only (filters, links and the data keep the key): Exam.quotaNames, one name
 * in every year and on every page, else its typos tidied. NEET PG (neither): as it is.
 */
export const quotaIn = (E: Pick<Exam, "quotaNames" | "typos">, quota: string) => E.quotaNames?.[quota] ?? tidyLabel(E, quota);
