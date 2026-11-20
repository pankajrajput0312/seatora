import "server-only";
import type { ExamKey } from "@/features/exams/keys";
import { exams } from "@/features/exams/registry";
import { visitItems } from "../lib/visit";
import { listNotices, roundStatus, scheduleYear } from "../server/notices";
import { seatLists } from "../server/seats";
import { getMeta, type RoundSummary } from "../service";
import type { SeatList } from "../types";
import { WhatChangedCard } from "./what-changed-card";

/** Her courses' options with seats in the newest round's lists (Home's own count), said beside a new list of that round. */
export type RoundCount = { list: SeatList; sum: RoundSummary } | null;
export const coursesOf = (round: RoundCount) => (round?.sum ? { year: round.list.year, round: round.list.round, options: round.sum.options, clear: round.sum.clear } : null);

/** The exam's notices, round steps, seat lists and results as they are now (lib/visit.ts). */
export async function visitNow(exam: ExamKey) {
  const year = (await scheduleYear(exam)) ?? exams[exam].latestYear;
  const [notices, rs, lists, meta] = await Promise.all([listNotices({}, exam), roundStatus(year, exam).catch(() => null), seatLists(exam), getMeta(exam)]);
  return visitItems({ notices, rounds: rs?.rounds ?? null, lists, sources: meta.sources }, new Date());
}

/**
 * "What changed since your last visit" at the top of Home while there is no result card (your-result.tsx folds it in
 * then): the exam's data as it is now, for the card to compare with what Home last showed her (WhatChangedCard).
 */
export async function WhatChanged({ exam, round }: { exam: ExamKey; round: RoundCount }) {
  return <WhatChangedCard items={await visitNow(exam)} courses={coursesOf(round)} />;
}
