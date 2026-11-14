import { cutoffsQuerySchema, gridRounds, handle, invalid, ok, pageOf, parseQuery, sourcesFor } from "@/features/decide/api";
import { getMeta, lastRanks } from "@/features/decide/service";

/** Last ranks: every institute's closing rank by year and round for one specialty (optionally degree, quota, seat category, years). */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(cutoffsQuerySchema, new URL(req.url).searchParams, ["years"]);
    if (!q.success) return invalid(q.error);
    const { specialty, degree, quota, category, years, page, pageSize } = q.data;
    const [meta, r] = await Promise.all([getMeta(), lastRanks({ specialty, degree, quota, category }, { page, pageSize })]);
    const rows = years.length ? r.rows.map((x) => ({ ...x, grid: Object.fromEntries(Object.entries(x.grid).filter(([y]) => years.includes(Number(y)))) })) : r.rows;
    return ok(rows, { page: pageOf(r), sources: sourcesFor(meta.sources, gridRounds(rows)) });
  });
}
