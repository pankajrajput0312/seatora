import { expect, it } from "vitest";
import { bondFigures, bondYears, firstRupees, formatLakh, listDay, stipendYear1 } from "./format";

it("formats lakh compactly and shows a dash for missing", () => {
  expect(formatLakh(125000)).toBe("₹1.25 L");
  expect(formatLakh(2450000)).toBe("₹24.5 L");
  expect(formatLakh(100000)).toBe("₹1 L");
  expect(formatLakh(null)).toBe("—");
});

it("reads bond years from text", () => {
  expect(bondYears("2 years service in state")).toBe(2);
  expect(bondYears("1 yr")).toBe(1);
  expect(bondYears("No bond")).toBeNull();
  expect(bondYears(undefined)).toBeNull();
});

it("reads the first rupee figure (year 1) for sorting, lakh aware", () => {
  expect(firstRupees("₹1.25 L/yr + GST to NBEMS (official DNB course fee)")).toBe(125000);
  expect(firstRupees("₹78,000 / 80,000 / 83,000/month (yr 1/2/3) — college declaration to MCC 2025")).toBe(78000);
  expect(firstRupees("₹1,50,000/yr")).toBe(150000);
  expect(firstRupees("Not listed")).toBeNull();
});

it("reads crore too", () => {
  expect(firstRupees("super-specialty: 2 years / ₹2 crore")).toBe(20000000);
  expect(firstRupees("₹1.5 Cr by specialty")).toBe(15000000);
});

it("year-1 stipend keeps its qualifier; other shapes give null", () => {
  expect(stipendYear1("₹66,100 / 67,800 / 69,500/month (yr 1/2/3) — college declaration to MCC 2025")).toBe("₹66,100/month");
  expect(stipendYear1("At least ₹45,000/month yr 1 (NBEMS floor from Jun 2025; state rate if higher) — actual not verified")).toBe("At least ₹45,000/month");
  expect(stipendYear1("₹1,20,000/month PG (NMC stipend filing)")).toBe("₹1,20,000/month");
  expect(stipendYear1("As per state government rules")).toBeNull();
  expect(stipendYear1(null)).toBeNull();
});

it("bond figures: the bond's own, not the state's seat-leaving penalty; several when the text gives several", () => {
  const one = (inr: number, years: number) => ({ inr: [inr], years: [years] });
  expect(bondFigures("Service bond ₹50,00,000 (1 year service); applies to PG (summary)")).toEqual(one(5000000, 1));
  expect(bondFigures("Service bond ₹10,00,000 (1 year service); seat-leaving penalty ₹30,00,000 (MD/MS)")).toEqual(one(1000000, 1));
  expect(bondFigures("Service bond ₹20 lakh (1 year service); seat-leaving penalty ₹20 lakh (summary of the bond document on the MCC institute profile)")).toEqual(one(2000000, 1));
  // Rajasthan: the ₹50 lakh is Anaesthesia's, other courses ₹25 L – ₹1.5 Cr.
  expect(bondFigures("Service bond ₹50 lakh for Anaesthesia (Rajasthan 2025-26 subject-wise bond: ₹25 L – ₹1.5 Cr by specialty) (2 years service); seat-leaving penalty ₹10,00,000 (incl. ₹1,50,000 bank guarantee); applies to AIQ & State quota non-service MD/MS (summary)"))
    .toEqual({ inr: [5000000, 2500000, 15000000], years: [2] });
  // UP: degree and diploma differ.
  expect(bondFigures("Service bond ₹40,00,000 (degree); ₹20,00,000 (diploma) (2 years service); seat-leaving penalty Stipend refund (pro-rata if less than 24 months) plus security amount; applies to MD/MS/Diploma/MDS, UP govt (summary)").inr).toEqual([4000000, 2000000]);
  // Karwar: 1 year under the Karnataka Act, 3 years under the Rule 15(5) undertaking.
  expect(bondFigures("Service bond ₹50,00,000 (1 year compulsory service (Karnataka Act 2012); 3 years under Rule 15(5) undertaking service); seat-leaving penalty ₹5,00,000 + stipend drawn + remaining course fee; applies to Govt seats, AIQ and State quota (non-in-service) at KIMS Karwar (summary)"))
    .toEqual({ inr: [5000000], years: [1, 3] });
  // West Bengal: the diploma's terms come after the penalty, in "applies to", and are kept.
  expect(bondFigures("Service bond ₹10,00,000 per defaulting year (3 years service); seat-leaving penalty ₹5,00,000; applies to PG Degree (non-in-service); Diploma: 2 years service, ₹2,00,000 discontinuation (summary)"))
    .toEqual({ inr: [1000000, 200000], years: [3, 2] });
  expect(bondFigures("Service bond (1 year service); seat-leaving penalty ₹5,00,000")).toEqual({ inr: [], years: [1] });
  expect(bondFigures("Service bond Refund of 3 years' stipend (1 year (serve the institution) service); seat-leaving penalty Balance tuition").years).toEqual([1]);
  expect(bondFigures("Service bond Gujarat govt service bond (summary)")).toEqual({ inr: [], years: [] });
  expect(bondFigures(undefined)).toEqual({ inr: [], years: [] });
});

it("a seat list's day: its key's date, else its notice date", () => {
  expect(listDay({ key: "mcc/2025/R2_new_seats_2025-12-11.pdf", publishedAt: null })).toBe("2025-12-11");
  expect(listDay({ key: "mcc/2026/R2_new_seats.pdf", publishedAt: "2026-11-12" })).toBe("2026-11-12");
  expect(listDay({ key: "mcc/2025/R2_new_seats.pdf", publishedAt: null })).toBeUndefined();
});
