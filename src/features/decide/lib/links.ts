import { profileParamKeys } from "../profile";

/**
 * One place for every cross-link between Decide screens, so related data is always one click away
 * and every link keeps the profile params (server pages render from them).
 */
export function decideLinks(params: URLSearchParams | string = "") {
  const src = new URLSearchParams(params);
  const keep = new URLSearchParams();
  for (const k of profileParamKeys) if (src.get(k)) keep.set(k, src.get(k)!);
  const to = (path: string, extra: Record<string, string | number | undefined | null> = {}, hash = "") => {
    const p = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, String(v));
    const qs = p.toString();
    return `${path}${qs ? `?${qs}` : ""}${hash}`;
  };
  return {
    to,
    institute: (slug: string, tab?: "overview" | "courses" | "allotments" | "fees" | "clinical") => to(`/decide/institutes/${slug}`, { tab }),
    lastRanks: (course: string, o: { category?: string; quota?: string; inst?: string } = {}) =>
      to("/decide/last-ranks", { course, lcat: o.category, lquota: o.quota, inst: o.inst }, o.inst ? `#inst-${o.inst}` : ""),
    allotments: (o: { course?: string; inst?: string; year?: number; round?: string; quota?: string; category?: string; from?: number; to?: number } = {}) =>
      to("/decide/allotments", { course: o.course, inst: o.inst, year: o.year, round: o.round, quota: o.quota, acat: o.category, from: o.from, to: o.to }),
    rankScan: (rank: number, year?: number) => to("/decide/rank-scan", { scan: rank, year }),
    options: (o: { q?: string; reach?: string; closed?: boolean } = {}) => to("/decide/options", { q: o.q, reach: o.reach, closed: o.closed ? "1" : undefined }),
    fees: (o: { program?: string; state?: string } = {}) => to("/decide/fees", o),
    compare: (ids: string[]) => to("/decide/compare", { ids: ids.join(",") }),
    institutes: (o: { course?: string; state?: string } = {}) => to("/decide/institutes", o),
  };
}
export type DecideLinks = ReturnType<typeof decideLinks>;
