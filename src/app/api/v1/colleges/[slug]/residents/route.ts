import { z } from "zod";
import { handle, invalid, ok, pageSchema, parseQuery, renamedOr404 } from "@/features/decide/api";
import { canSeeResidents, listResidents, residentsDenied } from "@/features/decide/server/residents";
import { getCollege } from "@/features/decide/service";

const querySchema = pageSchema.extend({ course: z.string().max(100).optional(), year: z.coerce.number().int().min(2000).max(2100).optional() });

/**
 * Names from MCC's admitted-candidates lists at one institute (name, course, year, list and, where known, the All India
 * Rank from that year's NBEMS NEET PG result, 2023-2025: `rankSource` = that result, in `sources`), one page at a time
 * (pageSize max 200). Never hidden rows; deliberately no endpoint across institutes; never cached.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const noStore = { "Cache-Control": "private, no-store" };
    if (!(await canSeeResidents())) return Response.json({ ok: false, error: { code: "locked", message: "Sign in with an allowed account." } }, { status: 401, headers: noStore });
    const no = await residentsDenied("read");
    if (no) return Response.json({ ok: false, error: { code: no, message: no === "plan_limit" ? "Today's residents reads on your plan are used up (more at 00:00 IST). See /pricing for the Season Pass." : no === "device_limit" ? "This device has used today's free residents reads (more at 00:00 IST). See /pricing for the Season Pass." : "Too many requests. Try again later." } }, { status: 429, headers: noStore });
    const q = parseQuery(querySchema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const slug = (await params).slug;
    const college = await getCollege(slug);
    if (college?.slug !== slug) return renamedOr404(req, slug); // an old slug: 308 to the new one
    const { page, pageSize, ...f } = q.data;
    const r = await listResidents(college.key, f, { page, pageSize });
    const res = ok(
      r.rows.map(({ name, year, list, rank, rankBasis, course, sourceKey }) => ({ name, year, list, rank, rankSource: rankBasis, course, source: sourceKey })),
      { page: { page, pageSize, total: r.total }, sources: r.sources.map((s) => ({ key: s.key, name: s.name, url: s.url, ...(s.year != null && { year: s.year }) })) },
    );
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  });
}
