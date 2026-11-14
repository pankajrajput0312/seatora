import { expect, it } from "vitest";
import { profileParamKeys } from "../profile";
import { decideLinks } from "./links";

it("keeps profile params, drops page-only params, and builds related links", () => {
  const L = decideLinks("rank=42284&cat=OBC&q=pune&reach=within-10");
  expect(L.institute("x-1", "fees")).toBe("/decide/institutes/x-1?rank=42284&cat=OBC&tab=fees");
  expect(L.lastRanks("dnb-anaesthesiology", { inst: "x-1" })).toBe("/decide/last-ranks?rank=42284&cat=OBC&course=dnb-anaesthesiology&inst=x-1#inst-x-1");
  expect(L.allotments({ course: "md-anaesthesiology", year: 2025 })).toBe("/decide/allotments?rank=42284&cat=OBC&course=md-anaesthesiology&year=2025");
  expect(decideLinks().rankScan(42284)).toBe("/decide/rank-scan?scan=42284");
});

it("keeps every value of a repeated profile param", () => {
  const L = decideLinks("rank=42284&st=Bihar&st=Kerala&sp=ANAESTHESIOLOGY");
  expect(new URL(L.options(), "http://x").searchParams.get("st")).toBe("Bihar,Kerala");
});

it("page filters never use a profile key (Allotments quota is aq)", () => {
  const L = decideLinks("rank=1&quota=All+India,DNB+Quota");
  const url = new URL(L.allotments({ quota: "Deemed/Paid Seats", category: "OBC", inst: "x" }), "http://x");
  expect(url.searchParams.get("aq")).toBe("Deemed/Paid Seats");
  expect(url.searchParams.getAll("quota")).toEqual(["All India,DNB Quota"]); // her profile, untouched
  const pageKeys = [...url.searchParams.keys()].filter((k) => !(profileParamKeys as readonly string[]).includes(k));
  expect(pageKeys).toEqual(["inst", "aq", "acat"]);
});

it("with() keeps page filters and applies changes; page() drops page=1", () => {
  const L = decideLinks("rank=1&sp=A&sp=B&q=x&page=3");
  expect(L.with("/decide/options", { q: null, reach: "within-10" })).toBe("/decide/options?rank=1&sp=A%2CB&page=3&reach=within-10");
  expect(L.page("/decide/options", 1)).toBe("/decide/options?rank=1&sp=A%2CB&q=x");
  expect(L.page("/decide/options", 2)).toBe("/decide/options?rank=1&sp=A%2CB&q=x&page=2");
});
