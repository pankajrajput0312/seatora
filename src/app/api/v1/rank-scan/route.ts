import { handle, invalid, ok, parseQuery, rankScanQuerySchema, sourcesFor } from "@/features/decide/api";
import { getMeta, rankScan } from "@/features/decide/service";

/** Allotments to ranks within ±window of a rank in one year, grouped by round. */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(rankScanQuerySchema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const meta = await getMeta();
    const year = q.data.year ?? meta.years[0]?.year ?? new Date().getFullYear();
    const groups = await rankScan(q.data.rank, year, q.data.window);
    return ok(groups, { sources: sourcesFor(meta.sources, groups.map((g) => ({ year, round: g.round }))) });
  });
}
