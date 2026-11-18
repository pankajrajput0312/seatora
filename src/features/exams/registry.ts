// The exams Decide can show (neetpg-planner docs/MULTI_EXAM_PLAN.md). Client-safe. Only staff see one other than NEET PG
// (./active.tsx) until it opens. `neet-pg` is today's constants, so NEET PG behaves as before.
import { LATEST_YEAR, latestRound, PAST_YEARS, type Latest } from "@/features/decide/lib/reach";
import { baseCategories, openQuotas, openQuotasNote, quotaScopeNote, roundLabel, rounds, type Round, type Source } from "@/features/decide/types";
import { DEFAULT_EXAM, isExam, ranksPerGroup, type ExamKey } from "./keys";

export { DEFAULT_EXAM, EXAM_COOKIE, examKeys, isExam, markerKey, ranksPerGroup, scopedKey, type ExamKey } from "./keys";

/** The datasets an exam has. A page that needs one it lacks is left out of the nav and says so (pageNeeds). */
export type ExamHas = Record<"residents" | "fees" | "bonds" | "clinical" | "seats" | "scoreRank" | "merit" | "allotments" | "notices", boolean>;
export type Exam = {
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
  has: ExamHas;
};

// The bundle contract's required files: cutoffs and allotments. An adapter turns a flag on once its bundle has the data.
const resultsOnly: ExamHas = { residents: false, fees: false, bonds: false, clinical: false, seats: false, scoreRank: false, merit: false, allotments: true, notices: false };

// Years, rounds, categories and quotas from the bundles (neetpg-planner data/exams/<key>/bundle, 19 Nov 2026): NEET MDS
// results 2019-2026 (2026 R1 to R3), NEET SS 2019-2025 (SS 2026 not held yet). Both have MCC's round seat lists.
const mdsScope = "Seatora covers MCC's NEET MDS counselling (50% All India Quota of government dental colleges, deemed universities, DU / IP / BHU / AMU and AFMS). State quota counselling isn't covered: the State filter shows MCC seats in that state.";
export const exams: Record<ExamKey, Exam> = {
  "neet-pg": {
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
    has: { residents: true, fees: true, bonds: true, clinical: true, seats: true, scoreRank: true, merit: true, allotments: true, notices: true },
  },
  // MCC: no category columns in its results ("Open"); ranks are per question group, which rides in the quota label.
  "neet-ss": {
    label: "NEET SS",
    latestYear: 2025,
    pastYears: [2023, 2024],
    rounds: ["R1", "R2", "stray", "special_stray"],
    categories: ["Open"],
    pwd: false,
    quotas: [],
    quotasNote: "A NEET SS rank is a rank within one question group: pick yours, and only that group's seats are compared with your rank.",
    scopeNote: "Seatora covers MCC's NEET SS counselling (D.M., M.Ch. and DrNB seats). The State filter shows those seats in that state.",
    rankWord: "Rank",
    rankName: "NEET SS group rank",
    has: { ...resultsOnly, seats: true },
  },
  // MCC: the NEET PG result layout (50% AIQ, deemed, central universities, AFMS).
  "neet-mds": {
    label: "NEET MDS",
    latestYear: 2026,
    pastYears: [2024, 2025],
    rounds,
    categories: baseCategories,
    pwd: true,
    quotas: ["All India", "Deemed/Paid Seats"],
    quotasNote: `None ticked means All India, Deemed/Paid Seats: the quotas anyone can take. Tick a restricted quota (Armed Forces, NRI, minority, a university's own) only if you are eligible. ${mdsScope}`,
    scopeNote: mdsScope,
    rankWord: "AIR",
    rankName: "All India Rank",
    has: { ...resultsOnly, seats: true },
  },
};

/** The exam's years in order, oldest first (NEET PG: reach.ts YEARS). */
export const examYears = (exam: ExamKey) => [...exams[exam].pastYears, exams[exam].latestYear];

/** latestRound for the exam: NEET PG's exactly as before; another exam's carries its past years (reach.ts pastOf). */
export const latestOf = (sources: Pick<Source, "year" | "round" | "provisional">[], exam: ExamKey): Latest & { provisional: boolean } =>
  exam === DEFAULT_EXAM ? latestRound(sources) : { ...latestRound(sources, exams[exam].latestYear), pastYears: exams[exam].pastYears };

/** The question group a NEET SS quota label names: "All India (Medical Group)" → "Medical Group"; null without one. */
export const groupOf = (quota: string) => /\((.+)\)$/.exec(quota)?.[1] ?? null;
export const perGroup = (exam: ExamKey) => ranksPerGroup.includes(exam);
/** Her question groups (from her quotas), e.g. "Medical Group"; empty for other exams or none picked. */
export const groupsOf = (exam: ExamKey, quotas: readonly string[]) => (perGroup(exam) ? [...new Set(quotas.map(groupOf).filter((g): g is string => !!g))] : []);

/**
 * A round's name as that year's MCC result calls it: NEET SS's last round is a "Mop-up" some years and a "Stray" in
 * others, NEET MDS's R3 was the "Mop-up" till 2022 (from the result's source name). NEET PG: roundLabel, as before.
 */
export function roundNameIn(exam: ExamKey, sources: Pick<Source, "year" | "round" | "name">[], year: number, round: Round) {
  if (exam === DEFAULT_EXAM) return roundLabel[round];
  const name = sources.find((s) => s.year === year && s.round === round)?.name ?? "";
  if (/special mop-?up/i.test(name)) return "Special mop-up";
  if (/mop-?up/i.test(name)) return round === "R3" ? "R3 (Mop-up)" : "Mop-up";
  return roundLabel[round];
}

/** A quota only some candidates can take (NEET PG: not in types.ts openQuotas); NEET SS: none (its quotas are question groups). */
export const restrictedQuota = (exam: ExamKey, quota: string) => !perGroup(exam) && !exams[exam].quotas.includes(quota);

/** The exam Decide shows: staff's pick when it is a known exam, else NEET PG. Everyone else always gets NEET PG. */
export const examFor = (asked: string | null | undefined, staff: boolean): ExamKey => (staff && isExam(asked) ? asked : DEFAULT_EXAM);

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
export const showsPage = (exam: ExamKey, href: string) => {
  const need = pageNeeds[href];
  return !need || exams[exam].has[need];
};
