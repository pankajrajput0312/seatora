import { rankFit, type RankFit } from "@/features/rank-predictor/lib/rank-fit";
import type { Resident, ResidentCategory } from "../schema";

export type ResidentFilters = { rank: number | null; category: ResidentCategory | "All"; query: string };
export type ResidentMatch = Resident & { fit: RankFit | null };

/** Filters residents and, when a rank is given, orders them by how close their rank was to it. */
export function matchResidents(list: Resident[], { rank, category, query }: ResidentFilters): ResidentMatch[] {
  const q = query.trim().toLowerCase();
  return list
    .filter((r) => category === "All" || r.category === category)
    .filter((r) => !q || [r.name, r.college, r.course, r.state ?? ""].some((f) => f.toLowerCase().includes(q)))
    .map((r) => ({ ...r, fit: rank ? rankFit(rank, r.rank) : null }))
    .sort((a, b) => (rank ? Math.abs(a.rank - rank) - Math.abs(b.rank - rank) : 0) || a.rank - b.rank);
}

export const fitLabel: Record<RankFit, string> = {
  inside: "Your rank is ahead",
  near: "Within 10% of yours",
  beyond: "Your rank is behind",
};
