import { describe, expect, it } from "vitest";
import { effectivePlan, freeForAllUntil, istDay, passState, planLimits, planLine } from "./plans";

const now = new Date("2026-11-20T06:00:00Z");
const free = { role: "FREE" as const, premiumUntil: null };

describe("effectivePlan", () => {
  it("Free by default; Premium by role, an unexpired premiumUntil, or before FREE_FOR_ALL_UNTIL; staff unlimited", () => {
    expect(effectivePlan(free, now, {}).plan).toBe("FREE");
    expect(effectivePlan(free, now, {}).limits.institutes).toBe(10);
    expect(effectivePlan({ role: "PREMIUM", premiumUntil: null }, now, {}).limits.residents).toBe(200);
    expect(effectivePlan({ ...free, premiumUntil: new Date("2026-11-21T00:00:00Z") }, now, {}).plan).toBe("PREMIUM");
    expect(effectivePlan({ ...free, premiumUntil: new Date("2026-11-19T00:00:00Z") }, now, {}).plan).toBe("FREE");
    const owner = effectivePlan({ role: "OWNER", premiumUntil: null }, now, {});
    expect([owner.plan, owner.staff, owner.limits.ask, owner.limits.residents]).toEqual(["PREMIUM", true, Infinity, Infinity]);
    const env = { FREE_FOR_ALL_UNTIL: "2026-11-19T23:59:59+05:30" };
    const before = effectivePlan(free, new Date("2026-11-19T18:00:00Z"), env); // 23:30 IST on the 19th
    expect([before.plan, before.freeUntil?.toISOString()]).toEqual(["PREMIUM", "2026-11-19T18:29:59.000Z"]);
    expect(effectivePlan(free, new Date("2026-11-19T18:30:00Z"), env).plan).toBe("FREE"); // 00:00 IST on the 20th
  });

  it("env overrides per plan and feature; unlimited and -1 are Infinity; junk keeps the default", () => {
    const l = planLimits("FREE", { PLAN_FREE_INSTITUTES: "25", PLAN_FREE_CHOICE_LISTS: "unlimited", PLAN_FREE_ASK: "-1", PLAN_FREE_COMPARE: "x" });
    expect([l.institutes, l.choiceLists, l.ask, l.compare]).toEqual([25, Infinity, Infinity, 2]);
    expect(freeForAllUntil("not a date")).toBeNull();
  });
});

describe("passState", () => {
  const env = { FREE_FOR_ALL_UNTIL: "2026-11-20T23:59:59+05:30" };
  const end = new Date("2026-11-20T18:29:59Z");
  const before = new Date("2026-11-18T06:00:00Z");
  const after = new Date("2026-11-21T06:00:00Z");
  const paid = new Date("2027-03-31T18:29:59Z");
  it("claimable in the free period, claimed once premiumUntil is its end, a pass beyond it, Free after", () => {
    expect(passState(free, before, env)).toEqual({ state: "claimable", until: end });
    expect(passState({ ...free, premiumUntil: end }, before, env)).toEqual({ state: "claimed", until: end });
    expect(passState({ ...free, premiumUntil: paid }, before, env)).toEqual({ state: "pass", until: paid });
    expect(passState({ ...free, premiumUntil: end }, after, env)).toEqual({ state: "free", until: null }); // the free upgrade ran out
    expect(passState({ ...free, premiumUntil: paid }, after, env).state).toBe("pass");
    expect(passState({ role: "PREMIUM", premiumUntil: null }, after, env).state).toBe("pass");
    expect(passState({ role: "ADMIN", premiumUntil: null }, after, env).state).toBe("staff");
    expect(passState(free, after, {}).state).toBe("free");
  });
  it("planLine names each state", () => {
    expect([free, { ...free, premiumUntil: end }, { ...free, premiumUntil: paid }, { role: "OWNER" as const, premiumUntil: null }].map((a) => planLine(a, before, env)))
      .toEqual(["Free plan", "Season Pass · free till 20 Nov", "Season Pass · till 31 Mar 2027", "Owner"]);
  });
});

describe("istDay", () => {
  it("is the date in India, resetting at 00:00 IST", () => {
    expect(istDay(new Date("2026-11-19T18:29:59Z"))).toEqual({ day: "2026-11-19", resetAt: new Date("2026-11-19T18:30:00Z") });
    expect(istDay(new Date("2026-11-19T18:30:00Z")).day).toBe("2026-11-20");
  });
});
