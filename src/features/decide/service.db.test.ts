import { describe, expect, it } from "vitest";
import { reachOrder } from "./lib/reach";
import type { Profile } from "./profile";
import { listSeats, seatLists } from "./server/seats";
import * as svc from "./service";

// Real MCC data in Postgres (npm run db:import). Run with DATABASE_URL set, e.g.
//   set -a; . ./.env; set +a; npx vitest run src/features/decide/service.db.test.ts
const KOKILA_NM = "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8";
const GMC_NAGPUR = "GOVERNMENTMEDICALCOLLEGENAGPURGOVERNMENT";
const SETH_GS = "SETHGORDHANDASSUNDERDASMEDICALCOLLEGEMUM";
const her: Profile = { rank: 42284, category: "OBC", pwd: false, specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };

const timed = async <T>(label: string, fn: () => Promise<T>) => {
  const t = performance.now();
  const out = await fn();
  console.log(`${label}: ${Math.round(performance.now() - t)} ms`);
  return out;
};
const collegeKey = async (prefix: string) => (await svc.getDecideData()).colleges.find((c) => c.key.startsWith(prefix))!;

// (importing ./service loads Prisma, which reads .env, so the guard sees DATABASE_URL from .env too)
describe.skipIf(!process.env.DATABASE_URL)("service on real MCC data", { timeout: 120_000 }, () => {
  it("loads the catalog with the MCC result PDFs (2026 R1 final)", async () => {
    const meta = await timed("catalog (cold)", () => svc.getMeta());
    expect(meta.years[0]).toMatchObject({ year: 2026, rounds: ["R1"], provisional: false, label: "2026 (R1)" });
    expect(meta.years.find((y) => y.year === 2025)?.label).toBe("2025");
  });

  it("Kokilaben Navi Mumbai DNB Anaesthesiology, DNB Quota, Open seat: 2025 R1–stray and 2026 R1", async () => {
    const rows = await timed("lastRanks DNB anaesthesiology Open", () => svc.lastRanks({ specialty: "ANAESTHESIOLOGY", degree: "DNB", quota: "DNB Quota", category: "Open" }));
    const g = rows.rows.find((r) => r.college.key.startsWith(KOKILA_NM))!.grid;
    expect([g[2025].R1?.closing, g[2025].R2?.closing, g[2025].R3?.closing, g[2025].stray?.closing]).toEqual([21699, 25059, 29892, 33685]);
    expect(g[2026].R1).toMatchObject({ closing: 20132, provisional: false });
    expect(g[2025].R1?.provisional).toBe(false);
  });

  it("GMC Nagpur 2026 R1 MD Anaesthesiology: 12 allotments, OBC closing 17,213", async () => {
    const c = await collegeKey(GMC_NAGPUR);
    const a = await svc.listAllotments({ year: 2026, round: "R1", course: "md-anaesthesiology" }, { page: 1, pageSize: 50 }, c.key);
    expect(a.total).toBe(12);
    expect(a.rows.every((r) => !r.provisional && r.remark === "Fresh")).toBe(true);
    // her grid (Open + OBC seats): closing from her categories, bracketed count = allotments in every category
    const inst = (await svc.getInstitute(c.slug, her))!;
    const md = inst.options.find((o) => o.course.slug === "md-anaesthesiology" && o.quota === "All India")!;
    expect(md.grid[2026].R1).toMatchObject({ closing: 17213, category: "OBC", n: 12, provisional: false });
  });

  it("Seth GS MD Anaesthesiology 2026 R1: OBC 11,842, Open 8,502, 20 allotments", async () => {
    const c = await collegeKey(SETH_GS);
    const inst = (await timed("getInstitute Seth GS", () => svc.getInstitute(c.slug, { ...her, rank: 1 })))!;
    const md = inst.options.find((o) => o.course.slug === "md-anaesthesiology" && o.quota === "All India")!;
    expect(md.grid[2026].R1).toMatchObject({ closing: 11842, category: "OBC", n: 20, provisional: false });
    const open = await svc.lastRanks({ specialty: "ANAESTHESIOLOGY", degree: "MD", quota: "All India", category: "Open" });
    // closing on Open seats; the bracketed count is every allotment that round (all categories)
    expect(open.rows.find((r) => r.college.key === c.key)!.grid[2026].R1).toMatchObject({ closing: 8502, n: 20 });
    expect((await svc.listAllotments({ year: 2026, round: "R1", course: "md-anaesthesiology" }, { page: 1, pageSize: 50 }, c.key)).total).toBe(20);
  });

  it("her options (AIR 42,284 OBC, Anaesthesiology + Family Medicine) in under a second", async () => {
    await svc.listOptions(her); // warm the catalog
    const all = await timed("listOptions her (showClosed)", () => svc.listOptions(her, { showClosed: true }));
    const shown = await timed("listOptions her (default)", () => svc.listOptions(her));
    console.log("her options", all.rows.length, all.counts, "shown", shown.rows.length, "hidden closed", shown.hiddenClosed);
    // Every quota ticked: every option in both specialties; 1,338 of them have an Open or OBC allotment.
    const every = await svc.listOptions({ ...her, quotas: (await svc.getMeta()).quotas }, { showClosed: true });
    expect(every.total).toBe(1360);
    expect(every.counts).toMatchObject({ "reached-latest": 294, "reached-both": 57, "reached-one": 165, "within-10": 102, "closed-before": 653, "no-data": 89 });
    // None ticked: the open quotas only (31 options in restricted quotas left out).
    expect(all.total).toBe(1329);
    expect(all.rows.every((r) => ["All India", "DNB Quota", "Deemed/Paid Seats"].includes(r.quota))).toBe(true);
    expect(shown.total + shown.hiddenClosed).toBe(1329);
    const page2 = await svc.listOptions(her, {}, { page: 2, pageSize: 50 });
    expect(page2.rows.map((r) => r.id)).toEqual(shown.rows.slice(50, 100).map((r) => r.id));
    const t = performance.now();
    await svc.listOptions(her);
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it("her exact courses (Family Medicine only as DNB) leave MD and NBEMS Diploma Family Medicine out, in memory and in SQL", async () => {
    const mine: Profile = { ...her, pairs: [...["Diploma", "DNB", "MD", "NBEMS Diploma"].map((d) => `${d}~ANAESTHESIOLOGY`), "DNB~FAMILYMEDICINE"] };
    const ok = (c: { degree: string; specialty: string }) => c.specialty !== "FAMILYMEDICINE" || c.degree === "DNB";
    const [all, exact] = await Promise.all([svc.listOptions(her, { showClosed: true }), svc.listOptions(mine, { showClosed: true })]);
    expect(exact.rows.every((r) => ok(r.course))).toBe(true);
    expect(exact.total).toBe(all.rows.filter((r) => ok(r.course)).length);
    expect(exact.total).toBeLessThan(all.total);
    expect((await svc.dashboard(mine)).summary.every((s) => ok(s.course))).toBe(true);
    const list = (await seatLists())[0];
    if (!list) return;
    const [byPair, byProduct] = await Promise.all([
      listSeats({ list: list.key, pairs: ["DNB~FAMILYMEDICINE"] }),
      listSeats({ list: list.key, specialties: ["FAMILYMEDICINE"], degrees: ["DNB"] }),
    ]);
    expect(byPair.total).toBe(byProduct.total);
    expect(byPair.rows.every((r) => r.degree === "DNB" && r.specialty === "FAMILYMEDICINE")).toBe(true);
  });

  it("rank scan, trends, institutes, fees answer from SQL", async () => {
    const scan = await timed("rankScan 42284 2025 ±500", () => svc.rankScan(42284, 2025, 500));
    expect(scan.flatMap((g) => g.rows).every((r) => Math.abs(r.rank - 42284) <= 500 && r.year === 2025)).toBe(true);
    const trends = await timed("allotmentTrends all", () => svc.allotmentTrends({}, { page: 1, pageSize: 50 }));
    expect(trends.total).toBeGreaterThan(10000);
    expect(trends.rows).toHaveLength(50);
    const inst = await timed("listInstitutes her", () => svc.listInstitutes(her, {}));
    expect(inst.total).toBe(2194); // colleges.ndjson (2,141) + seat_colleges.ndjson (53) in the bundle manifest
    const firstPage = await timed("listInstitutes her, page 1", () => svc.listInstitutes(her, {}, { page: 1, pageSize: 48 }));
    expect(firstPage.rows).toHaveLength(48);
    // best reach (per-year maxima in SQL) agrees with the institute page, over the options in her profile only
    for (const prefix of [KOKILA_NM, GMC_NAGPUR, SETH_GS]) {
      const row = inst.rows.find((r) => r.college.key.startsWith(prefix))!;
      const yours = (await svc.getInstitute(row.college.slug, her))!.yours.map((o) => o.reach);
      expect(row.bestReach).toBe(reachOrder.find((r) => yours.includes(r)) ?? "no-data");
      if (row.best) expect(her.specialties).toContain(row.best.course.specialty);
    }
    const fees = await timed("listFees", () => svc.listFees({}, { page: 1, pageSize: 50 }));
    expect(fees.total).toBeGreaterThan(0);
    expect(await svc.getNotices()).toEqual([]);
  });
});
