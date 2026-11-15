import { optionsQuerySchema, parseProfile, parseQuery } from "@/features/decide/api";
import { termFilterLists, termFilters, termFilterShape } from "@/features/decide/lib/term-filters";
import type { OptionFilters } from "@/features/decide/service";

const schema = optionsQuerySchema.extend(termFilterShape);

/**
 * Strict profile (rank required) and Options filters from the query (/api/v1/options and its CSV export); bad input
 * fails (a 400). Term filters (lib/term-filters.ts): an absent maxfee / bondyrs is her profile's fee / bond cap.
 */
export function parseOptionsQuery(p: URLSearchParams) {
  const profile = parseProfile(p);
  const q = parseQuery(schema, p, ["reach", ...termFilterLists]);
  if (!profile.success || !q.success) return { ok: false as const, errors: [profile.error, q.error] };
  const { page, pageSize, q: search, reach, prov, showClosed, hasSeats, view, ...t } = q.data;
  const filters: OptionFilters = { search, reach, includeProvisional: prov, showClosed, hasSeats, view, terms: termFilters(t, profile.data) };
  return { ok: true as const, profile: profile.data, filters, page, pageSize };
}
