import { z } from "zod";
import { handle, invalid, ok, parseQuery, sourcesFor } from "@/features/decide/api";
import { rankValue } from "@/features/decide/lib/params";
import { getMeta, rankJourney } from "@/features/decide/service";

const schema = z.object({ rank: rankValue, year: z.coerce.number().int().min(2000).max(2100).optional() });

/**
 * One rank's allotments in one year (default: the newest with results), round by round: the seat, status, candidate
 * category, choice no. and the seat one round back. Sources: every result PDF of that year (a round with no row rests on its PDF too).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(schema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const meta = await getMeta();
    const year = q.data.year ?? meta.years[0]?.year;
    const rows = year ? await rankJourney(year, q.data.rank) : [];
    return ok(rows, { sources: sourcesFor(meta.sources.filter((s) => s.year === year)) });
  });
}
