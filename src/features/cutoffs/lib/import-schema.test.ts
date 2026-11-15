import { describe, expect, it } from "vitest";
import { citedSources, mccAllotmentSchema, mccAllotmentV2Schema, mccCutoffSchema, mccFeesStructuredSchema, mccTermSchema, movedPlaces } from "./import-schema";

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

describe("mccAllotmentV2Schema", () => {
  const r2 = {
    year: 2023, round: "R2", rank: 23, quota: "All India", category: "Open", ikey: "SETHGORDHANDASSUNDERDASMEDICALCOLLEGEMUM#400012", degree: "MD", specialty: "GENERALMEDICINE",
    status: "upgraded", src: "mcc/2023/R2_final.pdf", candidate_category: "General", option_no: 1,
    prev_ikey: "LOKMANYATILAKMEDICALCOLLEGEMUMBAIMAHARAS#400022", prev_degree: "MD", prev_specialty: "GENERALMEDICINE", prev_quota: "All India", prev_remark: "reported",
  };
  const none = { prev_ikey: null, prev_degree: null, prev_specialty: null, prev_quota: null, prev_remark: null };
  it("accepts an R2 upgrade with its previous seat, and an R1 row with none", () => {
    expect(mccAllotmentV2Schema.safeParse(r2).success).toBe(true);
    expect(mccAllotmentV2Schema.safeParse({ ...r2, ...none, round: "R1", status: "allotted", option_no: null }).success).toBe(true);
  });
  it("rejects an option number or a previous seat outside R2 / R3, half a previous seat, and allotted in R2", () => {
    expect(mccAllotmentV2Schema.safeParse({ ...r2, ...none, round: "R1", status: "allotted" }).success).toBe(false);
    expect(mccAllotmentV2Schema.safeParse({ ...r2, round: "stray", status: "allotted", option_no: null }).success).toBe(false);
    expect(mccAllotmentV2Schema.safeParse({ ...r2, prev_quota: null }).success).toBe(false);
    expect(mccAllotmentV2Schema.safeParse({ ...r2, status: "allotted" }).success).toBe(false);
    expect(mccAllotmentV2Schema.safeParse({ ...r2, name: "Someone" }).success).toBe(false);
  });
});

const key = "KOKILABENDHIRUBHAIAMBANIHOSPITALPLOTNOX8#400710";
const fee = { amount: 125000, currency: "INR", kind: "nbems_ceiling", maximum: true, src: 2 };
const rec = {
  id: `${key}|DNB|DNB Quota`, key, college: "Kokilaben", state: "Maharashtra", programme: "DNB", duration_years: 3, seat_groups: ["DNB Quota"], quotas: ["DNB Quota"], mcc_ids: ["700421"],
  fee_display: "numbers", fee_per_year: [fee, fee, null], stipend_per_month: [{ inr: 43000, kind: "nbems_minimum", minimum: true, src: 1 }, null, null],
  bond: { status: "no", checked: false, src: 3 },
  sources: [1, 2, 3].map((n) => ({ n, kind: "nbems_rule", label: "NBEMS rule", url: "https://natboard.edu.in/x" })),
};

describe("mccFeesStructuredSchema", () => {
  it("accepts a record, with or without fee_display (an older export)", () => {
    expect(mccFeesStructuredSchema.safeParse(rec).success).toBe(true);
    expect(mccFeesStructuredSchema.safeParse({ ...rec, fee_display: undefined }).success).toBe(true);
  });
  it("rejects a verbatim record with fee figures, a wrong id and extra keys", () => {
    expect(mccFeesStructuredSchema.safeParse({ ...rec, fee_display: "verbatim" }).success).toBe(false);
    expect(mccFeesStructuredSchema.safeParse({ ...rec, fee_display: "verbatim", fee_per_year: [null, null, null], fee_text: "As per NBEMS" }).success).toBe(true);
    expect(mccFeesStructuredSchema.safeParse({ ...rec, id: `${key}|DNB|All India` }).success).toBe(false);
    expect(mccFeesStructuredSchema.safeParse({ ...rec, bond: { ...rec.bond, signatory: "Dr X" } }).success).toBe(false);
  });
  it("lists every source a record cites", () => expect(new Set(citedSources(rec))).toEqual(new Set([1, 2, 3])));
  it("takes fee_parsed on a verbatim record only, each quote in its fee_text", () => {
    const fig = { amount: 125000, currency: "INR", field: "Year 1", quote: "Year 1: 125000" };
    const v = { ...rec, fee_display: "verbatim", fee_per_year: [null, null, null], fee_text: "Year 1: 125000 | Annual fees: 105000" };
    const p = { basis: "parsed from MCC profile text", src: 2, per_year: [fig, null, null] };
    expect(mccFeesStructuredSchema.safeParse({ ...v, fee_parsed: p }).success).toBe(true);
    expect(mccFeesStructuredSchema.safeParse({ ...rec, fee_parsed: p }).success).toBe(false);
    expect(mccFeesStructuredSchema.safeParse({ ...v, fee_parsed: { ...p, per_year: [{ ...fig, quote: "Year 1: 99" }, null, null] } }).success).toBe(false);
    expect(mccFeesStructuredSchema.safeParse({ ...v, fee_parsed: { ...p, per_year: [fig] } }).success).toBe(false);
  });
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
  it("FEE and STIPEND may carry their fee-table records (schema 2), each a valid record", () => {
    const feeT = { ...t, kind: "FEE", text: "Up to ₹1,25,000/yr, no GST", amount_inr: 125000, src_url: "https://natboard.edu.in/x.pdf" };
    expect(ok({ ...feeT, details: { records: [rec] } })).toBe(true);
    expect(ok({ ...feeT, kind: "STIPEND", details: { records: [rec] } })).toBe(true);
    expect(ok({ ...feeT, details: { records: [] } })).toBe(false);
    expect(ok({ ...feeT, details: { records: [{ ...rec, fee_display: "verbatim" }] } })).toBe(false); // a verbatim record with figures
    expect(ok({ ...feeT, details: { records: [rec], note: "x" } })).toBe(false);
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
