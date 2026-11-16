import { describe, expect, it } from "vitest";
import { PLANS } from "@/features/payments/plans";
import { discountedPrice, earningFor, firstName, formatPaise, referralCodeSchema, upiSchema } from "./lib";

describe("referral money", () => {
  it("the friend pays 20% less, rounded down to whole rupees; the referrer gets 20% of that, to the paisa", () => {
    expect(PLANS.season_pass).toMatchObject({ amount: 19900, wasAmount: 49900 }); // ~~₹499~~ ₹199: only 19900 is charged
    expect(discountedPrice(PLANS.season_pass.amount)).toBe(15900); // ₹199 → ₹159 (₹159.20 rounded down)
    expect(19900 - discountedPrice(19900)).toBe(4000);
    expect(earningFor(15900)).toBe(3180); // ₹31.80
    expect(discountedPrice(49900)).toBe(39900);
    expect(discountedPrice(99900)).toBe(79900);
    expect(earningFor(79900)).toBe(15980);
    expect([formatPaise(15900), formatPaise(3180), formatPaise(159600), formatPaise(0)]).toEqual(["₹159", "₹31.80", "₹1,596", "₹0"]);
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
