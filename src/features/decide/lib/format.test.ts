import { expect, it } from "vitest";
import { bondYears, formatLakh } from "./format";

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
