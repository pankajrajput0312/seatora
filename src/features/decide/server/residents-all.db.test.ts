import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { RESIDENTS_PAGE_SIZE, residentsQuery, type ResidentsQuery } from "../residents-search";
import { listResidentsAll, RESIDENTS_MAX_PAGE } from "./residents-all";

// Residents across institutes on the real import, against the private bundle (read only; names are never printed:
// assertions compare ids and counts). Run with DATABASE_URL set (and RESIDENTS_BUNDLE when not ../neetpg-planner):
//   set -a; . ./.env; set +a; npx vitest run src/features/decide/server/residents-all.db.test.ts
vi.mock("./residents", async (orig) => ({ ...(await orig<typeof import("./residents")>()), canSeeResidents: async () => true, residentsBudget: async () => true }));

const bundle = join(resolve(process.env.RESIDENTS_BUNDLE ?? "../neetpg-planner/data/medpath-private"), "residents.ndjson");
const list = (q: Partial<ResidentsQuery>) => listResidentsAll(residentsQuery.parse(q));

describe.skipIf(!process.env.DATABASE_URL || !existsSync(bundle))("residents across institutes on the real import", { timeout: 120_000 }, () => {
  const rows = () => readFileSync(bundle, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { year: number; rank: number | null });

  it("counts by year are the bundle's, less hidden rows; withRank likewise", async () => {
    const all = rows();
    for (const year of [...new Set(all.map((r) => r.year))]) {
      const inYear = all.filter((r) => r.year === year);
      const hidden = await db.resident.count({ where: { year, hidden: true } });
      const hiddenRanked = await db.resident.count({ where: { year, hidden: true, rank: { not: null } } });
      expect(await db.resident.count({ where: { year } }), `${year} imported`).toBe(inYear.length);
      const p = await list({ year });
      expect([p.total, p.withRank], `${year}`).toEqual([inYear.length - hidden, inYear.filter((r) => r.rank != null).length - hiddenRanked]);
    }
    expect((await list({})).total).toBe(all.length - (await db.resident.count({ where: { hidden: true } })));
  });

  it("rank range: the bundle's count, rows in range and ascending", async () => {
    const want = rows().filter((r) => r.rank != null && r.rank >= 1000 && r.rank <= 5000).length;
    const hidden = await db.resident.count({ where: { hidden: true, rank: { gte: 1000, lte: 5000 } } });
    const p = await list({ rankFrom: 1000, rankTo: 5000 });
    expect([p.total, p.withRank]).toEqual([want - hidden, want - hidden]);
    const ranks = p.rows.map((r) => r.rank!);
    expect(ranks.every((r) => r >= 1000 && r <= 5000)).toBe(true);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(p.rows.length).toBe(Math.min(RESIDENTS_PAGE_SIZE, p.total));
    expect((await list({ hasRank: false, rankFrom: 1000 })).total).toBe(0);
  });

  it("rank sort puts residents without a rank last; no rows past RESIDENTS_MAX_PAGE", async () => {
    // The largest 2025 course that fits in the pages served and has residents with and without a rank.
    const [{ slug }] = await db.$queryRaw<{ slug: string }[]>`
      SELECT s.slug FROM "Resident" r JOIN "Specialty" s ON s.id = r."specialtyId" WHERE r.year = 2025 AND NOT r.hidden
      GROUP BY s.slug HAVING count(*) <= ${RESIDENTS_MAX_PAGE * RESIDENTS_PAGE_SIZE} AND count(r.rank) BETWEEN 1 AND count(*) - 1
      ORDER BY count(*) DESC LIMIT 1`;
    const q = { year: 2025, course: [slug] };
    const p = await list(q);
    expect(p.withRank).toBeGreaterThan(0);
    expect(p.withRank).toBeLessThan(p.total);
    const at = async (i: number) => (await list({ ...q, page: Math.floor(i / RESIDENTS_PAGE_SIZE) + 1 })).rows[i % RESIDENTS_PAGE_SIZE];
    expect((await at(p.withRank - 1)).rank).not.toBeNull();
    expect((await at(p.withRank)).rank).toBeNull();
    expect((await list({ ...q, page: Math.ceil(p.total / RESIDENTS_PAGE_SIZE) })).rows.at(-1)!.rank).toBeNull();
    const deep = await list({ year: 2025, page: RESIDENTS_MAX_PAGE + 1 });
    expect([deep.rows.length, deep.total]).toEqual([0, (await list({ year: 2025 })).total]);
  });

  it("hidden residents are never returned, not even by their name", async () => {
    const hidden = await db.resident.findMany({ where: { hidden: true }, take: 5, select: { id: true, name: true, year: true, college: { select: { slug: true } } } });
    for (const h of hidden) {
      const p = await list({ q: h.name.slice(0, 60), college: h.college.slug, year: h.year });
      expect(p.rows.map((r) => r.id)).not.toContain(h.id);
    }
  });

  it("name search: any case and spacing, every token; filters by college, course, quota", async () => {
    const r = (await list({ year: 2025, hasRank: true, sort: "name" })).rows[7];
    const q = ` ${r.name.split(/\s+/).reverse().join("  ").toLowerCase()} `.slice(0, 60);
    const ids = (await list({ q, college: r.college.slug })).rows.map((x) => x.id);
    expect(ids).toContain(r.id);
    expect((await list({ q: `${r.name.split(" ")[0]} qqzzqq` })).total).toBe(0);
    expect((await list({ q: "%" })).total).toBe(0); // no LIKE wildcards
    const f = await list({ quota: r.quota ?? undefined, course: [r.course.slug], state: r.college.state ?? undefined });
    expect(f.rows.every((x) => x.quota === r.quota && x.course.slug === r.course.slug && x.college.state === r.college.state)).toBe(true);
    expect(f.sources.map((s) => s.key)).toContain(r.sourceKey);
  });
});
