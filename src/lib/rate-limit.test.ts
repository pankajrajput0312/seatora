import { expect, it } from "vitest";
import { allow } from "./rate-limit";

it("allows up to the limit per window, then resets", () => {
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) expect(allow("ip-a", 3, 1000, t)).toBe(true);
  expect(allow("ip-a", 3, 1000, t)).toBe(false);
  expect(allow("ip-b", 3, 1000, t)).toBe(true);
  expect(allow("ip-a", 3, 1000, t + 1000)).toBe(true);
});

it("isLimited peeks without counting, reset clears", async () => {
  const { isLimited, reset } = await import("./rate-limit");
  const t = 2_000_000;
  expect(isLimited("k", 2, t)).toBe(false);
  allow("k", 2, 1000, t);
  allow("k", 2, 1000, t);
  expect(isLimited("k", 2, t)).toBe(true);
  expect(isLimited("k", 2, t)).toBe(true);
  reset("k");
  expect(isLimited("k", 2, t)).toBe(false);
});

it("a full map drops expired windows first, keeping live budgets", () => {
  const t = 3_000_000;
  allow("live", 1, 60_000, t);
  for (let i = 0; i <= 10_001; i++) allow(`old-${i}`, 1, 0, t); // expired at once: past 10,000 keys they go first
  expect(allow("live", 1, 60_000, t)).toBe(false); // still counted, not reset
});
