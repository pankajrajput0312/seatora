import { feesQuerySchema, handle, invalid, ok, pageOf, parseQuery, type Provenance } from "@/features/decide/api";
import { listFees } from "@/features/decide/service";

/** Fee, stipend, bond and seat-leaving penalty text per institute and program; each term carries its source document. */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(feesQuerySchema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const { program, state, maxFeeLakh, sort, page, pageSize } = q.data;
    const r = await listFees({ program, state, maxFeeLakh, sort }, { page, pageSize });
    const docs = r.rows.flatMap((x) => [x.fee, x.stipend, x.bond, x.penalty].flatMap((t) => (t ? [{ name: t.source.name, url: t.source.url }] : [])));
    const sources: Provenance[] = [...new Map(docs.map((d) => [d.url ?? d.name, d])).values()];
    return ok(r.rows, { page: pageOf(r), sources });
  });
}
