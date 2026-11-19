"use client";

import { quotaIn, roundIn } from "@/features/exams/exam";
import { authorityOf, inExamWords, yearName } from "@/features/exams/keys";
import { useExamInfo } from "../lib/use-decide-store";
import { kindName, roundShort, type Round, type SeatKind } from "../types";

/** A round's name in that year, as the exam's MCC PDFs call it (NEET SS 2023's Mop-up); NEET PG: roundLabel, as ever. Server or client. */
export function RoundName({ year, round }: { year: number; round: Round }) {
  return roundIn(useExamInfo(), year, round);
}

/** A year as the exam names it (exams/keys.ts yearName: INI-CET's "Jan 2026"; NEET PG's "2025", as ever). Server or client. */
export function YearName({ year, long }: { year: number; long?: boolean }) {
  return yearName(useExamInfo().key, year, long);
}

/** Who runs the exam's counselling: "MCC" (NEET PG, SS, MDS), "AIIMS" (INI-CET). Server or client. */
export function Authority() {
  return authorityOf(useExamInfo().key);
}

/** A sentence in the exam's words (keys.ts inExamWords: INI-CET's AIIMS and prospectus; the rest as written). Server or client. */
export function ExamWords({ children }: { children: string }) {
  return inExamWords(useExamInfo().key, children);
}

/** A seat list's kind as the exam names it (types.ts kindName: INI-CET's "Seat position"); `lower`, `short` ("clear", "newly added"). Server or client. */
export function KindName({ kind, lower, short }: { kind: SeatKind; lower?: boolean; short?: boolean }) {
  const exam = useExamInfo().key;
  const s = kindName(kind, exam);
  if (short) return s === "Seat position" ? "seat position" : kind === "new" ? "newly added" : kind;
  return lower ? s.toLowerCase() : s;
}

/** A round's short name as the exam says it (types.ts roundShort: INI-CET's R3 "Open Round"; NEET PG's "R3"). Server or client. */
export function RoundShort({ round }: { round: Round }) {
  return roundShort(round, useExamInfo().key);
}

/** One round across `years` (a column of several years): its names in those years, joined ("Stray / Mop-up"). */
export function RoundNames({ years, round }: { years: number[]; round: Round }) {
  const E = useExamInfo();
  return [...new Set(years.map((y) => roundIn(E, y, round)))].join(" / ");
}

/** A quota as the exam's MCC words it (exams/exam.ts quotaIn; NEET PG: as it is). Server or client. */
export function QuotaName({ quota }: { quota: string }) {
  return quotaIn(useExamInfo(), quota);
}

/** NEET PG's words, or (another exam: no NBEMS, DNB or MD/MS rules apply to it) `other`. Server or client. */
export function PgOr({ pg, other }: { pg: React.ReactNode; other: React.ReactNode }) {
  return useExamInfo().key === "neet-pg" ? pg : other;
}
