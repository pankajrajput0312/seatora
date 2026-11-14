import { describe, expect, it } from "vitest";
import { mccAllotmentSchema, mccCutoffSchema, mccTermSchema, movedPlaces } from "./import-schema";

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

describe("mccTermSchema", () => {
  const profile = "https://mcc.admissions.nic.in/Counseling/Handler/ViewInstituteProfileDynamic.ashx?boardId=140012521&InstituteId=700421&Type=BM";
  const t = { ikey: "HAMDARDINSTITUTEOFMEDICALSCIENCESANDRESE#110062", program: "MD", text: "No service bond (per the college's MCC bond document)", amount_inr: 0, src_url: profile };
  const ok = (x: object) => mccTermSchema.safeParse(x).success;
  it("BOND and PENALTY carry their record; FEE and STIPEND none", () => {
    expect(ok({ ...t, kind: "BOND", details: { status: "no", doc_url: profile, doc_year: "2025", checked: true } })).toBe(true);
    expect(ok({ ...t, kind: "BOND" })).toBe(false);
    expect(ok({ ...t, kind: "PENALTY", amount_inr: null, details: { items: [{ kind: "other", applies_to: "PG", inr: null, when: "leaving", quote: null, source_url: profile }] } })).toBe(true);
    expect(ok({ ...t, kind: "PENALTY", details: { status: "no" } })).toBe(false);
    expect(ok({ ...t, kind: "FEE", details: { status: "no" } })).toBe(false);
  });
  it("only an unknown bond may have no source; extra keys fail", () => {
    expect(ok({ ...t, kind: "BOND", amount_inr: null, src_url: null, details: { status: "unknown", reason: "state_not_researched" } })).toBe(true);
    expect(ok({ ...t, kind: "BOND", src_url: null, details: { status: "no" } })).toBe(false);
    expect(ok({ ...t, kind: "BOND", details: { status: "no", name: "Someone" } })).toBe(false);
  });
});

describe("movedPlaces", () => {
  const after = new Map([["KEPT#411018", "411018"], ["MERGED#700029", "700029"], ["SAME#110062", "110062"]]);
  const now = (k: string) => ({ OLD: "MERGED#700029", GONE: null })[k] ?? k;
  it("moves the hides of a kept college given a PIN and of a retired college whose successor is elsewhere, nothing else", () => {
    expect(
      movedPlaces(
        [
          { key: "KEPT#411018", pincode: null }, // the old bundle had no PIN: its place was the key
          { key: "OLD", pincode: "700020" },
          { key: "SAME#110062", pincode: "110062" },
          { key: "GONE", pincode: "560001" },
        ],
        after,
        now,
      ),
    ).toEqual([{ from: "KEPT#411018", to: "411018" }, { from: "700020", to: "700029" }]);
  });
});
