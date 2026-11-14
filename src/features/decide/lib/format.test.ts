import { expect, it } from "vitest";
import { bondYears, firstRupees, formatLakh } from "./format";

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
