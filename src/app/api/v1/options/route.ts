import { gridRounds, handle, invalid, ok, optionsQuerySchema, pageOf, parseProfile, parseQuery, seatListSource, sourcesFor } from "@/features/decide/api";
import { getMeta, listOptions } from "@/features/decide/service";

/**
 * Options for a profile (rank required), labelled by reach, paginated; counts are per reach label before filtering.
 * Each row's `seats` is in `seatList` (the newest clear vacancy list; null when none): one list, never kinds added.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const profile = parseProfile(p);
    const q = parseQuery(optionsQuerySchema, p, ["reach"]);
    if (!profile.success || !q.success) return invalid(profile.error, q.error);
    const { page, pageSize, q: search, reach, prov, showClosed, hasSeats } = q.data;
    const [meta, r] = await Promise.all([getMeta(), listOptions(profile.data, { search, reach, includeProvisional: prov, showClosed, hasSeats }, { page, pageSize })]);
    return ok(
      { rows: r.rows, counts: r.counts, hiddenClosed: r.hiddenClosed, hiddenProvisional: r.hiddenProvisional, seatList: r.seatList },
      { page: pageOf(r), sources: [...sourcesFor(meta.sources, gridRounds(r.rows)), ...seatListSource(r.seatList)] },
    );
  });
}
