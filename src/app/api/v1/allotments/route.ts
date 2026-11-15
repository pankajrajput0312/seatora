import { allotmentsQuerySchema, handle, invalid, notFound, ok, pageOf, parseQuery, sourcesFor } from "@/features/decide/api";
import { getCollege, getMeta, listAllotments } from "@/features/decide/service";

/**
 * Allotments (rank, round, quota, seat category, institute, course; status, candidate category, choice no. and `prev`,
 * the seat one round back with its names and remark): ranks only, never names. Paginated (past the end: the last page).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(allotmentsQuerySchema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const { page, pageSize, college, ...f } = q.data;
    const inst = college ? await getCollege(college) : null;
    if (college && !inst) return notFound("No institute with this slug");
    const [meta, r] = await Promise.all([getMeta(), listAllotments(f, { page, pageSize }, inst?.key)]);
    return ok(r.rows, { page: pageOf(r), sources: sourcesFor(meta.sources, r.rows) });
  });
}
