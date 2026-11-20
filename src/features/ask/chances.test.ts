import { describe, expect, it } from "vitest";
import { bandOf, seatChange, trendOf, type Grid } from "./chances";

const o = { years: [2024, 2025, 2026], latestYear: 2026 };
const rank = 25000;

describe("bandOf", () => {
  it("likely: reached in the latest R1 or R2, or in R1/R2 in two years", () => {
    expect(bandOf(rank, { 2026: { R1: { closing: 26100 } } }, o)).toEqual({ band: "likely", why: "Reached in 2026 R1 (closed 26,100)." });
    expect(bandOf(rank, { 2026: { R1: { closing: 20000 }, R2: { closing: 26100, provisional: true } } }, o)).toEqual({ band: "likely", why: "Reached in 2026 R2 (provisional) (closed 26,100)." });
    expect(bandOf(rank, { 2024: { R2: { closing: 25500 } }, 2025: { R1: { closing: 25001 } }, 2026: { R1: { closing: 20000 } } }, o).band).toBe("likely");
  });
  it("possible: one R1/R2 year, R3 only, within 10%, or seats up within 20%", () => {
    expect(bandOf(rank, { 2025: { R2: { closing: 26000 } }, 2026: { R1: { closing: 20000 } } }, o).band).toBe("possible");
    expect(bandOf(rank, { 2025: { R1: { closing: 21000 }, R3: { closing: 27000 } } }, o)).toEqual({ band: "possible", why: "Reached only in R3 (27,000 in 2025 R3)." });
    expect(bandOf(rank, { 2025: { R3: { closing: 23000 } } }, o).band).toBe("possible"); // ≥ 22,500
    expect(bandOf(rank, { 2025: { R3: { closing: 21000 } } }, o).band).toBe("longShot");
    expect(bandOf(rank, { 2025: { R3: { closing: 21000 } } }, { ...o, seatsUp: true }).band).toBe("possible");
  });
  it("long shot: stray only, or within 20%; unlikely beyond; no history", () => {
    expect(bandOf(rank, { 2025: { R1: { closing: 9000 }, stray: { closing: 31000 } } }, o)).toEqual({ band: "longShot", why: "Reached only in a stray round (31,000 in 2025 stray)." });
    expect(bandOf(rank, { 2024: { R1: { closing: 9000 }, R3: { closing: 12000 } } }, o)).toEqual({ band: "unlikely", why: "Deepest closing 12,000 in 2024 R3, well before her rank." });
    expect(bandOf(rank, {}, o).band).toBe("noHistory");
    // Years outside the window don't count.
    expect(bandOf(rank, { 2023: { R1: { closing: 40000 } } }, o).band).toBe("noHistory");
  });
});

it("trend compares R1 closings across years", () => {
  const g: Grid = { 2024: { R1: { closing: 18200 } }, 2025: { R1: { closing: 19900 } }, 2026: { R1: { closing: 21100 } } };
  expect(trendOf(g)).toEqual({ arrow: "↑", text: "R1 18,200 (2024) → 19,900 (2025) → 21,100 (2026): deeper (easier)" });
  expect(trendOf({ 2024: { R1: { closing: 20000 } }, 2026: { R1: { closing: 16000 } } })!.arrow).toBe("↓");
  expect(trendOf({ 2024: { R1: { closing: 20000 } }, 2025: { R1: { closing: 20300 } } })!.arrow).toBe("→");
  expect(trendOf({ 2025: { R2: { closing: 20000 } } })).toBeNull();
});

it("seat change compares the clear vacancy list with last year's same round", () => {
  expect(seatChange({ clear: 5 }, { clear: 2 }, "2025 R2")).toEqual({ delta: 3, text: "+3 clear vs 2025 R2 (5 now, 2 then)" });
  expect(seatChange({ clear: null }, { clear: 4 }, "2025 R2")!.text).toBe("−4 clear vs 2025 R2 (0 now, 4 then)");
  expect(seatChange({ clear: 1 }, null, "2025 R2")).toBeNull();
});
