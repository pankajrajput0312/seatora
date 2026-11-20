import { describe, expect, it } from "vitest";
import { cameFor } from "./came-for";

describe("cameFor", () => {
  it("names the page she came for, with her rank and category on Options", () => {
    expect(cameFor("/decide/options?rank=18500&cat=OBC")).toBe("your options for AIR 18,500 (OBC)");
    expect(cameFor("/decide/options?rank=18500&cat=XYZ")).toBe("your options for AIR 18,500");
    expect(cameFor("/decide/options")).toBe("your options");
    expect(cameFor("/decide/residents")).toBe("the residents at each hospital");
    expect(cameFor("/decide/institutes/aiims-new-delhi?tab=fees")).toBe("this institute's page");
    expect(cameFor("/decide/institutes/aiims-new-delhi?tab=residents")).toBe("this hospital's residents");
    expect(cameFor("/decide/institutes")).toBe("every institute");
    expect(cameFor("/pricing#buy")).toBe("the Season Pass");
    expect(cameFor("/decide")).toBe("your planner");
  });

  it("nothing for no page, another site or a page it doesn't know", () => {
    expect(cameFor(undefined)).toBeNull();
    expect(cameFor("https://evil.example/decide")).toBeNull();
    expect(cameFor("/about")).toBeNull();
    expect(cameFor("/decidex")).toBeNull();
  });
});
