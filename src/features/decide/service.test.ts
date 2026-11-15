import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reachOrder } from "./lib/reach";
import type { Profile } from "./profile";
import { getCatalog, setTestCatalog } from "./server/catalog";
import { remarkOf } from "./server/queries";
import { programmeOfDegree } from "./server/terms";
import type { FeeRow } from "./service";
import { decideDemoData as fx } from "./test/decide.demo";
import type { SeatList } from "./types";

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
  expect([remarkOf("allotted"), remarkOf("fresh"), remarkOf("upgraded")]).toEqual(["Allotted", "Fresh", "Upgraded"]);
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

  it("fees: a row per institute × programme offered; unknown last both ways; caps leave unknown out (counted) unless kept", async () => {
    const all = await svc.listFees({}, { page: 1, pageSize: 1000 });
    expect(all.total).toBe(new Set(fx.cutoffs.map((c) => `${c.college}|${programmeOfDegree(c.degree)}`)).size);
    const fee1 = (r: FeeRow) => r.terms.years[0]?.fee?.inr ?? null;
    for (const dir of ["asc", "desc"] as const) {
      const xs = (await svc.listFees({ sort: "fee1", dir }, { page: 1, pageSize: 1000 })).rows.map(fee1);
      const known = xs.filter((x) => x != null);
      expect(xs.slice(0, known.length)).toEqual([...known].sort((a, b) => (dir === "asc" ? a - b : b - a)));
    }
    const capped = await svc.listFees({ maxFee: 100000 });
    expect(capped.rows.every((r) => fee1(r) != null && fee1(r)! <= 100000)).toBe(true);
    const kept = await svc.listFees({ maxFee: 100000, keepUnknown: true });
    expect(kept.rows.every((r) => fee1(r) == null || fee1(r)! <= 100000)).toBe(true);
    expect(kept.total).toBe(capped.total + capped.unknownTerms);
    expect(kept.unknownTerms).toBe(0);
    expect((await svc.listFees({ bond: "none" })).rows.every((r) => r.terms.bond.status !== "declared")).toBe(true);
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

  it("new options: seats with no past allotment in her profile, ids as optionId; known, unknown, empty and out-of-profile ones left out", async () => {
    const cat = await getCatalog();
    const known = cat.options[0];
    const college = fx.colleges.find((c) => c.state)!;
    const id = (quota: string, k = college.key, specialty = "ANAESTHESIOLOGY") => optionKey({ college: k, degree: "MD", specialty, quota });
    const cells = (seats: number, category = "OBC") => [[{ quota: "x", category, seats }], [], []];
    const at = (quota: string, seats = 2, k = college.key, specialty = "ANAESTHESIOLOGY") => [id(quota, k, specialty), { college: k, degree: "MD", specialty, quota, cells: cells(seats) }] as const;
    const fresh = [...cat.optionById.keys()].includes(id("Deemed/Paid Seats")) ? "All India" : "Deemed/Paid Seats";
    const seats = new Map([
      [known.id, { college: known.college, degree: known.degree, specialty: known.specialty, quota: known.quota, cells: cells(3) }],
      at(fresh), at("Armed Forces Medical"), at(fresh, 0, college.key, "FAMILYMEDICINE"), at(fresh, 1, "NO-SUCH-COLLEGE#000000"), at(fresh, 1, college.key, "NOSUCHCOURSE"),
    ]);
    const out = svc.newOptions(cat, new Map(seats), her);
    expect(out).toEqual([{ cs: "", id: id(fresh), college: college.key, degree: "MD", specialty: "ANAESTHESIOLOGY", quota: fresh, byYear: {}, fresh: true }]);
    expect(cat.optionById.has(out[0].id)).toBe(false);
    // No profile (a saved choice): any quota.
    expect(svc.newOptions(cat, new Map(seats), null).map((o) => o.quota).sort()).toEqual(["Armed Forces Medical", fresh].sort());
  });
});

describe("Options' round view (pure parts)", () => {
  const l = (kind: SeatList["kind"], year = 2026, round: SeatList["round"] = "R2"): SeatList => ({ key: `${year}${round}${kind}`, name: kind, url: null, year, round, kind, publishedAt: null, seats: 1 });
  const lists = [l("clear"), l("virtual"), l("new")];

  it("is the default while the newest seat lists' round has no allotment result; never without seat lists", () => {
    const r1 = [{ year: 2026, round: "R1" as const }];
    expect(svc.optionsView(undefined, lists, r1)).toBe("round");
    expect(svc.optionsView(undefined, lists, [...r1, { year: 2026, round: "R2" }])).toBe("all"); // R2 result out: its lists are spent
    expect(svc.optionsView(undefined, [l("clear", 2025, "R3")], r1)).toBe("round"); // whatever round is newest
    expect(svc.optionsView("all", lists, r1)).toBe("all");
    expect(svc.optionsView("round", lists, [...r1, { year: 2026, round: "R2" }])).toBe("round"); // asked for
    expect(svc.optionsView("round", [], r1)).toBe("all");
  });

  it("seats per list kind in her categories; an option is in when a list has more than 0", () => {
    const s = { cells: [[{ quota: "All India", category: "Open", seats: 2 }, { quota: "All India", category: "SC", seats: 5 }], [], [{ quota: "All India", category: "OBC", seats: 0 }]] };
    expect(svc.seatsByKind(lists, s, ["Open", "OBC"]).by).toEqual({ clear: 2, virtual: null, new: 0 });
    expect(svc.seatsByKind(lists, s).by).toEqual({ clear: 7, virtual: null, new: 0 });
    expect(svc.seatsByKind(lists, undefined).by).toEqual({ clear: null, virtual: null, new: null });
    const by = { clear: 0, virtual: 3, new: null };
    expect([svc.hasSeatsIn(by, "any"), svc.hasSeatsIn(by, "clear"), svc.hasSeatsIn(by, "virtual"), svc.hasSeatsIn(by, "new")]).toEqual([true, false, true, false]);
    expect(svc.hasSeatsIn({ clear: 0, new: 0 }, "any")).toBe(false);
  });

  it("summary: clear + virtual only + newly added only = options with seats; newly added and new options counted on the side", () => {
    const xs = [
      { by: { clear: 2, virtual: 1, new: 2 } },
      { by: { clear: 1, virtual: null, new: null }, fresh: true },
      { by: { clear: null, virtual: 4, new: null } },
      { by: { clear: null, virtual: null, new: 1 }, fresh: true },
      { by: { clear: 0, virtual: null, new: null } }, // printed with 0 seats: no seats
      { by: {}, fresh: true },
    ];
    const s = svc.roundSummary(xs);
    expect(s).toEqual({ options: 4, clear: 2, virtualOnly: 1, newOnly: 1, withNew: 2, fresh: 2 });
    expect(s.clear + s.virtualOnly + s.newOnly).toBe(s.options);
  });

  it("no seat lists (this fixture): the all view, no summary, as before", async () => {
    const r = await svc.listOptions(her);
    expect([r.view, r.summary, r.seats, r.showClosed]).toEqual(["all", null, null, false]);
    expect((await svc.listOptions(her, { view: "round" })).view).toBe("all");
  });
});
