import { describe, expect, it } from "vitest";
import { couponBanner, couponCodeSchema, couponCreateSchema, couponEditSchema, couponError, couponPrice } from "./coupons";
import { PLANS } from "./plans";

const now = new Date("2026-11-25T12:00:00+05:30");
const ok = { active: true, validUntil: null, maxUses: null, uses: 0, allowedEmail: null, percentOff: 100 };
const buyer = { email: "Asha@Seatora.test", redeemed: false, paid: false };

describe("coupon price", () => {
  it("100% is free; others round down to whole rupees, never under ₹1", () => {
    const list = PLANS.season_pass.amount;
    expect([couponPrice(list, 100), couponPrice(list, 50), couponPrice(list, 20), couponPrice(list, 99)]).toEqual([0, 9900, 15900, 100]);
  });
});

describe("couponError", () => {
  it("a good coupon: null", () => {
    expect(couponError(ok, buyer, now, null)).toBeNull();
    expect(couponError({ ...ok, maxUses: 2, uses: 1, allowedEmail: "asha@seatora.test", validUntil: new Date("2026-12-01") }, buyer, now, null)).toBeNull();
  });
  it("inactive, expired, used up, another account, already redeemed, already paid", () => {
    expect(couponError({ ...ok, active: false }, buyer, now, null)).toBe("This coupon isn't valid.");
    expect(couponError({ ...ok, validUntil: new Date("2026-11-25T06:30:00Z") }, buyer, now, null)).toBe("This coupon has expired.");
    expect(couponError({ ...ok, maxUses: 1, uses: 1 }, buyer, now, null)).toBe("This coupon has been used up.");
    expect(couponError({ ...ok, allowedEmail: "rahul@seatora.test" }, buyer, now, null)).toBe("This coupon is for another account.");
    expect(couponError(ok, { ...buyer, redeemed: true }, now, null)).toBe("You've already used this coupon.");
    expect(couponError(ok, { ...buyer, paid: true }, now, null)).toBe("Your Season Pass is already active.");
  });
  it("in the free period only 100% coupons work; signed out, only the coupon itself is checked", () => {
    const freeUntil = new Date("2026-11-20T23:59:59+05:30");
    expect(couponError({ ...ok, percentOff: 50 }, buyer, now, freeUntil)).toBe("This coupon works after 20 Nov.");
    expect(couponError(ok, buyer, now, freeUntil)).toBeNull();
    expect(couponError({ ...ok, allowedEmail: "rahul@seatora.test" }, null, now, null)).toBeNull();
  });
});

describe("coupon codes and the admin form", () => {
  it("codes: 3–20 letters and digits, any case in", () => {
    expect(couponCodeSchema.parse(" drTaral ")).toBe("DRTARAL");
    for (const bad of ["AB", "A".repeat(21), "DR-TARAL", "DR TARAL", ""]) expect(couponCodeSchema.safeParse(bad).success).toBe(false);
  });
  it("create: empty optional fields are null; the email lowercased; the date the end of that IST day", () => {
    expect(couponCreateSchema.parse({ code: "testfree", percentOff: "100", maxUses: "", allowedEmail: "", validUntil: "", note: "" })).toEqual({
      code: "TESTFREE", percentOff: 100, maxUses: null, allowedEmail: null, validUntil: null, note: "",
    });
    const c = couponCreateSchema.parse({ code: "HALF", percentOff: "50", maxUses: "3", allowedEmail: " Asha@Seatora.test ", validUntil: "2026-12-31" });
    expect([c.maxUses, c.allowedEmail, c.validUntil?.toISOString()]).toEqual([3, "asha@seatora.test", "2026-12-31T18:29:59.999Z"]);
    for (const bad of [{ percentOff: "0" }, { percentOff: "101" }, { maxUses: "0" }, { allowedEmail: "nope" }, { validUntil: "31/12/2026" }]) {
      expect(couponCreateSchema.safeParse({ code: "HALF", percentOff: "50", ...bad }).success).toBe(false);
    }
  });
  it("edit: active only from the toggle button", () => {
    expect(couponEditSchema.parse({ id: "c1", maxUses: "", allowedEmail: "", validUntil: "" })).toEqual({ id: "c1", maxUses: null, allowedEmail: null, validUntil: null });
    expect(couponEditSchema.parse({ id: "c1", active: "0" }).active).toBe("0");
  });
});

describe("couponBanner", () => {
  const season = new Date("2027-03-31T23:59:59+05:30");
  it("a good code says what it gives; a bad one quietly why not, and is never the main action", () => {
    expect(couponBanner("DRTARAL", { percentOff: 100, error: null }, season)).toEqual({ ok: true, free: true, text: "Code DRTARAL: Season Pass free till 31 Mar 2027" });
    expect(couponBanner("SAVE20", { percentOff: 20, error: null }, season)).toEqual({ ok: true, free: false, text: "Code SAVE20: 20% off the Season Pass" });
    expect(couponBanner("OLD", { percentOff: 100, error: "This coupon has expired." }, season)).toEqual({ ok: false, free: false, text: "Code OLD: This coupon has expired." });
    expect(couponBanner("NOPE", null, season)).toEqual({ ok: false, free: false, text: "NOPE isn't a valid coupon code." });
  });
});
