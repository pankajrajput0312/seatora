import { describe, expect, it } from "vitest";
import type { OptionRow } from "../service";
import { listRow } from "./options-view";

describe("listRow", () => {
  it("drops the published terms and flat texts the Options list never reads, and keeps the rest", () => {
    const row = { id: "x", reach: "reached-latest", fees: { years: [] }, grid: { 2025: {} }, terms: { fee: { text: "₹1 L" } }, feeText: "₹1 L", stipendText: null, bondText: null, penaltyText: null, allotmentsByYear: { 2025: 3 } } as unknown as OptionRow;
    const out = listRow(row);
    expect(Object.keys(out).sort()).toEqual(["fees", "grid", "id", "reach"]);
    expect(out.fees).toBe(row.fees);
  });
});
