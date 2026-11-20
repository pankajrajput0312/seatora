// "What changed since your last visit" (pure, client-safe): the exam's data as items with stable keys (each notice,
// each round step's status and dates now, each seat list, each result), and the ones whose key she hasn't seen.
import { fingerprint } from "./account-sync";
import { stepsNow } from "./round-status";
import type { MccNotice, Round, RoundStepInfo, RoundStepName, SeatKind, SeatList, Source, StepStatus } from "../types";

export type VisitItem =
  | { kind: "notice"; k: string; title: string; date: string; url: string | null; by: string }
  | { kind: "step"; k: string; round: Round; step: RoundStepName; now: StepStatus; from: string | null; to: string | null }
  | { kind: "list"; k: string; year: number; round: Round; list: SeatKind; url: string | null; date: string | null }
  | { kind: "result"; k: string; year: number; round: Round; provisional: boolean; url: string | null };

/** Notices kept: the newest this many (a new notice is a recent one). */
export const VISIT_NOTICES = 40;

/** A notice's key (Announcements marks "New" by it). */
export const noticeKey = (n: Pick<MccNotice, "date" | "url" | "title">) => fingerprint(["n", n.date, n.url ?? n.title]);

/**
 * Items of what Home shows now. A step's key holds its status now (round-status.ts stepsNow: the schedule's clock
 * included) and its dates, so a status or a date that moved is a new key; a result's holds provisional, so the final
 * one replacing it is new.
 */
export function visitItems(d: { notices: MccNotice[]; rounds: { round: Round; steps: RoundStepInfo[] }[] | null; lists: SeatList[]; sources: Source[] }, now: Date): VisitItem[] {
  const k = (...xs: unknown[]) => fingerprint(xs);
  return [
    ...d.notices.slice(0, VISIT_NOTICES).map((n): VisitItem => ({ kind: "notice", k: noticeKey(n), title: n.title, date: n.date, url: n.url, by: n.authority })),
    ...stepsNow({ rounds: d.rounds ?? [] }, now).map((s): VisitItem => {
      const from = s.scheduled?.from ?? s.scheduled?.on ?? null;
      const to = s.scheduled?.to ?? null;
      return { kind: "step", k: k("s", s.round, s.step, s.now, from, to), round: s.round, step: s.step, now: s.now, from, to };
    }),
    ...d.lists.map((l): VisitItem => ({ kind: "list", k: k("l", l.key), year: l.year, round: l.round, list: l.kind, url: l.url, date: l.publishedAt })),
    ...d.sources.map((s): VisitItem => ({ kind: "result", k: k("r", s.key, s.provisional), year: s.year, round: s.round, provisional: s.provisional, url: s.url })),
  ];
}

/** The items she hasn't seen (`seen`: the keys of her last visit); null on a first visit (nothing to compare with). */
export const visitDiff = (seen: readonly string[] | null | undefined, items: VisitItem[]) => {
  if (!seen) return null;
  const was = new Set(seen);
  return items.filter((i) => !was.has(i.k));
};
