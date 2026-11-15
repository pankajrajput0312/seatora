import { gridRounds, handle, invalid, ok, pageOf, seatListSource, sourcesFor } from "@/features/decide/api";
import { getMeta, listOptions } from "@/features/decide/service";
import { parseOptionsQuery } from "./query";

/**
 * Options for a profile (rank required), labelled by reach, paginated; counts are per reach label before filtering.
 * Each row's `seats` is in `seatList` (the newest clear vacancy list; null when none), `seatsBy` per list of that round
 * in `seatLists` (clear, virtual, new): one list each, never kinds added. `reachBy` is the label on each of her seat
 * categories alone, `seatsBelow` the lists whose seats there are all on categories whose own label is not `reach`.
 * The same view and params as the Options page: `view` (round, all; default from the data), `hasSeats` (1 or a list
 * kind, any, 0/all), `showClosed`; the response says which applied (`view`, `seats`: null = with or without,
 * `showClosed`) and, in the round view, `summary` (her profile's options with seats in the round, search aside) and
 * `noState` (with a state filter, options with seats in the round it drops because their institute has no state).
 * Term filters (ctype, maxfee, minstip, bondyrs, maxbond, maxleave, nd: lib/term-filters.ts; an absent maxfee / bondyrs
 * is her profile's cap): `unknownTerms` counts her options left out only because a filtered value is not declared.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseOptionsQuery(new URL(req.url).searchParams);
    if (!q.ok) return invalid(...q.errors);
    const [meta, r] = await Promise.all([getMeta(), listOptions(q.profile, q.filters, { page: q.page, pageSize: q.pageSize })]);
    return ok(
      {
        rows: r.rows, counts: r.counts, hiddenClosed: r.hiddenClosed, hiddenProvisional: r.hiddenProvisional, seatList: r.seatList, seatLists: r.seatLists,
        view: r.view, seats: r.seats, showClosed: r.showClosed, summary: r.summary, noState: r.noState, unknownTerms: r.unknownTerms,
      },
      { page: pageOf(r), sources: [...sourcesFor(meta.sources, gridRounds(r.rows)), ...r.seatLists.flatMap(seatListSource)] },
    );
  });
}
