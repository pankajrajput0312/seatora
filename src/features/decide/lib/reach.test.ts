import { describe, expect, it } from "vitest";
import type { Cutoff, Round, Source } from "../types";
import { bestClosing, buildGrid, classifyReach, deepestByYear, deepestOf, deepestText, eligibleCategories, latestRound, latestText, reachEvidence, reachLabel, reachWindow, resultsSpan, seatsBelow, seatsBelowNotes } from "./reach";

const c = (year: number, round: Round, closing: number, category: Cutoff["category"] = "Open"): Cutoff => ({
  college: "X", degree: "MD", specialty: "ANAESTHESIOLOGY", year, round, quota: "All India", category,
  opening: Math.round(closing * 0.8), closing, n: 1, src: `${year}-${round}`,
});
// Today's data: 2026 R1 is the latest round.
const R1 = { year: 2026, round: "R1" } as const;
const opts = { latest: R1, pastYears: [2024, 2025] as [number, number], includeLatest: true };

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
  expect(reachLabel("no-data", R1, [2024, 2025])).toBe("No allotment in your categories in 2024, 2025 or 2026 R1");
  expect(reachLabel("no-data", R1, [2024, 2025], false)).toBe("No allotment in your categories in 2024 or 2025");
  expect(reachLabel("reached-one", R1, [2024, 2025])).toBe("Reached in 2024 or 2025");
});

describe("labels on one seat category", () => {
  it("names the seat category in the no-data wording (a Seats row), hers otherwise", () => {
    expect(reachLabel("no-data", R1, [2024, 2025])).toBe("No allotment in your categories in 2024, 2025 or 2026 R1");
    expect(reachLabel("no-data", R1, [2024, 2025], true, "OBC")).toBe("No allotment on OBC seats in 2024, 2025 or 2026 R1");
    expect(reachLabel("closed-before", R1, [2024, 2025], true, "OBC")).toBe("Closed before your rank");
  });
  it("seatsBelow: a list whose seats here are all on categories whose own label is not the option's", () => {
    // GMERS Vadnagar NBEMS Diploma Anaesthesiology for an OBC profile: the label is OBC's; clear vacancy prints Open seats only.
    const by = { Open: "closed-before", OBC: "reached-latest" } as const;
    const below = seatsBelow("reached-latest", by, { clear: ["Open"], virtual: ["OBC", "Open"], new: [] });
    expect(below).toEqual([{ kind: "clear", on: [{ category: "Open", reach: "closed-before" }] }]);
    // With the closing each label rests on, the note says it with its year and round, never as a second verdict.
    const at = { Open: { year: 2025, round: "R3", closing: 38120 }, OBC: { year: 2026, round: "R1", closing: 44810 } } as const;
    const both = seatsBelow("reached-latest", by, { clear: ["Open"], virtual: ["Open"] }, at);
    expect(seatsBelowNotes(both, R1, [2024, 2025])).toEqual([
      "In the clear vacancy and virtual vacancy lists, the seats here you can take are Open seats only. On Open seats: deepest closing 38,120 in 2025 R3, before your rank.",
    ]);
    expect(seatsBelowNotes(seatsBelow("reached-one", { Open: "no-data", OBC: "reached-one" }, { new: ["Open"] }, { Open: null }), R1, [2024, 2025])).toEqual([
      "In the newly added list, the seats here you can take are Open seats only. On Open seats: no allotment in 2024, 2025 or 2026 R1.",
    ]);
    // Seats on the category the label comes from, or no seats at all: nothing to say.
    expect(seatsBelow("reached-latest", by, { clear: ["OBC"], virtual: [] })).toEqual([]);
    // One seat category: its label is the option's.
    expect(seatsBelow("within-10", { Open: "within-10" }, { clear: ["Open"] })).toEqual([]);
  });
});

describe("reachEvidence", () => {
  const w = { latest: R1, pastYears: [2024, 2025] as [number, number], includeLatest: true };
  const cs = [
    { year: 2025, round: "R3", closing: 38120 },
    { year: 2025, round: "stray", closing: 60000 },
    { year: 2024, round: "R2", closing: 30000 },
    { year: 2023, round: "R1", closing: 90000 }, // outside the window
    { year: 2026, round: "R2", closing: 70000 }, // past the latest round (R1): not counted
  ] as const;
  it("the deepest R1 to R3 closing the label counts; a stray round only for stray-only", () => {
    expect(classifyReach(42284, [...cs], w)).toBe("stray-only");
    // Stray left out of the label's closing comes with it as its own number ("deepest before Stray").
    expect(reachEvidence([...cs], "closed-before", w)).toEqual({ year: 2025, round: "R3", closing: 38120, stray: { year: 2025, round: "stray", closing: 60000 } });
    expect(seatsBelowNotes([{ kind: "clear", on: [{ category: "Open", reach: "closed-before", at: reachEvidence([...cs], "closed-before", w) }] }], R1, [2024, 2025])).toEqual([
      "In the clear vacancy list, the seats here you can take are Open seats only. On Open seats: deepest before Stray 38,120 in 2025 R3, before your rank. Stray: 60,000 in 2025.",
    ]);
    expect(reachEvidence([...cs], "stray-only", w)).toEqual({ year: 2025, round: "stray", closing: 60000 });
    expect(reachEvidence([], "no-data", w)).toBeNull();
  });
});

