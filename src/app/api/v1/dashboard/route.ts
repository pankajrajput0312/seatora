import { handle, invalid, ok, parseProfile, sourcesFor } from "@/features/decide/api";
import { dashboard, getMeta, YEARS } from "@/features/decide/service";

/** Overview for a profile (rank required): reach counts, 2025 closing strip with its per-course summary, round trend. */
export async function GET(req: Request) {
  return handle(async () => {
    const profile = parseProfile(new URL(req.url).searchParams);
    if (!profile.success) return invalid(profile.error);
    const [meta, data] = await Promise.all([getMeta(), dashboard(profile.data)]);
    return ok(data, { sources: sourcesFor(meta.sources.filter((s) => YEARS.includes(s.year))) });
  });
}
