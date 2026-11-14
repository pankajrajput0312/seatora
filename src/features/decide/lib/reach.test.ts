import { describe, expect, it } from "vitest";
import type { Cutoff, Round } from "../types";
import { buildGrid, classifyReach, deepestByYear, eligibleCategories, reachLabel, seatsBelow, seatsBelowText } from "./reach";

const c = (year: number, round: Round, closing: number, category: Cutoff["category"] = "Open"): Cutoff => ({
  college: "X", degree: "MD", specialty: "ANAESTHESIOLOGY", year, round, quota: "All India", category,
  opening: Math.round(closing * 0.8), closing, n: 1, src: `${year}-${round}`,
});
const opts = { latestYear: 2026, pastYears: [2024, 2025] as [number, number], includeLatest: true };

describe("eligibleCategories", () => {
  it("includes Open, own category and PwD seats", () => {
    expect(eligibleCategories("Open", false)).toEqual(["Open"]);
    expect(eligibleCategories("OBC", false)).toEqual(["Open", "OBC"]);
    expect(eligibleCategories("OBC", true)).toEqual(["Open", "OBC", "Open PwD", "OBC PwD"]);
  });
});

describe("classifyReach", () => {
  it("labels from history, latest R1 first", () => {
    expect(classifyReach(42000, [c(2026, "R1", 45000), c(2024, "R1", 10000)], opts)).toBe("reached-latest");
    expect(classifyReach(42000, [c(2024, "R2", 43000), c(2025, "stray", 50000)], opts)).toBe("reached-both");
    expect(classifyReach(42000, [c(2024, "R1", 30000), c(2025, "R3", 42000)], opts)).toBe("reached-one");
    expect(classifyReach(42000, [c(2025, "R1", 39000)], opts)).toBe("within-10");
    expect(classifyReach(42000, [c(2025, "R1", 20000)], opts)).toBe("closed-before");
    expect(classifyReach(42000, [], opts)).toBe("no-data");
  });
  it("ignores the provisional latest year when excluded", () => {
    expect(classifyReach(42000, [c(2026, "R1", 45000)], { ...opts, includeLatest: false })).toBe("no-data");
  });
});

it("deepestByYear keeps the highest closing per year with its round", () => {
  const d = deepestByYear([c(2025, "R1", 30000), c(2025, "R3", 38000), c(2025, "R2", 35000, "OBC")], new Set());
  expect(d.get(2025)).toMatchObject({ closing: 38000, round: "R3", category: "Open" });
});

describe("review fixes", () => {
  it("ignores years outside the labels (a 2023 closing can't make it 'within 10%')", () => {
    expect(classifyReach(42284, [c(2023, "R1", 60000)], opts)).toBe("no-data");
    expect(classifyReach(42284, [c(2023, "R1", 60000), c(2025, "R1", 20000)], opts)).toBe("closed-before");
  });
  it("uses the agreed within-10% boundary: closing >= rank * 0.9", () => {
    expect(classifyReach(42284, [c(2025, "R1", 38100)], opts)).toBe("within-10");
    expect(classifyReach(42284, [c(2025, "R1", 38000)], opts)).toBe("closed-before");
  });
  it("grid counts allotments in every category but takes closing from hers", () => {
    const all = [c(2026, "R1", 17213, "OBC"), c(2026, "R1", 9000, "Open"), { ...c(2026, "R1", 30000, "SC"), n: 4 }];
    all[0].n = 5; all[1].n = 3;
    const g = buildGrid(all, new Set(["Open", "OBC"]), new Set(["2026-R1"]));
    expect(g[2026].R1).toEqual({ closing: 17213, category: "OBC", n: 12, provisional: true });
  });
});

it("labels name the years they count (2023 is shown in the grids, never counted)", () => {
  expect(reachLabel("no-data", 2026, [2024, 2025])).toBe("No allotment in your categories in 2024, 2025 or 2026 R1");
  expect(reachLabel("no-data", 2026, [2024, 2025], false)).toBe("No allotment in your categories in 2024 or 2025");
  expect(reachLabel("reached-one", 2026, [2024, 2025])).toBe("Reached in 2024 or 2025");
});

describe("labels on one seat category", () => {
  it("names the seat category in the no-data wording (a Seats row), hers otherwise", () => {
    expect(reachLabel("no-data", 2026, [2024, 2025])).toBe("No allotment in your categories in 2024, 2025 or 2026 R1");
    expect(reachLabel("no-data", 2026, [2024, 2025], true, "OBC")).toBe("No allotment on OBC seats in 2024, 2025 or 2026 R1");
    expect(reachLabel("closed-before", 2026, [2024, 2025], true, "OBC")).toBe("Closed before your rank");
  });
  it("seatsBelow: a list whose seats here are all on categories whose own label is not the option's", () => {
    // GMERS Vadnagar NBEMS Diploma Anaesthesiology for an OBC profile: the label is OBC's; clear vacancy prints Open seats only.
    const by = { Open: "closed-before", OBC: "reached-latest" } as const;
    const below = seatsBelow("reached-latest", by, { clear: ["Open"], virtual: ["OBC", "Open"], new: [] });
    expect(below).toEqual([{ kind: "clear", on: [{ category: "Open", reach: "closed-before" }] }]);
    expect(seatsBelowText(below[0], 2026, [2024, 2025])).toBe(
      "In the clear vacancy list, your seat categories here have only Open seats; on Open seats alone: Closed before your rank.",
    );
    // Seats on the category the label comes from, or no seats at all: nothing to say.
    expect(seatsBelow("reached-latest", by, { clear: ["OBC"], virtual: [] })).toEqual([]);
    // One seat category: its label is the option's.
    expect(seatsBelow("within-10", { Open: "within-10" }, { clear: ["Open"] })).toEqual([]);
  });
});
