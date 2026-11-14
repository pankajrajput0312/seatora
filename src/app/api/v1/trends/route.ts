import { handle, invalid, ok, pageOf, parseQuery, sourcesFor, trendsQuerySchema } from "@/features/decide/api";
import { allotmentTrends, getMeta, YEARS } from "@/features/decide/service";

/** Allotments made per option and year (every round, every category). Counts allotments, not seats. Paginated. */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(trendsQuerySchema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const { specialty, degree, page, pageSize } = q.data;
    const [meta, r] = await Promise.all([getMeta(), allotmentTrends({ specialty, degree }, { page, pageSize })]);
    return ok(r.rows, { page: pageOf(r), sources: sourcesFor(meta.sources.filter((s) => YEARS.includes(s.year))) });
  });
}
