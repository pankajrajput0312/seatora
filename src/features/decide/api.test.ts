import { describe, expect, it } from "vitest";
import { allotmentsQuerySchema, compareQuerySchema, cutoffsQuerySchema, optionsQuerySchema, parseOptionalProfile, parseProfile, parseQuery, sourcesFor } from "./api";

const qs = (s: string) => new URLSearchParams(s);

describe("query schemas", () => {
  it("applies defaults and reads lists repeated or comma-separated", () => {
    const r = parseQuery(optionsQuerySchema, qs("reach=within-10,reached-one&reach=no-data&showClosed=1"), ["reach"]);
    expect(r.success && r.data).toEqual({ page: 1, pageSize: 50, reach: ["within-10", "reached-one", "no-data"], showClosed: true, prov: true });
  });
  it("treats empty values as absent", () => {
    const r = parseQuery(allotmentsQuerySchema, qs("year=&round=&from=30,000&to=50000"));
    expect(r.success && r.data).toMatchObject({ from: 30000, to: 50000, page: 1 });
    expect(r.success && r.data.year).toBeUndefined();
  });
  it("rejects bad values with a path", () => {
    const bad = (schema: Parameters<typeof parseQuery>[0], s: string, lists?: string[]) => {
      const r = parseQuery(schema, qs(s), lists);
      return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    };
    expect(bad(allotmentsQuerySchema, "pageSize=500")).toEqual(["pageSize"]);
    expect(bad(allotmentsQuerySchema, "from=50000&to=30000")).toEqual(["from"]);
    expect(bad(allotmentsQuerySchema, "round=R9&category=GEN")).toEqual(["round", "category"]);
    expect(bad(optionsQuerySchema, "reach=maybe", ["reach"])).toEqual(["reach.0"]);
    expect(bad(cutoffsQuerySchema, "specialty=anaesthesia")).toEqual(["specialty"]);
    expect(bad(compareQuerySchema, "ids=a,b,c,d,e", ["ids"])).toEqual(["ids"]);
  });
});

describe("profile params", () => {
  it("parses the same keys as the Decide URL, strictly", () => {
    const r = parseProfile(qs("rank=42,284&cat=OBC&sp=ANAESTHESIOLOGY,FAMILYMEDICINE&fee=5"));
    expect(r.success && r.data).toEqual({
      rank: 42284, category: "OBC", pwd: false, specialties: ["ANAESTHESIOLOGY", "FAMILYMEDICINE"], degrees: [], quotas: [], states: [], maxFeeLakh: 5, maxBondYears: null,
    });
    expect(parseProfile(qs("rank=42284&fee=abc")).success).toBe(false);
    expect(parseProfile(qs("cat=OBC")).success).toBe(false);
    expect(parseProfile(qs("rank=42284&cat=GEN")).success).toBe(false);
  });
  it("optional profile: no rank → null", () => {
    expect(parseOptionalProfile(qs("cat=OBC"))).toMatchObject({ success: true, data: null });
    expect(parseOptionalProfile(qs("rank=0")).success).toBe(false);
  });
});

it("lists only the result PDFs a block uses, with the provisional flag", () => {
  const src = [
    { key: "a", url: "u1", year: 2025, round: "R1" as const, provisional: false, name: "2025 R1" },
    { key: "b", url: "u2", year: 2026, round: "R1" as const, provisional: true, name: "2026 R1" },
  ];
  expect(sourcesFor(src, [{ year: 2026, round: "R1" }])).toEqual([{ key: "b", name: "2026 R1", url: "u2", year: 2026, round: "R1", provisional: true }]);
  expect(sourcesFor(src)).toHaveLength(2);
});
