import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reachOrder } from "./lib/reach";
import type { Profile } from "./profile";
import { setTestCatalog } from "./server/catalog";
import { remarkOf } from "./server/queries";
import { decideDemoData as fx } from "./test/decide.demo";

// The service code over the in-memory test fixture (no database). Runtime never sees the fixture.
vi.stubEnv("DATABASE_URL", "");
let svc: typeof import("./service");
beforeAll(async () => {
  svc = await import("./service");
});
afterAll(() => setTestCatalog(null));

const her: Profile = { rank: 42284, category: "OBC", pwd: false, specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: [], quotas: [], states: [], maxFeeLakh: null, maxBondYears: null };
const optionKey = (c: { college: string; degree: string; specialty: string; quota: string }) => [c.college, c.degree, c.specialty, c.quota].join("~");

it("maps MCC status to the remark and degrees to the fee program", () => {
  expect([remarkOf("allotted"), remarkOf("fresh"), remarkOf("upgraded")]).toEqual(["Fresh", "Fresh", "Upgraded"]);
  expect(["MD", "MS", "Diploma", "MCh", "DNB", "DrNB", "NBEMS Diploma"].map((d) => svc.programOf(d))).toEqual(["MD", "MD", "MD", "MD", "DNB", "DNB", "DNB"]);
});

it("without a database: Data unavailable, never stand-in data", async () => {
  setTestCatalog(null);
  await expect(svc.getMeta()).rejects.toThrow(svc.DataUnavailableError);
  await expect(svc.getNotices()).rejects.toThrow(svc.DataUnavailableError);
});

