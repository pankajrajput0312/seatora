import { expect, it } from "vitest";
import { z } from "zod";
import { pageValue, parseSearchParams, rankValue } from "./params";

const schema = z.object({ page: pageValue.default(1), from: rankValue.optional(), year: z.coerce.number().int().min(2023).max(2026).optional(), st: z.array(z.string()).default([]) });

it("parses leniently: a bad field falls back, the rest is kept; ranks may have commas", () => {
  const p = new URLSearchParams("page=0&from=30,000&year=1999&st=Bihar&st=Kerala,Goa");
  expect(parseSearchParams(schema, p, ["st"])).toEqual({ page: 1, from: 30000, st: ["Bihar", "Kerala", "Goa"] });
  expect(parseSearchParams(schema, new URLSearchParams("page=3&from=&year=2025"))).toEqual({ page: 3, year: 2025, st: [] });
});
