import { expect, it } from "vitest";
import { decideLinks } from "./links";

it("keeps profile params, drops page-only params, and builds related links", () => {
  const L = decideLinks("rank=42284&cat=OBC&q=pune&reach=within-10");
  expect(L.institute("x-1", "fees")).toBe("/decide/institutes/x-1?rank=42284&cat=OBC&tab=fees");
  expect(L.lastRanks("dnb-anaesthesiology", { inst: "x-1" })).toBe("/decide/last-ranks?rank=42284&cat=OBC&course=dnb-anaesthesiology&inst=x-1#inst-x-1");
  expect(L.allotments({ course: "md-anaesthesiology", year: 2025 })).toBe("/decide/allotments?rank=42284&cat=OBC&course=md-anaesthesiology&year=2025");
  expect(decideLinks().rankScan(42284)).toBe("/decide/rank-scan?scan=42284");
});
