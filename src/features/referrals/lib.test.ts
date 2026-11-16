import { describe, expect, it } from "vitest";
import { discountedPrice, earningFor, firstName, formatPaise, referralCodeSchema, upiSchema } from "./lib";

describe("referral money", () => {
  it("the friend pays 20% less, rounded down to whole rupees; the referrer gets 20% of that, to the paisa", () => {
    expect(discountedPrice(49900)).toBe(39900); // ₹499 → ₹399 (₹399.20 rounded down)
    expect(49900 - discountedPrice(49900)).toBe(10000);
    expect(earningFor(39900)).toBe(7980); // ₹79.80
    expect(discountedPrice(99900)).toBe(79900);
    expect(earningFor(79900)).toBe(15980);
    expect([formatPaise(39900), formatPaise(7980), formatPaise(159600)]).toEqual(["₹399", "₹79.80", "₹1,596"]);
  });
});

describe("codes and UPI IDs", () => {
  it("codes: 6–8 unambiguous characters, any case in", () => {
    expect(referralCodeSchema.parse(" rhux234 ")).toBe("RHUX234");
    for (const bad of ["ABC23", "ABCDEFGHJ", "RAHUL23", "R0HUX23", "RHUX-23"]) expect(referralCodeSchema.safeParse(bad).success).toBe(false);
  });
  it("UPI IDs look like name@bank", () => {
    expect(upiSchema.parse(" rahul.s-1@okicici ")).toBe("rahul.s-1@okicici");
    for (const bad of ["rahul", "@okicici", "rahul@", "rahul@1bank", "ra hul@ybl"]) expect(upiSchema.safeParse(bad).success).toBe(false);
  });
  it("only the first name is shown", () => expect([firstName("  Rahul  Sharma "), firstName(" ")]).toEqual(["Rahul", "A friend"]));
});
