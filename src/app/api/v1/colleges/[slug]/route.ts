import { gridRounds, handle, invalid, ok, parseOptionalProfile, renamedOr404, seatListSource, sourcesFor, type Provenance } from "@/features/decide/api";
import { getInstitute, getMeta } from "@/features/decide/service";
import { deviceAid } from "@/features/funnel/service";
import { checkAndCount, currentPlan } from "@/features/plans/usage";

/**
 * One institute: address, courses with closing-rank grids and seats in the newest clear vacancy list (`seatList`),
 * allotments per year, fee/stipend/bond/penalty with their sources.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const profile = parseOptionalProfile(new URL(req.url).searchParams);
    if (!profile.success) return invalid(profile.error);
    const [meta, inst] = await Promise.all([getMeta(), getInstitute((await params).slug, profile.data)]);
    if (!inst) return renamedOr404(req, (await params).slug);
    // Counts like the institute page (the plan's distinct institutes a day).
    const me = await currentPlan();
    const view = me && (await checkAndCount(me.user.id, "institutes", inst.college.key, { account: me.user, aid: await deviceAid() }));
    if (view && !view.allowed)
      return Response.json(
        view.device
          ? { ok: false, error: { code: "device_limit", message: `This device has used today's ${view.limit} free institutes (more at 00:00 IST). See /pricing for the Season Pass.` } }
          : { ok: false, error: { code: "plan_limit", message: `Today's ${view.limit} institutes on your plan are used up (more at 00:00 IST). See /pricing for the Season Pass.` } },
        { status: 429, headers: { "Cache-Control": "private, no-store" } },
      );
    const docs = [inst.terms.md, inst.terms.dnb].flatMap((t) => Object.values(t).flatMap((x) => (x ? [{ name: x.source.name, url: x.source.url }] : [])));
    const termSources: Provenance[] = [...new Map(docs.map((d) => [d.url ?? d.name, d])).values()];
    return ok(inst, { sources: [...sourcesFor(meta.sources, gridRounds(inst.options)), ...termSources, ...seatListSource(inst.seatList)] });
  });
}
