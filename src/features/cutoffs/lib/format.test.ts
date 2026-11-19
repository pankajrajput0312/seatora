import { describe, expect, it } from "vitest";
import { compactRank, formatINR, formatRank } from "./format";

describe("format", () => {
  it("groups ranks the Indian way", () => expect(formatRank(123456)).toBe("1,23,456"));
  it("shows a dash for missing data instead of zero", () => {
    expect(formatRank(null)).toBe("—");
    expect(formatINR(null)).toBe("—");
  });
  it("formats rupees without paise", () => expect(formatINR(150000)).toBe("₹1,50,000"));
});

describe("compactRank", () => {
  it("rounds down to the thousand (a tenth under 10k), never cuts digits off", () => {
    expect([980, 1000, 1549, 9999, 42000, 42999, 123456].map(compactRank)).toEqual(["980", "1k", "1.5k", "9.9k", "42k", "42k", "123k"]);
  });
});
