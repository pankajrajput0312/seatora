/**
 * Where a rank sits against a previous-year closing rank. Lower rank is better.
 * Describes history only; never a prediction (docs/DATA_INTEGRITY.md).
 */
export type RankFit = "inside" | "near" | "beyond";

export function rankFit(rank: number, closingRank: number | null, margin = 0.1): RankFit | null {
  if (closingRank == null) return null;
  if (rank <= closingRank * (1 - margin)) return "inside";
  if (rank <= closingRank * (1 + margin)) return "near";
  return "beyond";
}

export const rankFitLabel: Record<RankFit, string> = {
  inside: "Inside last closing rank",
  near: "Near last closing rank",
  beyond: "Beyond last closing rank",
};
