import { describe, expect, it } from "vitest";
import { feeGroup, type FeeRecord } from "./facts";

const rec: FeeRecord = {
  duration_years: 3,
  quotas: ["All India"],
  mcc_ids: ["700421"],
  fee_display: "numbers",
  fee_text: "Year 1: 1,50,000",
  fee_text_src: { url: "https://mcc.admissions.nic.in/x", date: "2026-11-15" },
  fee_per_year: [{ amount: 150000, currency: "INR", kind: "declared_for_year", src: 1 }, null, null],
  stipend_per_month: [{ inr: 90000, kind: "declared", src: 1 }, null, null],
  bond: { status: "not_checked", checked: false },
  sources: [{ n: 1, kind: "mcc_profile", label: "MCC institute profile", url: "https://mcc.admissions.nic.in/x" }],
};

describe("feeGroup", () => {
  it("shows the figures of a numbers record", () => {
    const g = feeGroup("All India+DNB Quota", rec);
    expect(g.groups).toEqual(["All India", "DNB Quota"]);
    expect(g.fee).toMatchObject({ display: "numbers", text: "Year 1: 1,50,000", perYear: rec.fee_per_year });
  });
  it("never shows figures of a verbatim record, or of one without fee_display (an older export)", () => {
    for (const fee_display of ["verbatim", undefined] as const) {
      const g = feeGroup("All India", { ...rec, fee_display });
      expect(g.fee).toEqual({ display: "verbatim", text: "Year 1: 1,50,000", src: rec.fee_text_src, parsed: null });
      expect(g.stipendPerMonth).toEqual(rec.stipend_per_month);
    }
  });
});
