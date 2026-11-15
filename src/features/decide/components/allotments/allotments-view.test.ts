import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { setTestCatalog } from "../../server/catalog";
import { decideDemoData as fx } from "../../test/decide.demo";
import { feeValue } from "../../lib/term-filters";
import { allotmentsCsv, allotmentsView } from "./allotments-view";

vi.stubEnv("DATABASE_URL", "");
beforeAll(() => setTestCatalog(fx));
afterAll(() => setTestCatalog(null));

it("reads the page's params as the page does: no filter = the latest round, a bad range is reported and not applied, an unknown inst is null", async () => {
  const p = (await allotmentsView(new URLSearchParams(), 10))!;
  expect(p.filters).toMatchObject({ year: p.meta.years[0].year, round: p.meta.years[0].rounds.at(-1) });
  const bad = (await allotmentsView(new URLSearchParams("from=abc&year=2025"), 10))!;
  expect([bad.latest, bad.filters.from, bad.filters.year]).toEqual([undefined, undefined, 2025]);
  expect(bad.rankError).toMatch(/not applied/);
  expect(await allotmentsView(new URLSearchParams("inst=no-such-college"), 10)).toBeNull();
});

it("CSV: candidate category, choice no., status, the previous seat with its remark, — when missing, the result PDFs after the rows", async () => {
  const { r, meta } = (await allotmentsView(new URLSearchParams("year=2025&round=R2"), 2))!;
  const [a, b] = r.rows;
  const prev = { college: "K", degree: "MD", specialty: "X", quota: "All India", remark: "seat_surrendered" as const, collegeName: "Prev College", collegeSlug: "prev", courseName: "MD X" };
  const lines = allotmentsCsv([{ ...a, candidateCategory: "OBC", optionNo: 7, status: "upgraded", prev }, b], meta.sources, ["A note"]).split("\r\n");
  expect(lines[0]).toContain(",Seat category,Candidate category,Choice no.,Status,Institute,");
  expect(lines[1]).toContain(`,${a.category},OBC,7,Upgraded,`);
  expect(lines[1]).toContain(",Prev College,MD X,All India,seat surrendered,");
  // The stat cells' plain numbers after the previous seat ("—" when not declared), then type and beds.
  expect(lines[0]).toContain(",Previous seat remark,Fee year 1 ₹,Stipend year 1 ₹/month,Bond years,Bond ₹ (highest),Leaving penalty ₹ (highest),Type (not official),Beds (self-reported),");
  const n = (x: number | null) => (x == null ? "—" : String(x));
  expect(lines[1]).toContain(`,seat surrendered,${[feeValue.fee1(a.fees), feeValue.stip1(a.fees), feeValue.bondyrs(a.fees), feeValue.bond(a.fees), feeValue.leave(a.fees)].map(n).join(",")},—,—,`);
  expect(lines[2]).toMatch(/,—,—,(Fresh|Upgraded),.*,—,—,—,—,/); // no candidate category, choice no. or previous seat
  expect(lines).toContain("A note");
  expect(lines.filter((l) => l.includes("2025 R2 allotments")).length).toBe(1);
});

it("unknownTerms: the rows Include not declared (nd=keep) would add; 0 with it ticked or with no term filter", async () => {
  const strict = (await allotmentsView(new URLSearchParams("year=all&minstip=50000"), 10))!;
  const keep = (await allotmentsView(new URLSearchParams("year=all&minstip=50000&nd=keep"), 10))!;
  expect(strict.r.unknownTerms).toBeGreaterThan(0);
  expect(strict.r.unknownTerms).toBe(keep.r.total - strict.r.total);
  expect(keep.r.unknownTerms).toBe(0);
  expect((await allotmentsView(new URLSearchParams("year=all"), 10))!.r.unknownTerms).toBe(0);
});
