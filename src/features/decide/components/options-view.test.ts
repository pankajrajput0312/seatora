import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OptionRow } from "../service";
import { reachLabel } from "../lib/reach";
import { cardClosing, listRow, RoundGrid, seatKindShort } from "./options-view";

describe("listRow", () => {
  it("drops the published terms and flat texts the Options list never reads, and keeps the rest", () => {
    const row = { id: "x", reach: "reached-latest", fees: { years: [] }, grid: { 2025: {} }, terms: { fee: { text: "₹1 L" } }, feeText: "₹1 L", stipendText: null, bondText: null, penaltyText: null, allotmentsByYear: { 2025: 3 } } as unknown as OptionRow;
    const out = listRow(row);
    expect(Object.keys(out).sort()).toEqual(["fees", "grid", "id", "reach"]);
    expect(out.fees).toBe(row.fees);
  });
});

describe("cardClosing", () => {
  const d = (closing: number) => ({ closing, round: "R1" as const, category: "OBC" as const, provisional: false });
  it("shows the latest R1 while the labels count it, else the later past year's deepest, then the older's; null when none", () => {
    const r = { latest: d(30000), byYear: { 2024: d(50000), 2025: d(45000) } };
    expect(cardClosing(r, 2026, [2024, 2025], true)).toEqual({ d: d(30000), year: 2026 });
    expect(cardClosing(r, 2026, [2024, 2025], false)).toEqual({ d: d(45000), year: 2025 });
    expect(cardClosing({ latest: null, byYear: { 2024: d(50000), 2025: null } }, 2026, [2024, 2025], true)).toEqual({ d: d(50000), year: 2024 });
    expect(cardClosing({ latest: d(30000), byYear: {} }, 2026, [2024, 2025], false)).toEqual({ d: d(30000), year: 2026 });
    expect(cardClosing({ latest: null, byYear: {} }, 2026, [2024, 2025], true)).toBeNull();
  });
});

describe("RoundGrid", () => {
  it("lists years newest first", () => {
    const c = { closing: 1000, n: 2, category: "OBC", provisional: false };
    const grid = { 2023: { R1: c }, 2026: { R1: c }, 2024: { R1: c } } as unknown as OptionRow["grid"];
    const html = renderToStaticMarkup(createElement(RoundGrid, { row: { grid, reach: "reached-latest" }, caption: "x" }));
    const years = [...html.matchAll(/<th scope="row"[^>]*>(\d{4})<\/th>/g)].map((m) => m[1]);
    expect(years).toEqual(["2026", "2024", "2023"]);
  });
});

describe("'never allotted before' vs 'newly added': two meanings, two words", () => {
  it("an option with no past allotment is 'Never allotted before'; 'newly added' is only MCC's newly added seat list", () => {
    expect(reachLabel("new", { year: 2026, round: "R1" }, [2024, 2025])).toBe("Never allotted before");
    expect(seatKindShort("new")).toBe("newly added");
    expect([seatKindShort("clear"), seatKindShort("virtual")]).toEqual(["clear", "virtual"]);
    const html = renderToStaticMarkup(createElement(RoundGrid, { row: { grid: {}, reach: "new" }, caption: "x" }));
    expect(html).toContain("Never allotted before");
    expect(html).not.toMatch(/\bnew\b/i);
  });
});
