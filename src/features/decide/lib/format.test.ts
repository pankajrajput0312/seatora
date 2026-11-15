import { expect, it } from "vitest";
import { formatInrShort, formatLakh, listDay } from "./format";

it("formats lakh compactly and shows a dash for missing", () => {
  expect(formatLakh(125000)).toBe("₹1.25 L");
  expect(formatLakh(2450000)).toBe("₹24.5 L");
  expect(formatLakh(100000)).toBe("₹1 L");
  expect(formatLakh(null)).toBe("—");
});

it("short rupees: Indian grouping under a lakh, then lakh and crore", () => {
  expect([55200, 150000, 5000000, 20000000, 15000000].map(formatInrShort)).toEqual(["₹55,200", "₹1.5 L", "₹50 L", "₹2 Cr", "₹1.5 Cr"]);
  expect(formatInrShort(null)).toBe("—");
});

it("a seat list's day: its key's date, else its notice date", () => {
  expect(listDay({ key: "mcc/2025/R2_new_seats_2025-12-11.pdf", publishedAt: null })).toBe("2025-12-11");
  expect(listDay({ key: "mcc/2026/R2_new_seats.pdf", publishedAt: "2026-11-12" })).toBe("2026-11-12");
  expect(listDay({ key: "mcc/2025/R2_new_seats.pdf", publishedAt: null })).toBeUndefined();
});
