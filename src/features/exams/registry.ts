// The exams Decide can show (neetpg-planner docs/MULTI_EXAM_PLAN.md). Server only: another exam's words and data never
// reach a member's browser (client components get the active exam's object from DecideShell, ./exam.ts). Only staff see
// one other than NEET PG (./active.tsx) until it opens. `neet-pg` is today's constants, so NEET PG behaves as before.
import "server-only";
import { latestRound, type Latest } from "@/features/decide/lib/reach";
import { baseCategories, roundLabel, rounds, type Round, type Source } from "@/features/decide/types";
import { completeYear, examShows, groupsIn, isRestricted, neetPg, roundNameFrom, type Exam, type ExamHas } from "./exam";
import { DEFAULT_EXAM, isExam, ranksPerGroup, type ExamKey } from "./keys";

export { DEFAULT_EXAM, EXAM_COOKIE, examKeys, isExam, markerKey, ranksPerGroup, scopedKey, type ExamKey } from "./keys";
export { groupOf, pageNeeds, type Exam, type ExamHas } from "./exam";

// The bundle contract's required files: cutoffs and allotments. An adapter turns a flag on once its bundle has the data.
const resultsOnly: ExamHas = { residents: false, fees: false, bonds: false, clinical: false, seats: false, scoreRank: false, merit: false, allotments: true, notices: false, beds: false };

// Years, rounds, categories and quotas from the bundles (neetpg-planner data/exams/<key>/bundle, 19 Nov 2026): NEET MDS
// results 2019-2026 (2026 R1 to R3), NEET SS 2019-2025 (SS 2026 not held yet). Both have MCC's round seat lists.
const mdsScope = "Seatora covers MCC's NEET MDS counselling (50% All India Quota of government dental colleges, deemed universities, DU / IP / BHU / AMU and AFMS). State quota counselling isn't covered: the State filter shows MCC seats in that state.";
export const exams: Record<ExamKey, Exam> = {
  "neet-pg": neetPg,
  // MCC: no category columns in its results ("Open"); ranks are per question group, which rides in the quota label.
  "neet-ss": {
    key: "neet-ss",
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
    perGroup: true,
    // The bundle's course and group labels as printed (the data keeps them).
    typos: [["Reconstructructive", "Reconstructive"], ["Ent Group", "ENT Group"]],
    exampleRank: "250",
    // Hospital facts (beds) are about the institution: an SS hospital's are NEET PG's record of it (institute-data.ts).
    has: { ...resultsOnly, seats: true, beds: true },
  },
  // MCC: the NEET PG result layout (50% AIQ, deemed, central universities, AFMS).
  "neet-mds": {
    key: "neet-mds",
    label: "NEET MDS",
    latestYear: 2026,
    pastYears: [2024, 2025],
    rounds,
    categories: baseCategories,
    pwd: true,
    quotas: ["All India", "Deemed/Paid Seats"],
    quotasNote: `None ticked means All India and Self-Financed Merit Seat (MCC called it "Management/Paid Seats" up to 2025): the quotas anyone can take. Tick a restricted quota (Armed Forces, NRI, minority, a university's own) only if you are eligible. ${mdsScope}`,
    scopeNote: mdsScope,
    rankWord: "AIR",
    rankName: "All India Rank",
    perGroup: false,
    exampleRank: "2,500",
    // MCC's MDS wording for the paid quota now (its results said "Management/Paid Seats" up to 2025): one name everywhere.
    quotaNames: { "Deemed/Paid Seats": "Self-Financed Merit Seat", "Deemed/Paid": "Self-Financed Merit Seat" },
    has: { ...resultsOnly, seats: true },
  },
};

/** The exam's years in order, oldest first (NEET PG: reach.ts YEARS). */
export const examYears = (exam: ExamKey) => [...exams[exam].pastYears, exams[exam].latestYear];

/** latestRound for the exam: NEET PG's exactly as before; another exam's carries its past years (reach.ts pastOf). */
export const latestOf = (sources: Pick<Source, "year" | "round" | "provisional">[], exam: ExamKey): Latest & { provisional: boolean } =>
  exam === DEFAULT_EXAM ? latestRound(sources) : { ...latestRound(sources, exams[exam].latestYear), pastYears: exams[exam].pastYears };

/** The year headlines name ("Allotments 2025", "2025 deepest"): NEET PG's later past year as before; another exam's latest complete year in its results. */
export const headYearIn = (exam: ExamKey, sources: Pick<Source, "year" | "round">[]) =>
  exam === DEFAULT_EXAM ? exams[exam].pastYears[1] : (completeYear(sources) ?? exams[exam].pastYears[1]);

export const perGroup = (exam: ExamKey) => ranksPerGroup.includes(exam);
/** Her question groups (from her quotas), e.g. "Medical Group"; empty for other exams or none picked. */
export const groupsOf = (exam: ExamKey, quotas: readonly string[]) => groupsIn(exams[exam], quotas);

/**
 * A round's name as that year's MCC result calls it: NEET SS's last round is a "Mop-up" some years and a "Stray" in
 * others, NEET MDS's R3 was the "Mop-up" till 2022 (from the result's source name). NEET PG: roundLabel, as before.
 */
export function roundNameIn(exam: ExamKey, sources: Pick<Source, "year" | "round" | "name">[], year: number, round: Round) {
  if (exam === DEFAULT_EXAM) return roundLabel[round];
  return roundNameFrom(sources.find((s) => s.year === year && s.round === round)?.name ?? "", round);
}

/** A quota only some candidates can take (NEET PG: not in types.ts openQuotas); NEET SS: none (its quotas are question groups). */
export const restrictedQuota = (exam: ExamKey, quota: string) => isRestricted(exams[exam], quota);

/** The exam Decide shows: staff's pick when it is a known exam, else NEET PG. Everyone else always gets NEET PG. */
export const examFor = (asked: string | null | undefined, staff: boolean): ExamKey => (staff && isExam(asked) ? asked : DEFAULT_EXAM);

export const showsPage = (exam: ExamKey, href: string) => examShows(exams[exam], href);
