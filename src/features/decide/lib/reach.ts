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
  const used = includeLatest ? cutoffs : cutoffs.filter((c) => c.year !== latestYear);
  if (used.length === 0) return "no-data";
  const reachedIn = (y: number) => used.some((c) => c.year === y && c.closing >= rank);
  if (includeLatest && used.some((c) => c.year === latestYear && c.round === "R1" && c.closing >= rank)) return "reached-latest";
  const [a, b] = pastYears;
  if (reachedIn(a) && reachedIn(b)) return "reached-both";
  if (reachedIn(a) || reachedIn(b)) return "reached-one";
  if (used.some((c) => c.closing * 1.1 >= rank)) return "within-10";
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
