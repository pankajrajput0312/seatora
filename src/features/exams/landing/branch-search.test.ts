import { expect, it } from "vitest";
import { ordered } from "./branch-search";

// Rows as the server writes them (data-i: its order, Open's lowest first; no Open seat last).
const row = (i: number, name: string, d: Record<string, number> = {}) => ({ dataset: { i: String(i), name, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v)])) } });
const rows = [
  row(0, "md general medicine", { open: 6334, obc: 9000, n: 500 }),
  row(1, "md radiodiagnosis", { open: 6334, sc: 40000, n: 200 }), // ties Open with General Medicine
  row(2, "md anaesthesiology", { open: 28979, obc: 34013, sc: 90000, n: 901 }),
  row(3, "diploma radiodiagnosis", { sc: 23520, n: 2 }), // no Open seat
];
const names = (by: string, rs: { dataset: DOMStringMap }[] = rows) => ordered(rs, by).map((r) => r.dataset.name);

it("sorts the branch rows by the option picked, rows without its value last, ties in the server's order", () => {
  expect(names("")).toEqual(["md general medicine", "md radiodiagnosis", "md anaesthesiology", "diploma radiodiagnosis"]);
  // The server's order back from any other.
  expect(ordered(ordered(rows, "name"), "").map((r) => r.dataset.i)).toEqual(["0", "1", "2", "3"]);
  expect(names("open")).toEqual(names(""));
  expect(names("open-desc")).toEqual(["md anaesthesiology", "md general medicine", "md radiodiagnosis", "diploma radiodiagnosis"]);
  expect(names("sc")).toEqual(["diploma radiodiagnosis", "md radiodiagnosis", "md anaesthesiology", "md general medicine"]);
  expect(names("obc")).toEqual(["md general medicine", "md anaesthesiology", "md radiodiagnosis", "diploma radiodiagnosis"]);
  expect(names("st")).toEqual(names("")); // nobody has it: the server's order
  expect(names("n-desc")).toEqual(["md anaesthesiology", "md general medicine", "md radiodiagnosis", "diploma radiodiagnosis"]);
  expect(names("name")).toEqual(["diploma radiodiagnosis", "md anaesthesiology", "md general medicine", "md radiodiagnosis"]);
  expect(rows.map((r) => r.dataset.i)).toEqual(["0", "1", "2", "3"]); // never sorts in place
});

it("a restricted row sorts by its one last rank on any rank sort", () => {
  const restricted = [row(0, "md anaesthesiology non-resident indian", { last: 120000, n: 1 }), row(1, "md anaesthesiology armed forces medical", { last: 133207, n: 3 })];
  expect(names("open-desc", restricted)).toEqual(["md anaesthesiology armed forces medical", "md anaesthesiology non-resident indian"]);
  expect(names("obc-desc", restricted)).toEqual(names("open-desc", restricted));
  expect(names("sc", restricted)).toEqual(names("", restricted));
});
