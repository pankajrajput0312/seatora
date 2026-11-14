import { compareQuerySchema, gridRounds, handle, invalid, ok, parseOptionalProfile, parseQuery, sourcesFor } from "@/features/decide/api";
import { getMeta, getOptionsByIds } from "@/features/decide/service";

/** 1–4 options side by side (ids from /options); reach labels when a profile is given. */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const profile = parseOptionalProfile(p);
    const q = parseQuery(compareQuerySchema, p, ["ids"]);
    if (!profile.success || !q.success) return invalid(profile.error, q.error);
    const [meta, rows] = await Promise.all([getMeta(), getOptionsByIds([...new Set(q.data.ids)], profile.data)]);
    return ok(rows, { sources: sourcesFor(meta.sources, gridRounds(rows)) });
  });
}
