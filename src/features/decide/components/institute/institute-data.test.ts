import { describe, expect, it } from "vitest";
import { getCatalog, memoryCatalog, yearsOf } from "../../server/catalog";
import { countAllotments, findAllotments } from "../../server/queries";
import type { SeatRow } from "../../server/seats";
import { decideDemoData as fx } from "../../test/decide.demo";
import type { Source } from "../../types";
import { allotmentMix, optionSeats, websiteUrl } from "./institute-data";

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
