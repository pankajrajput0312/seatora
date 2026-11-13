import { describe, expect, it } from "vitest";
import { rankFit } from "./rank-fit";

describe("rankFit", () => {
  it("classifies against the closing rank with a 10% band", () => {
    expect(rankFit(8000, 10000)).toBe("inside");
    expect(rankFit(9000, 10000)).toBe("inside");
    expect(rankFit(10500, 10000)).toBe("near");
    expect(rankFit(11001, 10000)).toBe("beyond");
  });
  it("returns null when there is no closing rank", () => expect(rankFit(5000, null)).toBeNull());
});
