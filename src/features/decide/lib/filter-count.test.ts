import { describe, expect, it } from "vitest";
import { tally, totalIn } from "./filter-count";

describe("totalIn", () => {
  it("reads the toolbar's count from a page", () => {
    expect(totalIn('<p class="x" data-filter-total="1234"><span>1,234</span></p>')).toBe(1234);
    expect(totalIn('<p data-filter-total="0">')).toBe(0);
  });
  it("is null without one (a sign-in page, an error page)", () => {
    expect(totalIn("<html><body>Sign in</body></html>")).toBeNull();
  });
});

describe("tally", () => {
  const counts = [
    { values: { rcourse: "md-paed", ryear: "2025" }, n: 3 },
    { values: { rcourse: "md-paed", ryear: "2024" }, n: 2 },
    { values: { rcourse: "ms-ortho", ryear: "2025" }, n: 5 },
  ];
  it("counts every group when nothing is ticked", () => expect(tally(counts, new URLSearchParams())).toBe(10));
  it("keeps the groups whose every ticked filter has their value", () => {
    expect(tally(counts, new URLSearchParams("rcourse=md-paed"))).toBe(5);
    expect(tally(counts, new URLSearchParams("ryear=2025"))).toBe(8);
    expect(tally(counts, new URLSearchParams("rcourse=md-paed&rcourse=ms-ortho&ryear=2025"))).toBe(8);
    expect(tally(counts, new URLSearchParams("rcourse=md-paed&ryear=2023"))).toBe(0);
  });
  it("ignores params that are not filters of the groups", () => expect(tally(counts, new URLSearchParams("tab=residents&rank=100"))).toBe(10));
});
