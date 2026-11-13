import { describe, expect, it } from "vitest";
import { formatINR, formatRank } from "./format";

describe("format", () => {
  it("groups ranks the Indian way", () => expect(formatRank(123456)).toBe("1,23,456"));
  it("shows a dash for missing data instead of zero", () => {
    expect(formatRank(null)).toBe("—");
    expect(formatINR(null)).toBe("—");
  });
  it("formats rupees without paise", () => expect(formatINR(150000)).toBe("₹1,50,000"));
});
