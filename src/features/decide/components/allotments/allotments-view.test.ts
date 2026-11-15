import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { setTestCatalog } from "../../server/catalog";
import { decideDemoData as fx } from "../../test/decide.demo";
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
  expect(lines[2]).toMatch(/,—,—,(Fresh|Upgraded),.*,—,—,—,—,/); // no candidate category, choice no. or previous seat
  expect(lines).toContain("A note");
  expect(lines.filter((l) => l.includes("2025 R2 allotments")).length).toBe(1);
});
