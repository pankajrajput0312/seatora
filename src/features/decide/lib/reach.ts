import { formatRank } from "@/features/cutoffs/lib/format";
import { roundLabel, type BaseCategory, type Category, type Cutoff, type Round, type SeatKind } from "../types";

/** The years the labels compare (client-safe; service.ts re-exports them). They match the imported MCC results. */
export const LATEST_YEAR = 2026;
export const PAST_YEARS: [number, number] = [2024, 2025];
export const YEARS = [2024, 2025, 2026];

/** Seat categories a candidate can be allotted: Open always, their own category, and PwD seats if PwD. */
export function eligibleCategories(category: BaseCategory, pwd: boolean): Category[] {
  const base: Category[] = category === "Open" ? ["Open"] : ["Open", category];
  return pwd ? [...base, ...base.map((c) => `${c} PwD` as Category)] : base;
}

export type Deepest = { closing: number; round: Round; category: Category; provisional: boolean };

/** Highest (deepest) closing rank per year across rounds, among the given cutoffs. */
export function deepestByYear(cutoffs: Cutoff[], provisionalSrc: Set<string>): Map<number, Deepest> {
  const out = new Map<number, Deepest>();
  for (const c of cutoffs) {
    const cur = out.get(c.year);
    if (!cur || c.closing > cur.closing) {
      out.set(c.year, { closing: c.closing, round: c.round, category: c.category, provisional: provisionalSrc.has(c.src) });
    }
  }
  return out;
}

export type GridCell = { closing: number; category: Category; n: number; provisional: boolean };

/**
 * Year × round grid. Closing (and its seat category) comes from the categories she can take; the bracketed
 * count is allotments made that round across ALL categories (the planner judge's rule: every category counts).
 */
export function buildGrid(all: Cutoff[], eligible: Set<string> | null, provisionalSrc: Set<string>) {
  const grid: Record<number, Partial<Record<Round, GridCell>>> = {};
  for (const c of all) {
    const cell = ((grid[c.year] ??= {})[c.round] ??= { closing: 0, category: c.category, n: 0, provisional: provisionalSrc.has(c.src) });
    cell.n += c.n;
    if ((!eligible || eligible.has(c.category)) && c.closing > cell.closing) Object.assign(cell, { closing: c.closing, category: c.category });
  }
  // Drop cells where none of her categories had an allotment, but keep the year if any cell remains.
  for (const y of Object.keys(grid)) {
    for (const r of Object.keys(grid[+y]) as Round[]) if (!grid[+y][r]!.closing) delete grid[+y][r];
    if (!Object.keys(grid[+y]).length) delete grid[+y];
  }
  return grid;
}

/** What a reach label reads from a cutoff (a raw cutoff, or a per-year deepest closing whose round may be unknown). */
export type ReachInput = Pick<Cutoff, "year" | "closing"> & { round?: Round; category?: Category };

/**
 * "new": an option with no past allotment at all (no row in any MCC result in the data, any year, round or seat
 * category), listed only because the newest round's seat lists print seats for it (Options' round view). classifyReach
 * never returns it. The chips' order; the round view sorts by roundReachOrder.
 */
export const reachOrder = ["reached-latest", "reached-both", "reached-one", "within-10", "stray-only", "closed-before", "no-data", "new"] as const;
export type Reach = (typeof reachOrder)[number];
/** Options' round view sort: what she can realistically get first; unknown (new, no allotment on her seats) before closed before her rank. */
export const roundReachOrder: readonly Reach[] = ["reached-latest", "reached-both", "reached-one", "within-10", "stray-only", "new", "no-data", "closed-before"];

/**
 * Stray and special stray rounds fill leftover seats, often far below the rank that closed R1 to R3, so they never make an
 * option "reached": a rank reached only there is "stray-only". A cutoff with no round (a per-year deepest from SQL,
 * findReachInputs) is from R1 to R3.
 */
export const isStrayRound = (round: Round | undefined) => round === "stray" || round === "special_stray";

