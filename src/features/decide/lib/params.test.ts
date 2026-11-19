import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pageValue, parseSearchParams, rankValue } from "./params";

const schema = z.object({ page: pageValue.default(1), from: rankValue.optional(), year: z.coerce.number().int().min(2023).max(2026).optional(), st: z.array(z.string()).default([]) });

it("parses leniently: a bad field falls back, the rest is kept; ranks may have commas", () => {
  const p = new URLSearchParams("page=0&from=30,000&year=1999&st=Bihar&st=Kerala,Goa");
  expect(parseSearchParams(schema, p, ["st"])).toEqual({ page: 1, from: 30000, st: ["Bihar", "Kerala", "Goa"] });
  expect(parseSearchParams(schema, new URLSearchParams("page=3&from=&year=2025"))).toEqual({ page: 3, year: 2025, st: [] });
});

describe("rankText / rankRange (Last ranks' closing-rank filter)", () => {
  it("reads 40,000, 40k, 4.5L and 4.5 lakh; rejects negatives, zero and words", async () => {
    const { rankText } = await import("./params");
    expect(["40,000", "40k", "40 K", "4.5L", "4.5 lakh", "2.25l", "", undefined].map(rankText)).toEqual([40000, 40000, 40000, 450000, 450000, 225000, null, null]);
    expect(["-5", "0", "abc", "4.5.1", "-40k"].map(rankText)).toEqual(["bad", "bad", "bad", "bad", "bad"]);
  });
  it("swaps a range typed the wrong way round, and names what it ignored", async () => {
    const { rankRange } = await import("./params");
    expect(rankRange("50k", "40,000")).toEqual({ min: 40000, max: 50000, swapped: true, bad: [] });
    expect(rankRange("40000", "")).toEqual({ min: 40000, max: undefined, swapped: false, bad: [] });
    expect(rankRange("-10", "5k")).toEqual({ min: undefined, max: 5000, swapped: false, bad: ["-10"] });
  });
  it("rankShorthand (Rank scan): the same shorthand, still 1 to 3,00,000", async () => {
    const { rankShorthand } = await import("./params");
    expect(["25k", "0.25L", "2.5 lakh", "42,284"].map((v) => rankShorthand.safeParse(v).data)).toEqual([25000, 25000, 250000, 42284]);
    expect(["abc", "-5", "4L"].map((v) => rankShorthand.safeParse(v).success)).toEqual([false, false, false]);
  });
});
