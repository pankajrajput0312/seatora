import { CSV_MAX_ROWS, gridRounds, handle, invalid, sourcesFor, tooManyRows } from "@/features/decide/api";
import { HISTORY_CAPTION } from "@/features/decide/components/bits";
import { eligibleCategories, latestRound, latestText, resultsSpan } from "@/features/decide/lib/reach";
import { listNotices } from "@/features/decide/server/notices";
import { seatChanges, seatLists } from "@/features/decide/server/seats";
import { getMeta, listOptions } from "@/features/decide/service";
import { parseOptionsQuery } from "../query";
import { optionsCsv, roundViewNote } from "./csv";
import { planCap, planRequired } from "@/features/plans/usage";

/**
 * The Options view as a CSV download: the same profile and filters as /api/v1/options, every matching row (`page` and
 * `pageSize` are ignored; more than CSV_MAX_ROWS is a 400), behind the login like every /api/v1 route (handle), never cached.
 */
export async function GET(req: Request) {
  return handle(async () => {
    if (!(await planCap("csv"))) return planRequired("CSV export");
    const q = parseOptionsQuery(new URL(req.url).searchParams);
    if (!q.ok) return invalid(...q.errors);
    // One page one row past the cap: every row when they fit, and only that many built when they don't.
    const [meta, r] = await Promise.all([getMeta(), listOptions(q.profile, q.filters, { page: 1, pageSize: CSV_MAX_ROWS + 1 })]);
    if (r.total > CSV_MAX_ROWS) return tooManyRows(r.total);
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
    const latest = latestRound(meta.sources);
    const sources = [
      ...sourcesFor(meta.sources, gridRounds(r.rows)).map((s) => ({ name: s.name, url: s.url, note: s.provisional ? "Provisional" : undefined })),
      ...r.seatLists.map((l) => ({ name: l.name, url: l.url, note: l.publishedAt ? `MCC notice dated ${l.publishedAt}` : undefined })),
      ...changes,
    ];
    const notes = [
      HISTORY_CAPTION,
      `Closing = the highest All India Rank allotted in that round on a seat of that category; here ${eligibleCategories(q.profile.category, q.profile.pwd).join(" or ")} seats. ${latestText(latest)} is ${latest.round === "R1" ? "that round alone" : "the deepest of those rounds"}; deepest = the deepest round of that year. "—" = not available.`,
      ...(r.seatLists.length
        ? ["Seat columns: separate MCC lists of one round, each in the option's quota and your seat categories. They overlap (a newly added seat is usually in the clear vacancy list too), so never add them. Each list is as its PDF printed it: later MCC seat notices are not applied (see Counselling, announcements)."]
        : []),
      ...(r.summary && l0 ? [roundViewNote(l0, r.summary, r.seats, resultsSpan(meta.years), r.noState)] : []),
    ];
    const csv = optionsCsv(r.rows, { lists: r.seatLists, latest, includeLatest: q.filters.includeProvisional !== false, notes, sources });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="seatora-options-air-${q.profile.rank}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