describe("the latest round (latestRound): the labels count the latest year's R1 up to its newest round", () => {
  const results = (...latest: Pick<Source, "round" | "provisional">[]) => [{ year: 2025, round: "R3", provisional: false } as const, ...latest.map((s) => ({ year: 2026, ...s }))];
  const past = [2024, 2025] as [number, number];
  it("only 2026 R1: R1, every label and note as before", () => {
    expect(latestRound(results({ round: "R1", provisional: false }))).toEqual({ ...R1, provisional: false });
    expect(latestRound(results({ round: "R1", provisional: true })).provisional).toBe(true);
    expect(latestRound([])).toEqual({ ...R1, provisional: false }); // no 2026 result yet: R1, as before
    expect(latestText(R1)).toBe("2026 R1");
    expect(reachLabel("reached-latest", R1, past)).toBe("Reached in 2026 R1");
    expect(reachWindow(R1, past)).toBe("2024, 2025 and 2026 R1");
    expect(reachWindow(R1, past, false)).toBe("2024 and 2025");
  });
  it("2026 R2 provisional: R2 and provisional; the labels say R1 to R2, R1 without it", () => {
    const l = latestRound(results({ round: "R1", provisional: false }, { round: "R2", provisional: true }));
    expect(l).toEqual({ year: 2026, round: "R2", provisional: true });
    expect(latestText(l)).toBe("2026 R1 to R2");
    expect(reachLabel("reached-latest", l, past)).toBe("Reached in 2026 R1 to R2");
    expect(reachLabel("no-data", l, past, true, "OBC")).toBe("No allotment on OBC seats in 2024, 2025 or 2026 R1 to R2");
    expect(seatsBelowNotes([{ kind: "clear", on: [{ category: "Open", reach: "no-data" }] }], l, past)).toEqual([
      "In the clear vacancy list, the seats here you can take are Open seats only. On Open seats: no allotment in 2024, 2025 or 2026 R1 to R2.",
    ]);
    // Without the provisional R2 (Options' toggle): the final R1 still counts.
    expect(reachLabel("reached-latest", l, past, false)).toBe("Reached in 2026 R1");
    expect(reachWindow(l, past, false)).toBe("2024, 2025 and 2026 R1");
    const w = { latest: l, pastYears: past, includeLatest: true };
    // Reached in R2 alone: the label rests on the provisional R2 (another label without it).
    const r2 = [c(2026, "R1", 39000), c(2026, "R2", 43000), c(2025, "R3", 30000)];
    expect(classifyReach(42000, r2, w)).toBe("reached-latest");
    expect(classifyReach(42000, r2, { ...w, includeLatest: false })).toBe("within-10");
    // Reached in R1, R2 closing lower (later rounds count only new allotments and upgrades): reached either way.
    const r1 = [c(2026, "R1", 45000), c(2026, "R2", 30000)];
    expect([classifyReach(42000, r1, w), classifyReach(42000, r1, { ...w, includeLatest: false })]).toEqual(["reached-latest", "reached-latest"]);
    expect(reachEvidence(r1, "reached-latest", w)).toEqual({ year: 2026, round: "R1", closing: 45000 });
  });
  it("2026 R2 final: not provisional", () => {
    expect(latestRound(results({ round: "R1", provisional: false }, { round: "R2", provisional: false }))).toEqual({ year: 2026, round: "R2", provisional: false });
  });
});

describe("resultsSpan", () => {
  it("names the oldest year to the newest year's last round", () => {
    expect(resultsSpan([{ year: 2026, rounds: ["R1"] }, { year: 2025, rounds: ["R1", "R2", "R3", "stray"] }, { year: 2023, rounds: ["R1"] }])).toBe("2023 to 2026 R1");
    expect(resultsSpan([{ year: 2025, rounds: ["R1", "stray"] }])).toBe("2025 Stray");
    expect(resultsSpan([])).toBe("");
  });
});

describe("deepest closing: one definition on every screen", () => {
  // CIHSR DNB Family Medicine, DNB Quota, Open: Seats showed 45,182 (2025 R3, Stray left out) while Compare and the
  // Details sheet showed 60,351 (2025 Stray). Every screen now reads deepestOf: every round, Stray included.
  const cihsr = [c(2025, "R1", 34413), c(2025, "R2", 38760), c(2025, "R3", 45182), c(2025, "stray", 60351), c(2026, "R1", 38808)];
  it("Seats (deepestOf over the rounds) and Options/Compare (deepestByYear) agree, Stray included", () => {
    expect(deepestOf(cihsr)).toMatchObject({ year: 2025, round: "stray", closing: 60351 });
    expect(deepestByYear(cihsr, new Set()).get(2025)).toMatchObject({ round: "stray", closing: 60351 });
    expect(deepestText(deepestOf(cihsr)!)).toBe("Deepest 2025: 60,351 (Stray)");
    expect(deepestOf([])).toBeNull();
  });
  it("ties keep the earliest round", () => {
    expect(deepestOf([c(2025, "R2", 500), c(2025, "R3", 500)])).toMatchObject({ round: "R2" });
  });
});

describe("bestClosing (Last ranks' closing-rank filter)", () => {
  const grid = { 2024: { R1: { closing: 30_000 }, R3: { closing: 47_000 } }, 2025: { R1: { closing: 41_000 }, R2: undefined } };
  it("gives the deepest closing in range, from a year, or -1", () => {
    expect(bestClosing(grid, { min: 44_238 })).toBe(47_000); // her rank would have got it in 2024 R3
    expect(bestClosing(grid, { min: 44_238, since: 2025 })).toBe(-1);
    expect(bestClosing(grid, { min: 39_814, max: 48_662 })).toBe(47_000);
    expect(bestClosing(grid, { max: 35_000 })).toBe(30_000);
    expect(bestClosing(grid, {})).toBe(47_000);
  });
});
