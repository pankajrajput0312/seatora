import { allotmentsQuerySchema, handle, invalid, notFound, ok, parseQuery, sourcesFor } from "@/features/decide/api";
import { getCollege, getMeta, listAllotments } from "@/features/decide/service";

/** Allotments (rank, round, quota, seat category, institute, course): ranks only, never names. Paginated. */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(allotmentsQuerySchema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const { page, pageSize, college, ...f } = q.data;
    const inst = college ? await getCollege(college) : null;
    if (college && !inst) return notFound("No institute with this slug");
    const [meta, { total, rows }] = await Promise.all([getMeta(), listAllotments(f, pageSize, inst?.key, (page - 1) * pageSize)]);
    return ok(rows, { page: { page, pageSize, total }, sources: sourcesFor(meta.sources, rows) });
  });
}