/** The MCC results in the data, e.g. "2023 to 2026 R1": oldest year to the newest year's last round (`years` newest first, as meta.years). */
export function resultsSpan(years: { year: number; rounds: readonly Round[] }[]) {
  if (!years.length) return "";
  const [last, first] = [years[0], years.at(-1)!];
  const end = `${last.year}${last.rounds.length ? ` ${roundLabel[last.rounds.at(-1)!]}` : ""}`;
  return first.year === last.year ? end : `${first.year} to ${end}`;
}

type Window = { latestYear: number; pastYears: [number, number]; includeLatest: boolean };
/** Only the years and rounds the labels talk about: the two past years, plus the latest year's R1. */
const inWindow = <T extends ReachInput>(cutoffs: T[], { latestYear, pastYears, includeLatest }: Window) =>
  cutoffs.filter((c) => pastYears.includes(c.year) || (includeLatest && c.year === latestYear && c.round === "R1"));

/** The closing a label rests on, so a second label can say it with its year and round ("2025 R3 closed at 38,120"). */
export type ReachAt = { year: number; round?: Round; closing: number };
/**
 * The deepest closing a label counts (classifyReach's window): R1 to R3, or every round for "stray-only" or when only
 * stray rounds are there. Null: no closing in the window ("no-data").
 */
export function reachEvidence(cutoffs: ReachInput[], reach: Reach, window: Window): ReachAt | null {
  const used = inWindow(cutoffs, window);
  const main = used.filter((c) => !isStrayRound(c.round));
  const pool = reach === "stray-only" || !main.length ? used : main;
  return pool.reduce<ReachAt | null>((a, c) => (!a || c.closing > a.closing ? { year: c.year, round: c.round, closing: c.closing } : a), null);
}

/**
 * History-only label for how a rank compares with past closing ranks. "Reached" means the rank was within the
 * closing rank of that round, R1 to R3 only (isStrayRound). Never a chance or prediction.
 */
export function classifyReach(
  rank: number,
  cutoffs: ReachInput[],
  { latestYear, pastYears, includeLatest }: { latestYear: number; pastYears: [number, number]; includeLatest: boolean },
): Reach {
  const used = inWindow(cutoffs, { latestYear, pastYears, includeLatest });
  if (used.length === 0) return "no-data";
  const main = used.filter((c) => !isStrayRound(c.round));
  const reachedIn = (y: number) => main.some((c) => c.year === y && c.closing >= rank);
  if (includeLatest && main.some((c) => c.year === latestYear && c.round === "R1" && c.closing >= rank)) return "reached-latest";
  const [a, b] = pastYears;
  if (reachedIn(a) && reachedIn(b)) return "reached-both";
  if (reachedIn(a) || reachedIn(b)) return "reached-one";
  if (used.some((c) => c.closing >= rank)) return "stray-only";
  // Agreed definition (neetpg-planner export_her.py): closing within 10% of her rank, i.e. closing >= rank * 0.9.
  if (main.some((c) => c.closing >= rank * 0.9)) return "within-10";
  return "closed-before";
}

/** The rounds the labels count, e.g. "2024, 2025 and 2026 R1" (older years show in the grids but are not counted). */
export const reachWindow = (latestYear: number, [a, b]: [number, number], includeLatest = true, or = false) =>
  includeLatest ? `${a}, ${b} ${or ? "or" : "and"} ${latestYear} R1` : `${a} ${or ? "or" : "and"} ${b}`;

/**
 * `includeLatest` false: the labels were made without the latest year's R1 (Options' "leave out provisional"). `on`: the
 * label is on that one seat category (a Seats row), not on all of hers together.
 */
