import { describe, expect, it } from "vitest";
import { examYears, waitlistSchema } from "./validations";

describe("waitlistSchema", () => {
  it("normalises email and coerces year", () => {
    const r = waitlistSchema.parse({ email: " Dr.A@Mail.com ", examYear: String(examYears[0]) });
    expect(r).toMatchObject({ email: "dr.a@mail.com", examYear: examYears[0] });
  });
  it("rejects bad email and out-of-range year", () => {
    expect(waitlistSchema.safeParse({ email: "nope", examYear: examYears[0] }).success).toBe(false);
    expect(waitlistSchema.safeParse({ email: "a@b.co", examYear: 1999 }).success).toBe(false);
  });
});
