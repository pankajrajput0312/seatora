import { optionsQuerySchema, parseProfile, parseQuery } from "@/features/decide/api";
import type { OptionFilters } from "@/features/decide/service";

/** Strict profile (rank required) and Options filters from the query (/api/v1/options and its CSV export); bad input fails (a 400). */
export function parseOptionsQuery(p: URLSearchParams) {
  const profile = parseProfile(p);
  const q = parseQuery(optionsQuerySchema, p, ["reach"]);
  if (!profile.success || !q.success) return { ok: false as const, errors: [profile.error, q.error] };
  const { page, pageSize, q: search, reach, prov, showClosed, hasSeats, view } = q.data;
  const filters: OptionFilters = { search, reach, includeProvisional: prov, showClosed, hasSeats, view };
  return { ok: true as const, profile: profile.data, filters, page, pageSize };
}
