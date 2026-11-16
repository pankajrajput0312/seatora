import { describe, expect, it } from "vitest";
import type { Cutoff, Round } from "../types";
import { buildGrid, classifyReach, deepestByYear, eligibleCategories, reachEvidence, reachLabel, resultsSpan, seatsBelow, seatsBelowNotes } from "./reach";

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
    expect(classifyReach(42000, [c(2024, "R2", 43000), c(2025, "R2", 50000)], opts)).toBe("reached-both");
    expect(classifyReach(42000, [c(2024, "R1", 30000), c(2025, "R3", 42000)], opts)).toBe("reached-one");
    expect(classifyReach(42000, [c(2025, "R1", 39000)], opts)).toBe("within-10");
    expect(classifyReach(42000, [c(2025, "R1", 20000)], opts)).toBe("closed-before");
    expect(classifyReach(42000, [], opts)).toBe("no-data");
  });
  it("never calls an option reached from a stray round alone (R1 to R3 closed far earlier)", () => {
    // Gandhi Medical College Bhopal, MD Radio-diagnosis, Open, for AIR 3,150: 2024 special stray 3,394; R3 2025 946; R1 2026 1,055.
    const gmc = [c(2024, "special_stray", 3394), c(2025, "R3", 946), c(2026, "R1", 1055)];
    expect(classifyReach(3150, gmc, opts)).toBe("stray-only");
    expect(classifyReach(42000, [c(2024, "R2", 43000), c(2025, "stray", 50000)], opts)).toBe("reached-one");
    expect(classifyReach(42000, [c(2024, "stray", 39000), c(2025, "R1", 20000)], opts)).toBe("closed-before");
    expect(classifyReach(42000, [{ year: 2025, closing: 43000 }], opts)).toBe("reached-one"); // no round (SQL per-year): R1 to R3
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
    // With the closing each label rests on, the note says it with its year and round, never as a second verdict.
    const at = { Open: { year: 2025, round: "R3", closing: 38120 }, OBC: { year: 2026, round: "R1", closing: 44810 } } as const;
    const both = seatsBelow("reached-latest", by, { clear: ["Open"], virtual: ["Open"] }, at);
    expect(seatsBelowNotes(both, 2026, [2024, 2025])).toEqual([
      "In the clear vacancy and virtual vacancy lists, the seats here you can take are Open seats only. On Open seats: deepest closing 38,120 in 2025 R3, before your rank.",
    ]);
    expect(seatsBelowNotes(seatsBelow("reached-one", { Open: "no-data", OBC: "reached-one" }, { new: ["Open"] }, { Open: null }), 2026, [2024, 2025])).toEqual([
      "In the newly added list, the seats here you can take are Open seats only. On Open seats: no allotment in 2024, 2025 or 2026 R1.",
    ]);
    // Seats on the category the label comes from, or no seats at all: nothing to say.
    expect(seatsBelow("reached-latest", by, { clear: ["OBC"], virtual: [] })).toEqual([]);
    // One seat category: its label is the option's.
    expect(seatsBelow("within-10", { Open: "within-10" }, { clear: ["Open"] })).toEqual([]);
  });
});

describe("reachEvidence", () => {
  const w = { latestYear: 2026, pastYears: [2024, 2025] as [number, number], includeLatest: true };
  const cs = [
    { year: 2025, round: "R3", closing: 38120 },
    { year: 2025, round: "stray", closing: 60000 },
    { year: 2024, round: "R2", closing: 30000 },
    { year: 2023, round: "R1", closing: 90000 }, // outside the window
    { year: 2026, round: "R2", closing: 70000 }, // the latest year counts R1 only
  ] as const;
  it("the deepest R1 to R3 closing the label counts; a stray round only for stray-only", () => {
    expect(classifyReach(42284, [...cs], w)).toBe("stray-only");
    expect(reachEvidence([...cs], "closed-before", w)).toEqual({ year: 2025, round: "R3", closing: 38120 });
    expect(reachEvidence([...cs], "stray-only", w)).toEqual({ year: 2025, round: "stray", closing: 60000 });
    expect(reachEvidence([], "no-data", w)).toBeNull();
  });
});

describe("resultsSpan", () => {
  it("names the oldest year to the newest year's last round", () => {
    expect(resultsSpan([{ year: 2026, rounds: ["R1"] }, { year: 2025, rounds: ["R1", "R2", "R3", "stray"] }, { year: 2023, rounds: ["R1"] }])).toBe("2023 to 2026 R1");
    expect(resultsSpan([{ year: 2025, rounds: ["R1", "stray"] }])).toBe("2025 Stray");
    expect(resultsSpan([])).toBe("");
  });
});
