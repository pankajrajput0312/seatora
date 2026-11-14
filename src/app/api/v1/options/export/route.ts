import { gridRounds, handle, invalid, sourcesFor } from "@/features/decide/api";
import { HISTORY_CAPTION } from "@/features/decide/components/bits";
import { eligibleCategories } from "@/features/decide/lib/reach";
import { listNotices } from "@/features/decide/server/notices";
import { seatChanges, seatLists } from "@/features/decide/server/seats";
import { getMeta, LATEST_YEAR, listOptions } from "@/features/decide/service";
import { parseOptionsQuery } from "../query";
import { optionsCsv } from "./csv";

/**
 * The Options view as a CSV download: the same profile and filters as /api/v1/options, every matching row (no paging),
 * behind the login like every /api/v1 route (handle), never cached.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseOptionsQuery(new URL(req.url).searchParams);
    if (!q.ok) return invalid(...q.errors);
    const [meta, r] = await Promise.all([getMeta(), listOptions(q.profile, q.filters)]);
    // The MCC seat notices of the round that may change each list, as SeatSource names them on the page.
    const l0 = r.seatLists[0];
    const [all, notices] = l0 ? await Promise.all([seatLists(), listNotices({ kind: "seat_matrix", year: l0.year, round: l0.round })]) : [[], []];
    const changes = r.seatLists.flatMap((l) => {
      const c = seatChanges(l, all, notices);
      return [
        ...c.later.map((n) => ({ name: n.title, url: n.url, note: `MCC notice dated ${n.date}, after the ${l.kind} list: not applied in it` })),
        ...c.sameDay.map((n) => ({ name: n.title, url: n.url, note: `MCC notice dated ${n.date}, the day of the ${l.kind} list: it may already include it` })),
      ];
    });
    const sources = [
      ...sourcesFor(meta.sources, gridRounds(r.rows)).map((s) => ({ name: s.name, url: s.url, note: s.provisional ? "Provisional" : undefined })),
      ...r.seatLists.map((l) => ({ name: l.name, url: l.url, note: l.publishedAt ? `MCC notice dated ${l.publishedAt}` : undefined })),
      ...changes,
    ];
    const notes = [
      HISTORY_CAPTION,
      `Closing = the highest All India Rank allotted in that round on a seat of that category; here ${eligibleCategories(q.profile.category, q.profile.pwd).join(" or ")} seats. ${LATEST_YEAR} R1 is that round alone; deepest = the deepest round of that year. "—" = not available.`,
      ...(r.seatLists.length
        ? ["Seat columns: separate MCC lists of one round, each in the option's quota and your seat categories. They overlap (a newly added seat is usually in the clear vacancy list too), so never add them. Each list is as its PDF printed it: later MCC seat notices are not applied (see Counselling, announcements)."]
        : []),
    ];
    const csv = optionsCsv(r.rows, { lists: r.seatLists, includeLatest: q.filters.includeProvisional !== false, notes, sources });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="seatora-options-air-${q.profile.rank}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
