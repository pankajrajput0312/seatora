import { describe, expect, it } from "vitest";
import { residentSchema, type Resident } from "../schema";
import { matchResidents } from "./match";

// Test fixtures only; never rendered.
const r = (name: string, rank: number, extra: Partial<Resident> = {}): Resident =>
  residentSchema.parse({ name, rank, category: "Open", quota: "AIQ", year: 2025, college: `College ${name}`, course: "MD General Medicine", consent: true, ...extra });

const list = [r("A", 20000), r("B", 5000, { category: "OBC" }), r("C", 11000, { course: "MS Orthopaedics" })];

describe("matchResidents", () => {
  it("sorts by rank when no rank is entered", () => {
    expect(matchResidents(list, { rank: null, category: "All", query: "" }).map((m) => m.name)).toEqual(["B", "C", "A"]);
  });
  it("orders by closeness to your rank and labels fit", () => {
    const m = matchResidents(list, { rank: 10000, category: "All", query: "" });
    expect(m.map((x) => x.name)).toEqual(["C", "B", "A"]);
    expect(m.map((x) => x.fit)).toEqual(["near", "beyond", "inside"]);
  });
  it("filters by category and search text", () => {
    expect(matchResidents(list, { rank: null, category: "OBC", query: "" }).map((m) => m.name)).toEqual(["B"]);
    expect(matchResidents(list, { rank: null, category: "All", query: "ortho" }).map((m) => m.name)).toEqual(["C"]);
  });
});

describe("residentSchema", () => {
  it("rejects entries without consent or with unknown fields", () => {
    expect(residentSchema.safeParse({ name: "X", rank: 1, category: "Open", quota: "AIQ", year: 2025, college: "Y", course: "Z" }).success).toBe(false);
    expect(residentSchema.safeParse({ name: "X", rank: 1, category: "Open", quota: "AIQ", year: 2025, college: "Y", course: "Z", consent: true, phone: "1" }).success).toBe(false);
  });
});
