// NEET PG's public cutoff pages, one per result round (/neet-pg/round-2-cutoff-2026): their address and words, from
// the round alone. Pure, so tested (cutoff.test.ts).
import { roundName } from "@/features/decide/lib/round-status";
import { rounds, type Round } from "@/features/decide/types";

export type CutoffRound = { year: number; round: Round; provisional: boolean };

const slugOf: Record<Round, string> = { R1: "round-1", R2: "round-2", R3: "round-3", stray: "stray-round", special_stray: "special-stray-round" };

/** "/neet-pg/round-2-cutoff-2026". */
export const cutoffPath = (r: Pick<CutoffRound, "year" | "round">) => `/neet-pg/${slugOf[r.round]}-cutoff-${r.year}`;

/** Every round with a result PDF, newest first (year, then round), once each; provisional while MCC's result is. */
export function roundsOf(sources: CutoffRound[]): CutoffRound[] {
  const by = new Map<string, CutoffRound>();
  for (const s of sources) {
    const k = cutoffPath(s);
    by.set(k, { year: s.year, round: s.round, provisional: !!by.get(k)?.provisional || s.provisional });
  }
  return [...by.values()].sort((a, b) => b.year - a.year || rounds.indexOf(b.round) - rounds.indexOf(a.round));
}

/** "Round 2", "Stray Vacancy Round". */
const titled = (r: Round) => roundName[r].replace(/\b[a-z]/g, (c) => c.toUpperCase());

/**
 * The page's words: `title` (≤ 50 characters, so with the layout's " · Seatora" it fits Google's ~60), `h1`, `name` (its
 * link text elsewhere) and `description` (≤ 155).
 */
export function cutoffWords({ year, round, provisional }: CutoffRound) {
  const long = `NEET PG ${year} ${titled(round)} Cutoff: Last Rank by Branch`;
  return {
    title: long.length <= 50 ? long : `NEET PG ${year} ${titled(round)} Cutoff by Branch`,
    h1: `NEET PG ${year} ${titled(round)} Cutoff${provisional ? " (Provisional)" : ""}: Last Rank by Branch`,
    name: `NEET PG ${year} ${roundName[round]} cutoff`,
    description: `${provisional ? "Provisional " : ""}NEET PG ${year} ${roundName[round]} cutoff from MCC's result: last All India Rank by branch for AIQ, deemed and DNB seats, per category.`,
  };
}
