import { z } from "zod";
import { optionsQuerySchema, parseProfile, parseQuery } from "@/features/decide/api";
import type { OptionFilters } from "@/features/decide/service";
import { seatKinds } from "@/features/decide/types";

/** /api/v1/options and its CSV export: `hasSeats` = 1/true (the clear vacancy list) or one list kind (clear, virtual, new). */
const schema = optionsQuerySchema.extend({
  hasSeats: z.enum(["0", "1", "true", "false", ...seatKinds]).transform((v) => (v === "1" || v === "true" ? "clear" : v === "0" || v === "false" ? undefined : v)).optional(),
});

/** Strict profile (rank required) and Options filters from the query; bad input fails (a 400). */
export function parseOptionsQuery(p: URLSearchParams) {
  const profile = parseProfile(p);
  const q = parseQuery(schema, p, ["reach"]);
  if (!profile.success || !q.success) return { ok: false as const, errors: [profile.error, q.error] };
  const { page, pageSize, q: search, reach, prov, showClosed, hasSeats } = q.data;
  const filters: OptionFilters = { search, reach, includeProvisional: prov, showClosed, hasSeats };
  return { ok: true as const, profile: profile.data, filters, page, pageSize };
}
