import { rankFit, type RankFit } from "@/features/rank-predictor/lib/rank-fit";
import type { Resident } from "../schema";

export type ResidentMatch = Resident & { fit: RankFit | null };
export type CollegeGroup = { college: string; state?: string; residents: ResidentMatch[] };

/**
 * Groups residents by college. With a rank, colleges are ordered by their resident whose rank was closest to it
 * (and residents within a college likewise); without one, by college name.
 */
export function groupByCollege(list: Resident[], { rank, query }: { rank: number | null; query: string }): CollegeGroup[] {
  const q = query.trim().toLowerCase();
  const distance = (r: Resident) => (rank ? Math.abs(r.rank - rank) : 0);
  const groups = new Map<string, CollegeGroup>();

  for (const r of list) {
    if (q && ![r.name, r.college, r.course, r.state ?? ""].some((f) => f.toLowerCase().includes(q))) continue;
    const key = `${r.college}|${r.state ?? ""}`;
    const g = groups.get(key) ?? { college: r.college, state: r.state, residents: [] };
    g.residents.push({ ...r, fit: rank ? rankFit(rank, r.rank) : null });
    groups.set(key, g);
  }

  const out = [...groups.values()];
  for (const g of out) g.residents.sort((a, b) => distance(a) - distance(b) || a.rank - b.rank);
  return out.sort((a, b) => distance(a.residents[0]) - distance(b.residents[0]) || a.college.localeCompare(b.college));
}

export const fitLabel: Record<RankFit, string> = {
  inside: "Your rank is ahead",
  near: "Within 10% of yours",
  beyond: "Your rank is behind",
};
