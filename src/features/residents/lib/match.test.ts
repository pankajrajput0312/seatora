import { describe, expect, it } from "vitest";
import { residentSchema, type Resident } from "../schema";
import { groupByCollege } from "./match";

// Test fixtures only; never rendered.
const r = (name: string, rank: number, college: string, extra: Partial<Resident> = {}): Resident =>
  residentSchema.parse({ name, rank, category: "Open", quota: "AIQ", year: 2025, college, course: "MD General Medicine", consent: true, ...extra });

const list = [r("A", 20000, "Zeta College"), r("B", 5000, "Alpha College"), r("C", 11000, "Zeta College", { course: "MS Orthopaedics" })];

describe("groupByCollege", () => {
  it("groups residents under their college, alphabetically without a rank", () => {
    const g = groupByCollege(list, { rank: null, query: "" });
    expect(g.map((x) => x.college)).toEqual(["Alpha College", "Zeta College"]);
    expect(g[1].residents.map((x) => x.name)).toEqual(["C", "A"]);
  });
  it("orders colleges and residents by closeness to your rank", () => {
    const g = groupByCollege(list, { rank: 12000, query: "" });
    expect(g.map((x) => x.college)).toEqual(["Zeta College", "Alpha College"]);
    expect(g[0].residents.map((x) => [x.name, x.fit])).toEqual([["C", "near"], ["A", "inside"]]);
  });
  it("searches name, college, course and state", () => {
    expect(groupByCollege(list, { rank: null, query: "ortho" }).flatMap((g) => g.residents.map((x) => x.name))).toEqual(["C"]);
    expect(groupByCollege(list, { rank: null, query: "alpha" }).map((g) => g.college)).toEqual(["Alpha College"]);
  });
});

describe("residentSchema", () => {
  const base = { name: "X", rank: 1, category: "Open", quota: "AIQ", year: 2025, college: "Y", course: "Z" };
  it("rejects entries without consent or with unknown fields", () => {
    expect(residentSchema.safeParse(base).success).toBe(false);
    expect(residentSchema.safeParse({ ...base, consent: true, phone: "1" }).success).toBe(false);
  });
  it("validates contact details", () => {
    expect(residentSchema.safeParse({ ...base, consent: true, contact: { whatsapp: "+919812345678", instagram: "dr.x" } }).success).toBe(true);
    expect(residentSchema.safeParse({ ...base, consent: true, contact: { whatsapp: "98123" } }).success).toBe(false);
    expect(residentSchema.safeParse({ ...base, consent: true, contact: { linkedin: "https://evil.com/x" } }).success).toBe(false);
  });
});
