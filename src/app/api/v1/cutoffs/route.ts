import { cutoffsQuerySchema, gridRounds, handle, invalid, ok, pageOf, parseQuery, sourcesFor } from "@/features/decide/api";
import { getMeta, lastRanks } from "@/features/decide/service";

/**
 * Last ranks: every institute's closing rank by year and round for one specialty (optionally degree, quota, seat
 * category, years). `years` filters before paging, so `total`, every field and `sources` cover only those years;
 * `columns` lists the years and rounds with data, `empty` counts options with no closing on that category.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(cutoffsQuerySchema, new URL(req.url).searchParams, ["years"]);
    if (!q.success) return invalid(q.error);
    const { specialty, degree, quota, category, years, page, pageSize } = q.data;
    const [meta, r] = await Promise.all([getMeta(), lastRanks({ specialty, degree, quota, category, years }, { page, pageSize })]);
    return ok({ rows: r.rows, columns: r.columns, empty: r.empty }, { page: pageOf(r), sources: sourcesFor(meta.sources, gridRounds(r.rows)) });
  });
}
