import { expect, it } from "vitest";
import { allow } from "./rate-limit";

it("allows up to the limit per window, then resets", () => {
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) expect(allow("ip-a", 3, 1000, t)).toBe(true);
  expect(allow("ip-a", 3, 1000, t)).toBe(false);
  expect(allow("ip-b", 3, 1000, t)).toBe(true);
  expect(allow("ip-a", 3, 1000, t + 1000)).toBe(true);
});
