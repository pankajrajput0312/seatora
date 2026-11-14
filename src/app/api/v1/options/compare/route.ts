import { compareQuerySchema, gridRounds, handle, invalid, ok, parseOptionalProfile, parseQuery, sourcesFor } from "@/features/decide/api";
import { currentOptionIds, getMeta, getOptionsByIds } from "@/features/decide/service";

/** 1–4 different options side by side (ids from /options, an old link's retired college keys renamed; repeats count once); reach labels when a profile is given. */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const profile = parseOptionalProfile(p);
    const q = parseQuery(compareQuerySchema, p, ["ids"]);
    if (!profile.success || !q.success) return invalid(profile.error, q.error);
    const [meta, rows] = await Promise.all([getMeta(), currentOptionIds(q.data.ids).then((ids) => getOptionsByIds([...new Set(ids)], profile.data))]);
    return ok(rows, { sources: sourcesFor(meta.sources, gridRounds(rows)) });
  });
}
