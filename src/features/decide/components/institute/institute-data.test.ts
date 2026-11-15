import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCatalog, memoryCatalog, setTestCatalog, yearsOf } from "../../server/catalog";
import { countAllotments, findAllotments } from "../../server/queries";
import type { SeatRow } from "../../server/seats";
import { decideDemoData as fx } from "../../test/decide.demo";
import type { Source } from "../../types";
import { reportedCount } from "./hospital-bits";
import { allotmentMix, institutesByTerms, optionSeats, websiteUrl } from "./institute-data";
import { KEY_ROWS, keyRows, newestClosing } from "./key-facts-data";
import type { OptionRow } from "../../service";

const src = (year: number, round: Source["round"], provisional = false): Source => ({ key: `${year}${round}`, url: null, year, round, provisional, name: "" });

it("countAllotments counts allotments per year, round, quota and seat category (= Cutoff.n per cell)", async () => {
  const cat = memoryCatalog(fx);
  const college = fx.colleges[0].key;
  const got = await countAllotments(cat, [...cat.pairs.values()].filter((p) => p.college === college).map((p) => p.cs));
  const want = new Map<string, number>();
  for (const c of fx.cutoffs.filter((c) => c.college === college)) {
    const k = [c.year, c.round, c.quota, c.category].join("|");
    want.set(k, (want.get(k) ?? 0) + c.n);
  }
  expect(new Map(got.map((r) => [[r.year, r.round, r.quota, r.category].join("|"), r.n]))).toEqual(want);
  expect(await countAllotments(cat, [])).toEqual([]);
});

describe("allotmentMix", () => {
  const rows = [
    { year: 2026, round: "R1" as const, quota: "Deemed/Paid Seats", category: "Open" as const, n: 4 },
    { year: 2026, round: "R1" as const, quota: "Non-Resident Indian", category: "Open" as const, n: 1 },
    { year: 2025, round: "R1" as const, quota: "All India", category: "OBC" as const, n: 2 },
    { year: 2025, round: "R2" as const, quota: "All India", category: "OBC" as const, n: 3 },
    { year: 2025, round: "R1" as const, quota: "All India", category: "Open" as const, n: 5 },
  ];

  it("the newest round, then each year (all rounds); open quotas first, seat categories in MCC order, null when none", () => {
    const sources = [src(2026, "R1", true), src(2025, "R1"), src(2025, "R2")];
    const mix = allotmentMix(rows, yearsOf(sources), sources)!;
    // 2026 has only R1, so no separate 2026 column.
    expect(mix.columns).toEqual([{ label: "2026 R1", year: 2026, round: "R1", provisional: true }, { label: "2025", year: 2025, provisional: false }]);
    expect(mix.groups).toEqual([
      { quota: "All India", rows: [{ category: "Open", values: [null, 5] }, { category: "OBC", values: [null, 5] }] },
      { quota: "Deemed/Paid Seats", rows: [{ category: "Open", values: [4, null] }] },
      { quota: "Non-Resident Indian", rows: [{ category: "Open", values: [1, null] }] },
    ]);
  });

  it("a newest year with more rounds gets its own all-rounds column; no rows or years: null", () => {
    const sources = [src(2025, "R1"), src(2025, "R2")];
    expect(allotmentMix(rows, yearsOf(sources), sources)!.columns.map((c) => c.label)).toEqual(["2025 R2", "2025 (R1, R2)"]);
    expect(allotmentMix([], yearsOf(sources), sources)).toBeNull();
    expect(allotmentMix(rows, [], [])).toBeNull();
  });
});

it("optionSeats: one list's seats for a course and quota in the given seat categories; null when it prints none", () => {
  const row = (degree: string, specialty: string, quota: string | null, category: string, seats: number) => ({ degree, specialty, quota, category, seats }) as SeatRow;
  const rows = [row("MD", "ANAES", "All India", "Open", 2), row("MD", "ANAES", "All India", "OBC", 1), row("DNB", "ANAES", "All India", "OBC", 7), row("MD", "ANAES", "Deemed/Paid Seats", "OBC", 3)];
  const md = { degree: "MD", specialty: "ANAES", quota: "All India" };
  expect(optionSeats(rows, md, ["Open", "OBC"])).toBe(3);
  expect(optionSeats(rows, md)).toBe(3);
  expect(optionSeats(rows, md, ["SC"])).toBeNull();
  expect(optionSeats(rows, { ...md, degree: "DNB" }, ["OBC"])).toBe(7);
});

it("websiteUrl: the MCC profile's website as an http(s) link, never another scheme", () => {
  expect(websiteUrl("www.avmc.edu.in")).toBe("http://www.avmc.edu.in/");
  expect(websiteUrl("https://www.aakashhospital.in/")).toBe("https://www.aakashhospital.in/");
  expect(websiteUrl("javascript:alert(1)")).toBeNull();
  expect(websiteUrl("localhost:3000")).toBeNull();
  expect(websiteUrl(null)).toBeNull();
});

