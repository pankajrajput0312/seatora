import { describe, expect, it } from "vitest";
import { byNumber, byText, chain } from "./sorts";

type R = { id: string; n?: number | null; s?: string | null; g?: number };
const ids = (xs: R[]) => xs.map((x) => x.id);

describe("sort comparators", () => {
  const rows: R[] = [
    { id: "a", n: 3, s: "Bombay" },
    { id: "b", n: null, s: null },
    { id: "c", n: 1, s: "agra" },
    { id: "d", n: NaN, s: "" },
    { id: "e", n: 3, s: "Ánand" },
    { id: "f", n: 2, s: "Item 10" },
    { id: "g", s: "Item 9" },
  ];

  it("numbers: lowest first, no value last, ties in their order", () => {
    expect(ids([...rows].sort(byNumber((r) => r.n)))).toEqual(["c", "f", "a", "e", "b", "d", "g"]);
  });

  it("numbers: highest first with desc, no value still last", () => {
    expect(ids([...rows].sort(byNumber((r) => r.n, "desc")))).toEqual(["a", "e", "f", "c", "b", "d", "g"]);
  });

  it("text: A to Z ignoring case and accents, numbers in order, no text last", () => {
    expect(ids([...rows].sort(byText((r) => r.s)))).toEqual(["c", "e", "a", "g", "f", "b", "d"]);
  });

  it("chain: the next key breaks a tie; a full tie keeps the order", () => {
    const xs: R[] = [
      { id: "1", g: 2, n: 5 },
      { id: "2", g: 1, n: 9 },
      { id: "3", g: 2, n: 1 },
      { id: "4", g: 1, n: 9 },
    ];
    expect(ids([...xs].sort(chain(byNumber((r) => r.g), byNumber((r) => r.n))))).toEqual(["2", "4", "3", "1"]);
    expect(chain<R>()(xs[0], xs[1])).toBe(0);
  });
});