describe("service on the test fixture", () => {
  beforeAll(() => setTestCatalog(fx));

  it("builds vocabularies and year labels from the sources", async () => {
    const meta = await svc.getMeta();
    expect(meta.specialties.map((s) => s.code)).toEqual(["ANAESTHESIOLOGY", "FAMILYMEDICINE"]);
    expect(meta.quotas).toEqual(["All India", "DNB Quota", "Deemed/Paid Seats"]);
    const latest = fx.sources.filter((s) => s.year === Math.max(...fx.sources.map((x) => x.year)));
    expect(meta.years[0].provisional).toBe(latest.some((s) => s.provisional));
    expect(meta.years[0].label).toContain(String(latest[0].year));
  });

  it("lists every option once, labels add up, closed hidden by default, pages slice the same order", async () => {
    const options = new Set(fx.cutoffs.map(optionKey));
    const all = await svc.listOptions(her, { showClosed: true });
    expect(all.total).toBe(options.size);
    expect(Object.values(all.counts).reduce((a, b) => a + b, 0)).toBe(options.size);
    expect(all.rows.map((r) => reachOrder.indexOf(r.reach))).toEqual([...all.rows.map((r) => reachOrder.indexOf(r.reach))].sort((a, b) => a - b));
    const shown = await svc.listOptions(her);
    expect(shown.total + shown.hiddenClosed).toBe(options.size);
    const p2 = await svc.listOptions(her, { showClosed: true }, { page: 2, pageSize: 5 });
    expect(p2).toMatchObject({ page: 2, pageSize: 5, total: options.size });
    expect(p2.rows.map((r) => r.id)).toEqual(all.rows.slice(5, 10).map((r) => r.id));
    expect((await svc.listOptions(her, {}, { page: 999, pageSize: 5 })).page).toBe(Math.ceil(shown.total / 5)); // clamped
  });

  it("labels from per-year deepest closings agree with labels from every cutoff; deepest 2025 first within a label", async () => {
    const all = await svc.listOptions({ ...her, pwd: true }, { showClosed: true });
    for (const x of reachOrder) expect(all.rows.filter((r) => r.reach === x)).toHaveLength(all.counts[x]);
    const key = (r: (typeof all.rows)[number]) => [reachOrder.indexOf(r.reach), -(r.byYear[2025]?.closing ?? 0)];
    const keys = all.rows.map(key);
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
    expect(all.seatList).toBeNull(); // the fixture has no seat lists: no seats column
  });

  it("overview: every course in the summary with the option behind its deepest closing; the same counts as Options", async () => {
    const d = await svc.dashboard(her);
    const o = await svc.listOptions(her, { showClosed: true });
    expect([d.total, d.counts]).toEqual([o.total, o.counts]);
    expect(d.summary.map((s) => s.course.slug).sort()).toEqual([...new Set(o.rows.map((r) => r.course.slug))].sort());
    for (const s of d.summary) if (s.deepest) expect(s.deepest).toMatchObject({ closing: expect.any(Number), round: expect.any(String), category: expect.any(String), quota: expect.any(String) });
    expect(d.strip.length).toBeLessThanOrEqual(8);
    expect(d.trend.map((t) => t.course.slug)).toEqual(d.strip.map((s) => s.course.slug));
  });

  it("narrows by profile before reading cutoffs", async () => {
    const { rows } = await svc.listOptions({ ...her, specialties: ["FAMILYMEDICINE"], quotas: ["DNB Quota"] }, { showClosed: true });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.course.specialty === "FAMILYMEDICINE" && r.quota === "DNB Quota")).toBe(true);
  });

  it("counts allotments per year over every category and round, even where her categories had none", async () => {
    const { rows } = await svc.listOptions({ ...her, category: "Open" }, { showClosed: true });
    for (const r of rows) {
      for (const y of [2024, 2025]) {
        const xs = fx.cutoffs.filter((c) => optionKey(c) === r.id && c.year === y);
        expect(r.allotmentsByYear[y]).toBe(xs.length ? xs.reduce((s, c) => s + c.n, 0) : null);
      }
    }
  });

  it("institute: options, the ones in her profile, allotments per year from Σn, terms with sources", async () => {
    const college = fx.colleges[0];
    const inst = (await svc.getInstitute(college.slug, { ...her, specialties: ["FAMILYMEDICINE"] }))!;
    const n2025 = fx.cutoffs.filter((c) => c.college === college.key && c.year === 2025).reduce((s, c) => s + c.n, 0);
    expect(inst.allotmentsByYear.find((a) => a.year === 2025)!.n).toBe(n2025);
    expect(inst.options.every((o) => o.college.key === college.key)).toBe(true);
    expect(inst.yours.every((o) => o.course.specialty === "FAMILYMEDICINE")).toBe(true);
    expect(inst.terms.md.fee?.source.name).toMatch(/fixture/i);
    expect(await svc.getInstitute("no-such-slug", null)).toBeNull();
  });

  it("institutes: paged, best reach only from options in her profile, naming the option", async () => {
    const all = await svc.listInstitutes(null, {});
    expect(all.total).toBe(fx.colleges.length);
    const page = await svc.listInstitutes({ ...her, specialties: ["FAMILYMEDICINE"] }, {}, { page: 1, pageSize: 4 });
    expect(page.rows).toHaveLength(4);
    for (const r of page.rows) {
      if (r.best) expect(r.best.course.specialty).toBe("FAMILYMEDICINE");
      else expect(r.bestReach).toBe("no-data");
    }
  });

  it("allotments: filters, total, order (newest year, round, rank) and pages (past the end: the last page)", async () => {
    const all = fx.allotments.filter((a) => a.year === 2025 && a.quota === "DNB Quota");
    const page1 = await svc.listAllotments({ year: 2025, quota: "DNB Quota" }, { page: 1, pageSize: 10 });
    expect(page1.total).toBe(all.length);
    expect(page1.rows[0].round).toBe("R1");
    expect(page1.rows.map((r) => r.rank)).toEqual([...page1.rows.map((r) => r.rank)].sort((a, b) => a - b));
    const page2 = await svc.listAllotments({ year: 2025, quota: "DNB Quota" }, { page: 2, pageSize: 10 });
    expect(page2.rows[0]).toEqual((await svc.listAllotments({ year: 2025, quota: "DNB Quota" }, { page: 1, pageSize: 11 })).rows[10]);
    const last = Math.ceil(all.length / 3);
    const past = await svc.listAllotments({ year: 2025, quota: "DNB Quota" }, { page: last + 5, pageSize: 3 });
    expect(past.page).toBe(last);
    expect(past.rows).toEqual((await svc.listAllotments({ year: 2025, quota: "DNB Quota" }, { page: last, pageSize: 3 })).rows);
  });

  it("last ranks: closing on the chosen seat category, n over every category, sorted and paged", async () => {
    const r = await svc.lastRanks({ specialty: "ANAESTHESIOLOGY", degree: "MD", category: "Open", sort: { year: 2025, round: "R1", dir: "desc" } }, { page: 1, pageSize: 3 });
    expect(r.rows.length).toBeLessThanOrEqual(3);
    const closings = r.rows.map((x) => x.grid[2025]?.R1?.closing ?? -1);
    expect(closings).toEqual([...closings].sort((a, b) => b - a));
    const row = r.rows[0];
    const cell = row.grid[2025]!.R1!;
    const same = fx.cutoffs.filter((c) => optionKey(c) === row.id && c.year === 2025 && c.round === "R1");
    expect(cell.category).toBe("Open");
    expect(cell.n).toBe(same.reduce((s, c) => s + c.n, 0));
    expect(r.columns.map((c) => c.year)).toEqual([...r.columns.map((c) => c.year)].sort());
  });

  it("rank scan keeps the window and round order", async () => {
    const groups = await svc.rankScan(30000, 2025, 1000);
    expect(groups.map((g) => g.round)).toEqual(["R1", "R2", "R3", "stray"].filter((r) => groups.some((g) => g.round === r)));
    expect(groups.flatMap((g) => g.rows).every((r) => Math.abs(r.rank - 30000) <= 1000 && r.year === 2025)).toBe(true);
  });

  it("trends come from Σn per option and year, filtered by specialties, paged", async () => {
    const t = await svc.allotmentTrends({ profile: { ...her, specialties: ["FAMILYMEDICINE"] } }, { page: 1, pageSize: 2 });
    expect(t.rows).toHaveLength(2);
    expect(t.rows.every((r) => r.course.specialty === "FAMILYMEDICINE")).toBe(true);
    const r = t.rows[0];
    const want = fx.cutoffs.filter((c) => optionKey(c) === r.id && c.year === 2024).reduce((s, c) => s + c.n, 0);
    expect(r.byYear[2024]).toBe(want || null);
  });

  it("fees: paged, sorted by the first rupee figure, unknown last", async () => {
    const f = await svc.listFees({ sort: "fee" }, { page: 1, pageSize: 100 });
    const fees = f.rows.map((r) => r.fee?.amountInr ?? Infinity);
    expect(fees).toEqual([...fees].sort((a, b) => a - b));
  });

  it("dashboard counts are listOptions' counts; the strip is slim", async () => {
    const d = await svc.dashboard(her);
    expect(d.counts).toEqual((await svc.listOptions(her, { showClosed: true })).counts);
    expect(Object.keys(d.strip[0].points[0]).sort()).toEqual(["category", "closing", "name", "quota", "round"]);
    expect(d.summary[0].options).toBe(d.strip[0].points.length);
  });

  it("no notices are made up", async () => {
    expect(await svc.getNotices()).toEqual([]);
  });
});
