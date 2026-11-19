"use client";

import { quotaIn, roundIn } from "@/features/exams/exam";
import { useExamInfo } from "../lib/use-decide-store";
import type { Round } from "../types";

/** A round's name in that year, as the exam's MCC PDFs call it (NEET SS 2023's Mop-up); NEET PG: roundLabel, as ever. Server or client. */
export function RoundName({ year, round }: { year: number; round: Round }) {
  return roundIn(useExamInfo(), year, round);
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
