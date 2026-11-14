import { z } from "zod";
import { handle, invalid, notFound, ok, parseQuery } from "@/features/decide/api";
import { rankValue } from "@/features/decide/lib/params";
import { meritLists, meritPosition } from "@/features/decide/server/merit";
import { baseCategories } from "@/features/decide/types";

const categories = [...baseCategories, ...baseCategories.map((c) => `${c} PwD` as const)] as const;
const schema = z.object({ rank: rankValue, category: z.enum(categories), year: z.coerce.number().int().min(2000).max(2100).optional() });

/**
 * Candidates of a category with a NEET PG rank at or ahead of `rank` in a year's NBEMS AIQ merit list (default: the
 * newest year that prints categories). History, not a prediction. 404 for a year with no category list (2026 so far).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const q = parseQuery(schema, new URL(req.url).searchParams);
    if (!q.success) return invalid(q.error);
    const { rank, category, year } = q.data;
    const lists = await meritLists();
    const list = year ? lists.find((l) => l.year === year) : lists.find((l) => l.hasCategories);
    const p = list?.hasCategories ? await meritPosition(list.year, category, rank) : null;
    if (!p) return notFound(year ? `No NBEMS category-wise merit list for ${year} yet` : "No NBEMS category-wise merit list");
    return ok(p, { sources: [{ key: p.source.key, name: p.source.name, url: p.source.url, year: p.source.year }] });
  });
}
