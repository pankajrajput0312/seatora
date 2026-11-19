import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { bigClosing, cardMeta, youMarks } from "./rank-cards";

it("your rank falls before each round's first allotment at or past it, none when every rank is below", () => {
  const rows = [
    { round: "R1" as const, rank: 10 }, { round: "R1" as const, rank: 20 }, { round: "R1" as const, rank: 30 },
    { round: "R2" as const, rank: 25 }, { round: "R2" as const, rank: 40 },
    { round: "stray" as const, rank: 5 },
  ];
  expect([...youMarks(rows, 20)]).toEqual([rows[1], rows[3]]);
  expect([...youMarks(rows, 1)]).toEqual([rows[0], rows[3], rows[5]]);
  expect(youMarks(rows, 99).size).toBe(0);
});

it("card's big number: the sorted column, else the newest year with a closing, R1 before later rounds", () => {
  const grid = { 2023: { R1: { closing: 100 } }, 2025: { R2: { closing: 300 }, stray: { closing: 400 } }, 2026: {} };
  expect(bigClosing(grid, [2023, 2025, 2026])).toEqual({ year: 2025, round: "R2", cell: { closing: 300 } });
  expect(bigClosing(grid, [2026, 2025, 2023], { year: 2026, round: "R1" })).toEqual({ year: 2026, round: "R1", cell: null });
  expect(bigClosing({}, [2026])).toBeNull();
  // A closing-rank range: the newest round that closed in it (the one the filter matched), else as without it.
  expect(bigClosing(grid, [2023, 2025, 2026], null, { min: 350 })).toEqual({ year: 2025, round: "stray", cell: { closing: 400 } });
  expect(bigClosing(grid, [2023, 2025, 2026], null, { max: 150 })).toEqual({ year: 2023, round: "R1", cell: { closing: 100 } });
  expect(bigClosing(grid, [2023, 2025, 2026], null, { min: 9999 })).toEqual({ year: 2025, round: "R2", cell: { closing: 300 } });
});

it("meta skips what is not known; More filters opens when one of them is set", () => {
  const html = renderToStaticMarkup(h("div", null, ...cardMeta({ state: "Delhi", hospital: { type: { value: "govt", basis: "inferred from name and quota" }, beds: { n: 1538, kind: null, meta: null, own: true } } }, "MAMC")));
  expect(html).toContain("Delhi");
  expect(html).toContain(">Govt<");
  expect(html).toContain("1,538");
  expect(html).toContain('aria-label="About beds, MAMC"');
  expect(renderToStaticMarkup(h("div", null, ...cardMeta({ state: null, hospital: null }, "X")))).toBe("<div></div>");
});
