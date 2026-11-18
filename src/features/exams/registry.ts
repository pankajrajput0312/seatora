// The exams Decide can show (neetpg-planner docs/MULTI_EXAM_PLAN.md). Client-safe. Only staff see one other than NEET PG
// (./active.tsx) until it opens. `neet-pg` is today's constants, so NEET PG behaves as before.
import { LATEST_YEAR, PAST_YEARS } from "@/features/decide/lib/reach";
import { baseCategories, openQuotas, rounds, type Round } from "@/features/decide/types";
import { DEFAULT_EXAM, isExam, type ExamKey } from "./keys";

export { DEFAULT_EXAM, EXAM_COOKIE, examKeys, isExam, markerKey, type ExamKey } from "./keys";

/** The datasets an exam has. A page that needs one it lacks is left out of the nav and says so (pageNeeds). */
export type ExamHas = Record<"residents" | "fees" | "bonds" | "seats" | "scoreRank" | "merit" | "allotments" | "notices", boolean>;
export type Exam = {
  label: string;
  latestYear: number;
  pastYears: [number, number];
  rounds: readonly Round[];
  /** Seat categories its results print. */
  categories: readonly string[];
  /** Quotas any candidate can take (NEET PG: types.ts openQuotas). */
  quotas: readonly string[];
  has: ExamHas;
};

// The bundle contract's required files: cutoffs and allotments. An adapter turns a flag on once its bundle has the data.
const resultsOnly: ExamHas = { residents: false, fees: false, bonds: false, seats: false, scoreRank: false, merit: false, allotments: true, notices: false };

// ponytail: NEET SS / MDS years and open quotas are the research's (exam-research/blueprints.json), not yet a bundle's;
// set them from the adapter's first bundle. Decide still reads NEET PG's years (reach.ts) until the per-exam pass.
export const exams: Record<ExamKey, Exam> = {
  "neet-pg": {
    label: "NEET PG",
    latestYear: LATEST_YEAR,
    pastYears: PAST_YEARS,
    rounds,
    categories: baseCategories,
    quotas: openQuotas,
    has: { residents: true, fees: true, bonds: true, seats: true, scoreRank: true, merit: true, allotments: true, notices: true },
  },
  // MCC: no category columns in its results ("Open"); ranks are per question group, which goes into the quota label.
  "neet-ss": { label: "NEET SS", latestYear: 2025, pastYears: [2023, 2024], rounds, categories: ["Open"], quotas: ["All India"], has: resultsOnly },
  // MCC: the NEET PG result layout (50% AIQ, deemed, central universities, AFMS).
  "neet-mds": { label: "NEET MDS", latestYear: 2026, pastYears: [2024, 2025], rounds, categories: baseCategories, quotas: ["All India"], has: resultsOnly },
};

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
