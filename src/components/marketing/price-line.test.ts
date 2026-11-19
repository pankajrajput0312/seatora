import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { freeNow } from "@/features/plans/plans";
import { priceLine } from "./price-line";

const until = "2026-11-20T23:59:59+05:30";

describe("the price line across FREE_FOR_ALL_UNTIL", () => {
  it("says free until 23:59 IST at 23:58 IST and only the price at 00:01 IST", () => {
    expect(priceLine(freeNow(new Date("2026-11-20T18:28:00Z"), until))).toBe(
      "Free account forever. Full access free until 23:59 IST, 20 Nov 2026; then ₹199 once for the 2026 season (until 31 Mar 2027).",
    );
    expect(priceLine(freeNow(new Date("2026-11-20T18:31:00Z"), until))).toBe("Free account forever. Full access: ₹199 once for the 2026 season (until 31 Mar 2027).");
  });

  it("turns over on the static public pages too: (site) re-renders at least hourly (the policy pages were prerendered once)", () => {
    expect(readFileSync("src/app/(site)/layout.tsx", "utf8")).toMatch(/^export const revalidate = 3600;$/m);
  });
});