export function reachLabel(reach: Reach, latestYear: number, pastYears: [number, number], includeLatest = true, on?: string): string {
  return {
    "reached-latest": `Reached in ${latestYear} R1`,
    "reached-both": `Reached in ${pastYears[0]} and ${pastYears[1]}`,
    "reached-one": `Reached in ${pastYears[0]} or ${pastYears[1]}`,
    "within-10": "Within 10% in a past round",
    "stray-only": "Reached only in stray rounds",
    "closed-before": "Closed before your rank",
    "no-data": `No allotment ${on ? `on ${on} seats` : "in your categories"} in ${reachWindow(latestYear, pastYears, includeLatest, true)}`,
    new: "New: no past allotment",
  }[reach];
}

/**
 * A list whose seats at an option, in her seat categories, are all on categories (`on`, each with its own label and the
 * closing it rests on, `at`) whose label is not the option's.
 */
export type SeatsBelow = { kind: SeatKind; on: { category: string; reach: Reach; at?: ReachAt | null }[] };

/**
 * Options label an option on all her seat categories together; a list's seats there can all be on a category whose own
 * label differs (e.g. "Reached in 2026 R1" from OBC seats, while the clear vacancy list prints only Open seats there,
 * where it closed before her rank). `reachBy`: the label on each of her categories alone; `seatCats`: per list kind,
 * her categories with seats in it; `at`: per category, the closing its label rests on (reachEvidence).
 */
export const seatsBelow = (reach: Reach, reachBy: Partial<Record<string, Reach>>, seatCats: Partial<Record<SeatKind, string[]>>, at?: Partial<Record<string, ReachAt | null>>): SeatsBelow[] =>
  Object.entries(seatCats).flatMap(([kind, cats]) =>
    cats?.length && cats.every((c) => (reachBy[c] ?? "no-data") !== reach)
      ? [{ kind: kind as SeatKind, on: cats.map((c) => ({ category: c, reach: reachBy[c] ?? "no-data", ...(at && { at: at[c] ?? null }) })) }]
      : [],
  );

const kindWords: Record<SeatKind, string> = { clear: "clear vacancy", virtual: "virtual vacancy", new: "newly added" };
const atVerdict: Partial<Record<Reach, string>> = {
  "reached-latest": "reached your rank",
  "reached-both": "reached your rank",
  "reached-one": "reached your rank",
  "stray-only": "reached your rank only in a stray round",
  "within-10": "before your rank, within 10%",
  "closed-before": "before your rank",
};

/**
 * The notes under an option's one label, a list kind each (kinds with the same seats merged), every fact with its year
 * and round, so they never read against the label: "In the clear and virtual vacancy lists, the seats here you can take
 * are Open seats only. On Open seats: deepest closing 38,120 in 2025 R3, before your rank."
 */
export function seatsBelowNotes(ns: SeatsBelow[], latestYear: number, pastYears: [number, number], includeLatest = true): string[] {
  const groups = new Map<string, SeatsBelow[]>();
  for (const n of ns) {
    const k = JSON.stringify(n.on);
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return [...groups.values()].map((g) => {
    const kinds = g.map((n) => kindWords[n.kind]);
    const lists = `${kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)} lists` : `${kinds[0]} list`}`;
    const on = g[0].on;
    const facts = on.map(({ category, reach, at }) => {
      const verdict = atVerdict[reach];
      if (at && verdict) return `On ${category} seats: deepest closing ${formatRank(at.closing)} in ${at.year}${at.round ? ` ${roundLabel[at.round]}` : ""}, ${verdict}.`;
      if (verdict) return `On ${category} seats alone: ${reachLabel(reach, latestYear, pastYears, includeLatest, category)}.`;
      return `On ${category} seats: no allotment in ${reachWindow(latestYear, pastYears, includeLatest, true)}.`;
    });
    return `In the ${lists}, the seats here you can take are ${on.map((x) => x.category).join(" and ")} seats only. ${facts.join(" ")}`;
  });
}

export const reachTone: Record<Reach, "info" | "neutral" | "warning"> = {
  "reached-latest": "info",
  "reached-both": "info",
  "reached-one": "neutral",
  "within-10": "warning",
  "stray-only": "warning",
  "closed-before": "neutral",
  "no-data": "neutral",
  new: "neutral",
};
