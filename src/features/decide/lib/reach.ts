import type { BaseCategory, Category, Cutoff, Round } from "../types";

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

export const reachOrder = ["reached-latest", "reached-both", "reached-one", "within-10", "closed-before", "no-data"] as const;
export type Reach = (typeof reachOrder)[number];

/**
 * History-only label for how a rank compares with past closing ranks. "Reached" means the rank was within the
 * closing rank of that round. Never a chance or prediction.
 */
export function classifyReach(
  rank: number,
  cutoffs: Cutoff[],
  { latestYear, pastYears, includeLatest }: { latestYear: number; pastYears: [number, number]; includeLatest: boolean },
): Reach {
  // Only the years and rounds the labels talk about: the two past years, plus the latest year's R1.
  const used = cutoffs.filter((c) => pastYears.includes(c.year) || (includeLatest && c.year === latestYear && c.round === "R1"));
  if (used.length === 0) return "no-data";
  const reachedIn = (y: number) => used.some((c) => c.year === y && c.closing >= rank);
  if (includeLatest && used.some((c) => c.year === latestYear && c.round === "R1" && c.closing >= rank)) return "reached-latest";
  const [a, b] = pastYears;
  if (reachedIn(a) && reachedIn(b)) return "reached-both";
  if (reachedIn(a) || reachedIn(b)) return "reached-one";
  // Agreed definition (neetpg-planner export_her.py): closing within 10% of her rank, i.e. closing >= rank * 0.9.
  if (used.some((c) => c.closing >= rank * 0.9)) return "within-10";
  return "closed-before";
}

export function reachLabel(reach: Reach, latestYear: number, pastYears: [number, number]): string {
  return {
    "reached-latest": `Reached in ${latestYear} R1`,
    "reached-both": `Reached in ${pastYears[0]} and ${pastYears[1]}`,
    "reached-one": "Reached in one year",
    "within-10": "Within 10% in a past round",
    "closed-before": "Closed before your rank",
    "no-data": "No past allotment in your categories",
  }[reach];
}

export const reachTone: Record<Reach, "info" | "neutral" | "warning"> = {
  "reached-latest": "info",
  "reached-both": "info",
  "reached-one": "neutral",
  "within-10": "warning",
  "closed-before": "neutral",
  "no-data": "neutral",
};
