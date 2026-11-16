import { expect, it } from "vitest";
import { bigNumbers, checkAnswer, knownRoute, lakhAmounts } from "./check";

it("reads rank-sized numbers and lakh/crore amounts", () => {
  expect(bigNumbers("AIR 42,284 in 2025 R3 closed at 1,37,868; 45409 seats 12; ₹1,25,000")).toEqual([42284, 137868, 45409, 125000]);
  expect(lakhAmounts("₹33 L a year, ₹1.25 L max, up to ₹1.5 Cr, ₹20 lakh")).toEqual([3300000, 125000, 15000000, 2000000]);
});

it("knows Seatora's routes and real institute slugs", () => {
  const slugs = new Set(["jss-medical-college-570015"]);
  expect(knownRoute("/decide/last-ranks?course=md-anaesthesiology", slugs)).toBe(true);
  expect(knownRoute("/decide/institutes/jss-medical-college-570015?tab=fees", slugs)).toBe(true);
  expect(knownRoute("/decide/institutes/made-up-college-1", slugs)).toBe(false);
  expect(knownRoute("/decide/ask/report/cmwif1fvb000fyegexgztqswm", slugs)).toBe(true);
  expect(knownRoute("/decide/predictor", slugs)).toBe(false);
});

it("passes figures found in the sources and flags the rest", () => {
  const given = '{"closings":["2025: R3 45,409 (Open)"],"fee":"₹33 L","stipend":"₹48,000"}';
  const ok = checkAnswer("Closed at 45,409; fee ₹33 L; stipend ₹48,000. [JSS](/decide/institutes/jss-medical-college-570015)", given, new Set(["jss-medical-college-570015"]));
  expect(ok).toEqual({ passed: 4, failed: 0, missingNumbers: [], badLinks: [] });
  const bad = checkAnswer("Closed at about 46,000; fee ₹35 L. [See](/decide/predictor)", given, new Set());
  expect(bad).toEqual({ passed: 0, failed: 3, missingNumbers: ["46,000", "₹35 L"], badLinks: ["/decide/predictor"] });
});
