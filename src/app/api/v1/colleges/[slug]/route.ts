import { gridRounds, handle, invalid, notFound, ok, parseOptionalProfile, seatListSource, sourcesFor, type Provenance } from "@/features/decide/api";
import { getInstitute, getMeta } from "@/features/decide/service";

/**
 * One institute: address, courses with closing-rank grids and seats in the newest clear vacancy list (`seatList`),
 * allotments per year, fee/stipend/bond/penalty with their sources.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const profile = parseOptionalProfile(new URL(req.url).searchParams);
    if (!profile.success) return invalid(profile.error);
    const [meta, inst] = await Promise.all([getMeta(), getInstitute((await params).slug, profile.data)]);
    if (!inst) return notFound("No institute with this slug");
    const docs = [inst.terms.md, inst.terms.dnb].flatMap((t) => Object.values(t).flatMap((x) => (x ? [{ name: x.source.name, url: x.source.url }] : [])));
    const termSources: Provenance[] = [...new Map(docs.map((d) => [d.url ?? d.name, d])).values()];
    return ok(inst, { sources: [...sourcesFor(meta.sources, gridRounds(inst.options)), ...termSources, ...seatListSource(inst.seatList)] });
  });
}
