import { describe, expect, it } from "vitest";
import { examYearsFrom, waitlistSchema } from "./validations";

const [thisYear] = examYearsFrom();

describe("waitlistSchema", () => {
  it("normalises email and coerces year", () => {
    const r = waitlistSchema.parse({ email: " Dr.A@Mail.com ", examYear: String(thisYear) });
    expect(r).toMatchObject({ email: "dr.a@mail.com", examYear: thisYear });
  });
  it("rejects bad email, overlong email and out-of-range year", () => {
    expect(waitlistSchema.safeParse({ email: "nope", examYear: thisYear }).success).toBe(false);
    expect(waitlistSchema.safeParse({ email: `${"a".repeat(250)}@b.co`, examYear: thisYear }).success).toBe(false);
    expect(waitlistSchema.safeParse({ email: "a@b.co", examYear: 1999 }).success).toBe(false);
  });
  it("offers this year and the next two", () => {
    expect(examYearsFrom(new Date("2026-06-01"))).toEqual([2026, 2027, 2028]);
  });
});
