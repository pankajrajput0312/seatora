import { handle, invalid, ok, pageOf, pageSchema, parseQuery, type Provenance } from "@/features/decide/api";
import { termFilterLists } from "@/features/decide/lib/term-filters";
import { feesFilters, feesParamsSchema } from "@/features/decide/components/fees-view";
import { listFees } from "@/features/decide/service";

/** The Fees & bond page's params (components/fees-view.ts), strictly: a bad value is a 400. */
const feesQuerySchema = pageSchema.extend(feesParamsSchema.shape);

/** Fees, stipend and bond per institute and programme (normalized, server/terms.ts); each figure numbers its source. No profile defaults. */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(feesQuerySchema, new URL(req.url).searchParams, [...termFilterLists]);
    if (!q.success) return invalid(q.error);
    const { page, pageSize, ...f } = q.data;
    const r = await listFees(feesFilters(f, { programmes: null, states: null, maxFeeLakh: null, maxBondYears: null }), { page, pageSize });
    const docs = r.rows.flatMap((x) => x.terms.sources.map((s) => ({ name: s.label, url: s.url })));
    const sources: Provenance[] = [...new Map(docs.map((d) => [d.url ?? d.name, d])).values()];
    return ok(r.rows, { page: pageOf(r), sources });
  });
}
