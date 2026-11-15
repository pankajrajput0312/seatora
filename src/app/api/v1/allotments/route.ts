import { z } from "zod";
import { allotmentsQuerySchema, handle, invalid, notFound, ok, pageOf, parseQuery, sourcesFor } from "@/features/decide/api";
import { termFilterLists, termFilters, termFilterShape } from "@/features/decide/lib/term-filters";
import { getCollege, getMeta, listAllotments } from "@/features/decide/service";

/**
 * Allotments (rank, round, quota, seat category, institute, course; status, candidate category, choice no. and `prev`,
 * the seat one round back with its names and remark): ranks only, never names. Paginated (past the end: the last page).
 * Term filters on each allotment's course and quota: ctype, maxfee, minstip, bondyrs, maxbond, maxleave, nd
 * (lib/term-filters.ts; an absent cap is no cap). Each row has `fees` (its course and quota's terms) and `hospital`.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const q = parseQuery(allotmentsQuerySchema, p);
    const t = parseQuery(z.object(termFilterShape), p, [...termFilterLists]);
    if (!q.success || !t.success) return invalid(q.error, t.error);
    const { page, pageSize, college, ...f } = q.data;
    const inst = college ? await getCollege(college) : null;
    if (college && !inst) return notFound("No institute with this slug");
    const [meta, r] = await Promise.all([getMeta(), listAllotments({ ...f, terms: termFilters(t.data) }, { page, pageSize }, inst?.key)]);
    return ok(r.rows, { page: pageOf(r), sources: sourcesFor(meta.sources, r.rows) });
  });
}
