import { gridRounds, handle, invalid, ok, pageOf, seatListSource, sourcesFor } from "@/features/decide/api";
import { getMeta, listOptions } from "@/features/decide/service";
import { parseOptionsQuery } from "./query";

/**
 * Options for a profile (rank required), labelled by reach, paginated; counts are per reach label before filtering.
 * Each row's `seats` is in `seatList` (the newest clear vacancy list; null when none), `seatsBy` per list of that round
 * in `seatLists` (clear, virtual, new): one list each, never kinds added. `hasSeats` = 1 or a list kind. `reachBy` is
 * the label on each of her seat categories alone, `seatsBelow` the lists whose seats there are all on categories whose
 * own label is not `reach`.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseOptionsQuery(new URL(req.url).searchParams);
    if (!q.ok) return invalid(...q.errors);
    const [meta, r] = await Promise.all([getMeta(), listOptions(q.profile, q.filters, { page: q.page, pageSize: q.pageSize })]);
    return ok(
      { rows: r.rows, counts: r.counts, hiddenClosed: r.hiddenClosed, hiddenProvisional: r.hiddenProvisional, seatList: r.seatList, seatLists: r.seatLists },
      { page: pageOf(r), sources: [...sourcesFor(meta.sources, gridRounds(r.rows)), ...r.seatLists.flatMap(seatListSource)] },
    );
  });
}
