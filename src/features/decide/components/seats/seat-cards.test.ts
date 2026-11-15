import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { decideLinks } from "../../lib/links";
import { normalizeProgramme } from "../../server/terms";
import type { SeatList } from "../../types";
import { SeatCards, type CardRow } from "./seat-cards";
import { ViewPanes, ViewToggle } from "../view-toggle";

let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));

const list = (kind: SeatList["kind"]): SeatList =>
  ({ key: `2026-R2-${kind}`, year: 2026, round: "R2", kind, seats: 100, url: null, name: kind, publishedAt: null }) as SeatList;
const [clear, virtual, added] = [list("clear"), list("virtual"), list("new")];
const row: CardRow = {
  college: { key: "x", slug: "gmc-x", name: "GMC X", state: "Delhi", pincode: null, address: null, type: null, beds: null, established: null, website: null },
  course: { degree: "MD", specialty: "ANAESTHESIOLOGY", name: "Anaesthesiology", slug: "md-anaesthesiology" },
  degree: "MD",
  specialty: "ANAESTHESIOLOGY",
  quota: "All India",
  category: "OBC",
  byList: { [clear.key]: 3, [virtual.key]: 2 },
  deepest: { year: 2025, round: "R3", closing: 52345, n: 4, provisional: false },
  reach: null,
  reachProvisional: false,
  noLabel: null,
  fees: normalizeProgramme("MD/MS", []),
  hospital: { type: { value: "govt", basis: "inferred_name" }, beds: null, mccProfileUrl: "https://mcc.example/x" },
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

it("a seat card: the picked list's seats big, the round's other lists beside the course (never added), type, terms cells", () => {
  const html = renderToStaticMarkup(h(SeatCards, { rows: [row], list: clear, lists: [clear, virtual, added], ranked: false, L: decideLinks(), title: "Seats" }));
  const t = text(html);
  expect(t).toMatch(/Clear 3 /);
  expect(t).toContain("Virtual 2");
  expect(t).not.toContain("Newly added 0");
  expect(t).toContain("Deepest closing 52,345 2025 R3");
  expect(t).toContain("Government");
  expect(html.match(/<dt/g)).toHaveLength(5);
  expect(html).toContain('href="https://mcc.example/x"');
  expect(html).not.toContain("data-row"); // no drawer, no Details button
  // One list: just "Seats"; a row missing from the picked list shows "—", never 0.
  expect(text(renderToStaticMarkup(h(SeatCards, { rows: [{ ...row, byList: {} }], list: clear, lists: [clear], ranked: false, L: decideLinks(), title: "Seats" })))).toMatch(/Seats — /);
});

it("All rounds: a row with no seats in the picked round shows its newest list with seats, that round in the chip", () => {
  const old = { ...clear, key: "2025-R3-clear", year: 2025, round: "R3" } as SeatList;
  const html = renderToStaticMarkup(h(SeatCards, { rows: [{ ...row, byList: { [old.key]: 1 } }], list: clear, lists: [clear, virtual, added, old], ranked: false, L: decideLinks(), title: "Seats" }));
  const t = text(html);
  expect(t).toContain("2025 · R3");
  expect(t).not.toContain("2026 · R2");
  expect(t).toMatch(/Clear 1 /);
  // Seats in the picked round: that round stays.
  const same = text(renderToStaticMarkup(h(SeatCards, { rows: [{ ...row, byList: { [virtual.key]: 2, [old.key]: 1 } }], list: clear, lists: [clear, virtual, added, old], ranked: false, L: decideLinks(), title: "Seats" })));
  for (const x of ["2026 · R2", "Clear —", "Virtual 2"]) expect(same).toContain(x);
  expect(same).not.toContain("2025 · R3");
});

it("beds: the one Beds, self-reported said behind its (i) (not a hover title)", () => {
  const beds = { n: 750, kind: null, meta: null, own: true };
  const html = renderToStaticMarkup(h(SeatCards, { rows: [{ ...row, hospital: { ...row.hospital!, beds } }], list: clear, lists: [clear], ranked: false, L: decideLinks(), title: "Seats" }));
  expect(text(html)).toContain("750 beds");
  expect(html).toContain('aria-label="About beds, GMC X, MD Anaesthesiology');
  expect(text(html)).toContain("Self-reported by the hospital, not verified by Seatora.");
});

it("the Cards | Table toggle works without JS: links under `layout` (Seats' `view` is its list view), the panes follow it", () => {
  query = "rank=42284&view=list&layout=table";
  const html = renderToStaticMarkup(h(ViewToggle, { page: "seats", view: "table" }));
  expect(html).toContain('href="?rank=42284&amp;view=list&amp;layout=cards"');
  expect(html).toMatch(/<a href="\?rank=42284&amp;view=list&amp;layout=table" aria-current="true"[^>]*>.*Table<\/a>/);
  expect(html).not.toContain("<button");
  expect(renderToStaticMarkup(h(ViewPanes, { page: "seats", view: "table", cards: "C", table: "T" }))).toBe('<div data-view-pane="table">T</div>');
});
