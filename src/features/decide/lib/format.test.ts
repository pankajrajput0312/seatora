import { describe, expect, it } from "vitest";
import { formatInrShort, formatLakh, listDay, shortName } from "./format";

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

describe("shortName", () => {
  it("keeps what tells two colleges apart, shrinks the common words, ends with the state", () => {
    expect(shortName("Government Medical College, Latur", "Maharashtra")).toBe("GMC Latur, MH");
    expect(shortName("GOVT MEDICAL COLLEGE, AZAMGARH", "Uttar Pradesh")).toBe("GMC Azamgarh, UP");
    expect(shortName("Jawaharlal Institute of Medical Sciences", "Manipur")).toBe("Jawaharlal IMS, MN");
    expect(shortName("Government Medical College and Associated Group of Hospitals", "Rajasthan")).toBe("GMC & Assoc. Group of Hosps, RJ");
    expect(shortName("All India Institute of Medical Sciences, Jodhpur", "Rajasthan")).toBe("AIIMS Jodhpur, RJ");
    expect(shortName("ESIC MEDICAL COLLEGE", "Telangana")).toBe("ESIC Med. College, TG");
    expect(shortName("Silchar Medical College", null)).toBe("Silchar Med. College");
  });
});
