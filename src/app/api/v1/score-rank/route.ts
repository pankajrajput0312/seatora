import { z } from "zod";
import { handle, invalid, notFound, ok, parseQuery } from "@/features/decide/api";
import { rankValue } from "@/features/decide/lib/params";
import { meritLists, rankToScore, scoreToRank } from "@/features/decide/server/merit";

// Either a score (the rank it was) or a rank (the score it was), per year of NBEMS results. History, not a prediction;
// each year keeps its own scale (source.maxMarks), never converted.
const schema = z
  .object({
    score: z.coerce.number().int().min(-1000).max(1000).optional(),
    rank: rankValue.optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .refine((q) => (q.score == null) !== (q.rank == null), { message: "Give either score or rank", path: ["score"] });

/** Score → rank (or rank → score) in each year's NBEMS result, newest first; `year` picks one. */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(schema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const { score, rank, year } = q.data;
    const years = year ? [year] : (await meritLists()).map((l) => l.year);
    const data = (await Promise.all(years.map((y) => (score != null ? scoreToRank(y, score) : rankToScore(y, rank!))))).filter((r) => r != null);
    if (!data.length) return notFound(year ? `No NBEMS result data for ${year}` : "No NBEMS result data");
    return ok(data, { sources: data.map(({ source: s }) => ({ key: s.key, name: s.name, url: s.url, year: s.year })) });
  });
}
