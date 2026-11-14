import { collegesQuerySchema, handle, invalid, ok, pageOf, parseOptionalProfile, parseQuery, sourcesFor } from "@/features/decide/api";
import { getMeta, listInstitutes, YEARS } from "@/features/decide/service";

/** Institutes with courses, quotas and 2025 allotments, paginated; best reach (and the option it comes from) when a profile is given. */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const profile = parseOptionalProfile(p);
    const q = parseQuery(collegesQuerySchema, p);
    if (!profile.success || !q.success) return invalid(profile.error, q.error);
    const { page, pageSize, q: search, state, course, sort } = q.data;
    const [meta, r] = await Promise.all([getMeta(), listInstitutes(profile.data, { search, state, course, sort }, { page, pageSize })]);
    return ok(r.rows, { page: pageOf(r), sources: sourcesFor(meta.sources.filter((s) => YEARS.includes(s.year))) });
  });
}
