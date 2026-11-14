import { describe, expect, it, vi } from "vitest";
import { GET as meritPosition } from "../merit-position/route";
import { GET as scoreRank } from "./route";

// Read before the imports run: with DATABASE_URL unset, Prisma would load the worktree .env (another database). "" keeps
// it unset for Prisma too, so the DB tests skip and the handlers answer 503.
const dbUrl = vi.hoisted(() => (process.env.DATABASE_URL ??= ""));

const get = async (fn: (r: Request) => Promise<Response>, qs: string) => {
  const res = await fn(new Request(`http://test/api?${qs}`));
  return { status: res.status, body: await res.json() };
};

it("rejects bad queries with 400", async () => {
  for (const qs of ["", "score=419&rank=42284", "score=41.5", "score=abc", "rank=0"]) expect((await get(scoreRank, qs)).status, qs).toBe(400);
  for (const qs of ["rank=42284", "rank=42284&category=GEN", "category=OBC"]) expect((await get(meritPosition, qs)).status, qs).toBe(400);
});

// Spot values of the real import (local DATABASE_URL exported, see server/merit.test.ts).
describe.skipIf(!dbUrl)("on the real import", () => {
  it("score → rank per year, newest first, each with its own scale and source", async () => {
    const { status, body } = await get(scoreRank, "score=419");
    expect(status).toBe(200);
    expect(body.data.map((d: { year: number; source: { maxMarks: number } }) => [d.year, d.source.maxMarks])).toEqual([[2026, 720], [2025, 800]]);
    expect(body.data[0].at).toEqual({ score: 419, bestRank: 42158, worstRank: 42573, count: 416 });
    expect(body.sources.map((s: { year: number }) => s.year)).toEqual([2026, 2025]);
    expect((await get(scoreRank, "rank=42,284&year=2025")).body.data[0].at.score).toBe(447);
    expect((await get(scoreRank, "score=419&year=2010")).status).toBe(404);
  });

  it("merit position defaults to the newest year with categories; 2026 has none yet", async () => {
    const { status, body } = await get(meritPosition, "rank=42284&category=OBC");
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ year: 2025, category: "OBC", min: 14594, max: 14962, qualified: 49047 });
    expect(body.sources[0].url).toBeTruthy();
    expect((await get(meritPosition, "rank=42284&category=Open PwD")).body.data.category).toBe("GENERAL PwBD");
    expect((await get(meritPosition, "rank=42284&category=OBC&year=2026")).status).toBe(404);
  });
});
