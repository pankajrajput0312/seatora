import { expect, it } from "vitest";
import { bigNumbers, grade } from "./grade";

it("reads Indian and Western grouped numbers, skipping years and small numbers", () => {
  expect(bigNumbers("AIR 42,284 in 2025 R3 closed at 1,37,868; 45409 seats 12; ₹1,25,000 and 100,000")).toEqual([42284, 137868, 45409, 125000, 100000]);
});

it("fails answers with numbers no tool gave, missing tools/links, or forbidden words", () => {
  const c = { id: "x", question: "q", expect: { tools: [["last_ranks", "college_profile"]], contains: ["/decide/last-ranks"], forbidden: ["you will get", "guarantee"] } };
  const ok = grade(c, "It closed at 45,409 (2025 R3). See [Last ranks](/decide/last-ranks?course=x).", { tools: ["last_ranks"], given: '{"closings":["2025: R3 45,409 (Open)"]}' });
  expect(ok).toEqual({ pass: true, failures: [] });
  const bad = grade(c, "You will get it: it closed at 46,000.", { tools: ["search_options"], given: "45,409" });
  expect(bad.pass).toBe(false);
  expect(bad.failures).toEqual([
    "expected a call to last_ranks or college_profile",
    'missing "/decide/last-ranks"',
    "forbidden /you will get/",
    "numbers not in any tool result: 46000",
  ]);
});

it("fails a case whose lookups crashed, whatever the answer says", () => {
  const g = grade({ id: "x", question: "q", expect: {} }, "Sorry, the data is unavailable.", { tools: ["schedule"], given: "The data lookup failed. Say the data is unavailable right now; do not guess." });
  expect(g.failures).toEqual(["a tool lookup failed (data unavailable)"]);
});
