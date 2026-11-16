import { describe, expect, it } from "vitest";
import { displayName } from "./display-name";

describe("displayName", () => {
  it("drops a word repeated next to itself and title-cases one-case words", () => {
    expect(displayName("Pankaj pankaj")).toBe("Pankaj");
    expect(displayName("  pankaj   PANKAJ rajput ")).toBe("Pankaj Rajput");
    expect(displayName("rahul SHARMA")).toBe("Rahul Sharma");
  });
  it("keeps mixed case, apostrophes and hyphens; a blank name is empty", () => {
    expect(displayName("Ronald McDonald")).toBe("Ronald McDonald");
    expect(displayName("o'brien anne-marie")).toBe("O'Brien Anne-Marie");
    expect(displayName("Ram Kumar Ram")).toBe("Ram Kumar Ram");
    expect(displayName("   ")).toBe("");
  });
});