describe("institutesByTerms on the test fixture", () => {
  beforeAll(() => setTestCatalog(fx));
  afterAll(() => setTestCatalog(null));
  it("an institute passes when one of its options does; not declared is left out (and counted) unless nd=keep", async () => {
    const sorted = (xs: Iterable<string>) => [...xs].sort();
    expect(await institutesByTerms({})).toBeNull();
    const cap = (await institutesByTerms({ maxFee: 1 }))!;
    const keep = (await institutesByTerms({ maxFee: 1, keepUnknown: true }))!;
    expect(keep.unknown.size).toBe(0);
    expect(sorted(keep.pass)).toEqual(sorted([...cap.pass, ...cap.unknown]));
    // A cap above every fee: no institute fails it; the ones with no year-1 fee anywhere are the unknown ones.
    const loose = (await institutesByTerms({ maxFee: 1e12 }))!;
    expect(loose.pass.size).toBeGreaterThan(0);
    expect(sorted([...loose.pass, ...loose.unknown])).toEqual(sorted(fx.colleges.map((c) => c.key)));
    // No type in the memory catalog: a type filter lists none, and never as unknown; "No bond" is never unknown either.
    const typed = (await institutesByTerms({ types: ["govt"], keepUnknown: true }))!;
    expect(typed.pass.size + typed.unknown.size).toBe(0);
    expect((await institutesByTerms({ maxBondYears: 0 }))!.unknown.size).toBe(0);
  });
});

it("reportedCount: a count without its own entry keeps only the block's period flag, in view and in its source line", () => {
  const meta = { source_type: "nirf", url: "https://example.org", period: "2022", checked: "2026-11-15", flags: ["self_reported", "old", "conflicting", "derived"] } as never;
  const inherited = reportedCount({ n: 3522, meta, own: false });
  expect(inherited.flags).toEqual(["old"]);
  expect(inherited.meta!.flags).toEqual(["self_reported", "old"]);
  expect(inherited.conflicting).toBe(false);
  const own = reportedCount({ n: 500, meta, own: true });
  expect(own.meta!.flags).toEqual(["self_reported", "old", "conflicting", "derived"]);
  expect(own.conflicting).toBe(true);
  expect(reportedCount({ n: 1, meta: null, own: true }).meta).toBeNull();
});

// Real MCC data (DATABASE_URL set): the SQL path agrees with the allotment rows.
describe.skipIf(!process.env.DATABASE_URL)("countAllotments on real data", () => {
  it("sums to the institute's allotment count", async () => {
    const cat = await getCatalog();
    const college = cat.options[0].college;
    const cs = [...cat.pairs.values()].filter((p) => p.college === college).map((p) => p.cs);
    const counts = await countAllotments(cat, cs);
    const { total } = await findAllotments(cat, { cs }, { limit: 1, count: true });
    expect(counts.reduce((a, r) => a + r.n, 0)).toBe(total);
    expect(total).toBeGreaterThan(0);
  });
});

describe("key facts rows", () => {
  const row = (id: string, quota: string, clear: number | null, n: Record<number, number | null>, grid: OptionRow["grid"] = {}) => ({ id, quota, seatsBy: clear == null ? {} : { clear }, allotmentsByYear: n, grid }) as unknown as OptionRow;
  it("hers with a profile; else open quotas first, then clear seats, then the newest year's allotments; at most KEY_ROWS", () => {
    const a = row("a", "NRI", 9, { 2025: 9 }), b = row("b", "All India", 1, { 2025: 1 }), c = row("c", "DNB Quota", 3, { 2025: 1 }), d = row("d", "All India", null, { 2025: 5, 2026: null });
    expect(keyRows([a, b, c, d], [a]).map((r) => r.id)).toEqual(["a"]);
    expect(keyRows([a, b, c, d], []).map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
    expect(keyRows(Array.from({ length: 9 }, (_, i) => row(String(i), "All India", i, {})), null)).toHaveLength(KEY_ROWS);
  });
  it("the newest closing: newest year, its last round", () => {
    const cell = (closing: number) => ({ closing, category: "Open" as const, n: 1, provisional: false });
    expect(newestClosing({ 2025: { R1: cell(1), stray: cell(3) }, 2026: { R1: cell(2) } })).toMatchObject({ closing: 2, year: 2026, round: "R1" });
    expect(newestClosing({ 2025: { R1: cell(1), R3: cell(3) } })).toMatchObject({ closing: 3, round: "R3" });
    expect(newestClosing({})).toBeNull();
  });
});
