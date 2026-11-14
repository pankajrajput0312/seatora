import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Profile } from "../profile";
import { groupResidents, listResidents, type Resident } from "./residents";

const course = (degree: string, specialty: string) => ({ degree, specialty, name: specialty, slug: `${degree}-${specialty}`.toLowerCase() });
const row = (degree: string, specialty: string, year: number, name: string): Resident => ({ id: name, name, year, list: "up to Round 3", rank: null, sourceKey: "x", course: course(degree, specialty) });

describe("groupResidents", () => {
  // listResidents order: course (degree, name), newest year first, then name
  const rows = [row("DNB", "ANAESTHESIOLOGY", 2025, "A"), row("DNB", "ANAESTHESIOLOGY", 2024, "B"), row("MD", "PAEDIATRICS", 2025, "C"), row("MS", "OBG", 2023, "D")];
  const her = { specialties: ["PAEDIATRICS", "OBG"], degrees: [] } as unknown as Profile;

  it("keeps the SQL order without a profile, years newest first", () => {
    const g = groupResidents(rows, null);
    expect(g.map((x) => [x.course.slug, x.total, x.mine])).toEqual([["dnb-anaesthesiology", 2, false], ["md-paediatrics", 1, false], ["ms-obg", 1, false]]);
    expect(g[0].years.map((y) => [y.year, y.rows.map((r) => r.name)])).toEqual([[2025, ["A"]], [2024, ["B"]]]);
  });

  it("puts her courses first, the rest after in their order", () => {
    expect(groupResidents(rows, her).map((x) => x.course.slug)).toEqual(["md-paediatrics", "ms-obg", "dnb-anaesthesiology"]);
    expect(groupResidents(rows, { ...her, degrees: ["MS"] }).map((x) => x.course.slug)).toEqual(["ms-obg", "dnb-anaesthesiology", "md-paediatrics"]);
  });
});

// Real import (npm run db:import-residents), checked against the private bundle's spot checks (names never in this repo).
// Run with DATABASE_URL set:  set -a; . ./.env; set +a; npx vitest run src/features/decide/server/residents.test.ts
const manifestPath = join(resolve(process.env.RESIDENTS_BUNDLE ?? "../neetpg-planner/data/medpath-private"), "manifest.json");
describe.skipIf(!process.env.DATABASE_URL || !existsSync(manifestPath))("residents on the real import", { timeout: 60_000 }, () => {
  it("has the bundle's spot-check residents (Kokilaben Navi Mumbai 2025, DNB Anaesthesiology and Family Medicine)", async () => {
    const checks: { ikey: string; degree: string; specialty: string; year: number; name: string; rank: number; list_label: string; src: string }[] = JSON.parse(readFileSync(manifestPath, "utf8")).spot_checks;
    for (const c of checks) {
      const r = await listResidents(c.ikey, { year: c.year });
      expect(r.rows.find((x) => x.name === c.name)).toMatchObject({ rank: c.rank, list: c.list_label, course: { degree: c.degree, specialty: c.specialty } });
      expect(r.sources.map((s) => s.key)).toContain(c.src);
      const one = await listResidents(c.ikey, { year: c.year }, { page: 1, pageSize: 1 });
      expect([one.rows.length, one.total]).toEqual([1, r.total]);
    }
  });
});
