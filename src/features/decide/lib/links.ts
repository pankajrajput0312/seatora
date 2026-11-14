import { keepProfileParams, profileParamKeys } from "../profile";

type Extra = Record<string, string | number | undefined | null>;

const href = (path: string, p: URLSearchParams, hash = "") => {
  const qs = p.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash}`;
};

/**
 * One place for every link between Decide screens: each link keeps the profile params (server pages render from
 * them), with repeated values kept (sp=A&sp=B becomes sp=A,B). Server: decideLinks(params). Client: useDecideLinks().
 * Page filters never reuse a profile key (rank, cat, pwd, sp, deg, c, quota, st, fee, bond), or they would leak into her
 * profile on the next link: Allotments' quota filter is `aq`, its seat category `acat`; Last ranks uses lcat/lquota.
 */
export function decideLinks(params: URLSearchParams | string = "") {
  const src = new URLSearchParams(params);
  const keep = keepProfileParams(src);
  /** Profile params + `extra` (empty values dropped). */
  const to = (path: string, extra: Extra = {}, hash = "") => {
    const p = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, String(v));
    return href(path, p, hash);
  };
  /** Every current param (page filters too) with `changes` applied; null or "" removes a param. */
  const withChanges = (path: string, changes: Extra = {}, hash = "") => {
    const p = new URLSearchParams(keep);
    for (const [k, v] of src) if (!(profileParamKeys as readonly string[]).includes(k)) p.append(k, v);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    return href(path, p, hash);
  };
  return {
    to,
    with: withChanges,
    /** Same page and filters, another page number (page 1 drops the param). */
    page: (path: string, n: number) => withChanges(path, { page: n > 1 ? n : null }),
    institute: (slug: string, tab?: "overview" | "courses" | "allotments" | "fees" | "clinical", extra: Extra = {}) => to(`/decide/institutes/${slug}`, { tab, ...extra }),
    lastRanks: (course: string, o: { category?: string; quota?: string; inst?: string } = {}) =>
      to("/decide/last-ranks", { course, lcat: o.category, lquota: o.quota, inst: o.inst }, o.inst ? `#inst-${o.inst}` : ""),
    allotments: (o: { course?: string; inst?: string; year?: number; round?: string; quota?: string; category?: string; state?: string; from?: number; to?: number } = {}) =>
      to("/decide/allotments", { course: o.course, inst: o.inst, year: o.year, round: o.round, aq: o.quota, acat: o.category, state: o.state, from: o.from, to: o.to }),
    rankScan: (rank: number, year?: number) => to("/decide/rank-scan", { scan: rank, year }),
    /** `all`: the view of every option with past allotments (view=all), whose counts the Overview shows. */
    options: (o: { q?: string; reach?: string; closed?: boolean; all?: boolean } = {}) =>
      to("/decide/options", { q: o.q, reach: o.reach, closed: o.closed ? "1" : undefined, view: o.all ? "all" : undefined }),
    /** One seat list (the one-list view: its count is that list's); with inst + course (+ quota: `squota`) only that option's seats. */
    seats: (o: { list?: string; inst?: string; course?: string; quota?: string } = {}) => to("/decide/seats", { view: "list", list: o.list, inst: o.inst, course: o.course, squota: o.quota }),
    fees: (o: { program?: string; state?: string } = {}) => to("/decide/fees", o),
    compare: (ids: string[]) => to("/decide/compare", { ids: ids.join(",") }),
    institutes: (o: { course?: string; state?: string } = {}) => to("/decide/institutes", o),
    choices: () => to("/decide/choices"),
  };
}
export type DecideLinks = ReturnType<typeof decideLinks>;
