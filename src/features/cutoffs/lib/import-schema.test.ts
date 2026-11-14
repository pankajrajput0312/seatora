import { describe, expect, it } from "vitest";
import { mccAllotmentSchema, mccCutoffSchema } from "./import-schema";

const row = {
  ikey: "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8#400710",
  degree: "DNB",
  specialty: "ANAESTHESIOLOGY",
  year: 2025,
  round: "R1",
  quota: "DNB Quota",
  category: "Open",
  opening: 20000,
  closing: 21699,
  n: 2,
  src: "mcc/2025/R1_final.pdf",
};

describe("mccCutoffSchema", () => {
  it("accepts a valid row", () => expect(mccCutoffSchema.safeParse(row).success).toBe(true));
  it("rejects extra keys such as a candidate name", () =>
    expect(mccCutoffSchema.safeParse({ ...row, name: "Someone" }).success).toBe(false));
  it("rejects opening worse than closing", () =>
    expect(mccCutoffSchema.safeParse({ ...row, opening: 30000 }).success).toBe(false));
});

describe("mccAllotmentSchema", () => {
  const a = {
    year: 2025, round: "stray", rank: 33685, quota: "DNB Quota", category: "Open",
    ikey: "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8#400710", degree: "DNB", specialty: "ANAESTHESIOLOGY", status: "allotted", src: "mcc/2025/stray_final.pdf",
  };
  it("accepts a valid row", () => expect(mccAllotmentSchema.safeParse(a).success).toBe(true));
  it("rejects person-level fields", () => {
    expect(mccAllotmentSchema.safeParse({ ...a, name: "Someone" }).success).toBe(false);
    expect(mccAllotmentSchema.safeParse({ ...a, roll: "1234" }).success).toBe(false);
  });
  it("rejects an unknown status", () => expect(mccAllotmentSchema.safeParse({ ...a, status: "not_reported" }).success).toBe(false));
});
