import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { residentsQuery, type ResidentsQuery } from "../residents-search";
import { listResidentsAll, RESIDENTS_MAX_PAGE } from "./residents-all";

// Residents across institutes on the real import, against the private bundle (read only; names are never printed:
// assertions compare ids and counts). Run with DATABASE_URL set (and RESIDENTS_BUNDLE when not ../neetpg-planner):
//   set -a; . ./.env; set +a; npx vitest run src/features/decide/server/residents-all.db.test.ts
vi.mock("./residents", async (orig) => ({ ...(await orig<typeof import("./residents")>()), canSeeResidents: async () => true, residentsDenied: async () => null }));

const bundle = join(resolve(process.env.RESIDENTS_BUNDLE ?? "../neetpg-planner/data/medpath-private"), "residents.ndjson");
const list = (q: Partial<ResidentsQuery>) => listResidentsAll(residentsQuery.parse(q));

describe.skipIf(!process.env.DATABASE_URL || !existsSync(bundle))("residents across institutes on the real import", { timeout: 120_000 }, () => {
  const rows = () => readFileSync(bundle, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { year: number });

  it("counts by year are the bundle's, less hidden rows; never a rank", async () => {
    const all = rows();
    for (const year of [...new Set(all.map((r) => r.year))]) {
      const inYear = all.filter((r) => r.year === year);
      const hidden = await db.resident.count({ where: { year, hidden: true } });
      expect(await db.resident.count({ where: { year } }), `${year} imported`).toBe(inYear.length);
      const p = await list({ year: [year] });
      expect(p.total, `${year}`).toBe(inYear.length - hidden);
      expect(p.rows.every((r) => !("rank" in r) && !("rankBasis" in r))).toBe(true);
    }
    expect((await list({})).total).toBe(all.length - (await db.resident.count({ where: { hidden: true } })));
  });

  it("default sort: year newest first, then college, then name; no rows past RESIDENTS_MAX_PAGE", async () => {
    const p = await list({});
    const keys = p.rows.map((r) => [-r.year, r.college.name] as const);
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)));
    const deep = await list({ year: [2025], page: RESIDENTS_MAX_PAGE + 1 });
    expect([deep.rows.length, deep.total]).toEqual([0, (await list({ year: [2025] })).total]);
  });

  it("hidden residents are never returned, not even by their name", async () => {
    const hidden = await db.resident.findMany({ where: { hidden: true }, take: 5, select: { id: true, name: true, year: true, college: { select: { slug: true } } } });
    for (const h of hidden) {
      const p = await list({ q: h.name.slice(0, 60), college: [h.college.slug], year: [h.year] });
      expect(p.rows.map((r) => r.id)).not.toContain(h.id);
    }
  });

  it("name search: any case and spacing, every token; filters by colleges, course, quota", async () => {
    const r = (await list({ year: [2025], sort: "name" })).rows[7];
    const q = ` ${r.name.split(/\s+/).reverse().join("  ").toLowerCase()} `.slice(0, 60);
    const ids = (await list({ q, college: [r.college.slug] })).rows.map((x) => x.id);
    expect(ids).toContain(r.id);
    expect((await list({ q: `${r.name.split(" ")[0]} qqzzqq` })).total).toBe(0);
    expect((await list({ q: "%" })).total).toBe(0); // no LIKE wildcards
    const f = await list({ quota: r.quota ?? undefined, course: [r.course.slug], state: r.college.state ? [r.college.state] : undefined });
    expect(f.rows.every((x) => x.quota === r.quota && x.course.slug === r.course.slug && x.college.state === r.college.state)).toBe(true);
    expect(f.sources.map((s) => s.key)).toContain(r.sourceKey);
  });
});
