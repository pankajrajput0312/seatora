import { describe, expect, it } from "vitest";
import { parseRankText } from "./rank-text";

describe("parseRankText", () => {
  it("reads digits with commas or spaces", () => {
    expect(parseRankText("25000")).toBe(25000);
    expect(parseRankText("25,000")).toBe(25000);
    expect(parseRankText("2,50,000")).toBe(250000);
    expect(parseRankText(" 42284 ")).toBe(42284);
  });
  it("rejects anything that isn't a whole number", () => {
    for (const t of ["25000.5", "25k", "-5", "1e5", "0x61A8", "abc", ""]) expect(parseRankText(t)).toBeNaN();
  });
});
