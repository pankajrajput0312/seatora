import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { statCells } from "../lib/stat-format";
import { normalizeProgramme } from "../server/terms";
import type { Term } from "../types";
import { StatCellView, StatHead, TermStatCells } from "./stat-cells";
import { TypeBadge } from "./type-badge";

const MCC = { name: "MCC institute profile (college declaration)", url: "https://mcc.admissions.nic.in/x?InstituteId=700359", type: "OFFICIAL" as const };
const t = normalizeProgramme("MD/MS", [
  { college: "X", program: "MD", kind: "BOND", text: "Service bond: 1 year · ₹50 L", amountInr: 5000000, source: MCC, details: { status: "documented", years: 1, amounts: [{ applies_to: "PG degree", inr: 5000000 }] } } satisfies Term,
]);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

it("card: five labelled cells, short values, each with an (i) button named after its cell and row", () => {
  const html = renderToStaticMarkup(h(TermStatCells, { t, of: "AIIMS, MD Anaesthesiology" }));
  expect(html.match(/<dt/g)).toHaveLength(5);
  for (const about of ["fee", "stipend", "service bond", "bond amount", "leaving penalty"]) expect(html).toContain(`aria-label="About ${about}, AIIMS, MD Anaesthesiology"`);
  expect(text(html)).toMatch(/1Y .*₹50 L/);
  // The short value is read out in full.
  expect(html).toMatch(/<span aria-hidden="true">₹50.L<\/span><span class="sr-only">₹50,00,000<\/span>/);
  expect(html).toContain("text-sun"); // a bond applies: orange
  expect(text(html)).toContain("— (not in Seatora&#x27;s data)"); // the fee: missing, never 0
});

it("table: five tds with full values, keyed by data-col; nothing breaks but a range's dash; the caller's padding wins", () => {
  const html = renderToStaticMarkup(h("tr", null, h(TermStatCells, { t, variant: "table", tdClassName: "px-2" })));
  expect([...html.matchAll(/data-col="(\w+)"/g)].map((m) => m[1])).toEqual(["fee", "stipend", "bond", "bondInr", "leaving"]);
  expect(text(html)).toContain("₹50,00,000");
  expect(html).toContain("1\u00a0year");
  expect(html).toContain("[:where(&amp;)]:px-3 [:where(&amp;)]:py-2 px-2");
  expect(html.match(/<button/g)).toHaveLength(5);
});

it("compact: short values, no (i) per cell; StatHead puts one (i) on the column; StatCellView is one cell", () => {
  const html = renderToStaticMarkup(h("tr", null, h(TermStatCells, { t, variant: "compact" })));
  expect(html).not.toContain("<button");
  expect(html).toMatch(/<span aria-hidden="true">₹50.L<\/span><span class="sr-only">₹50,00,000<\/span>/);
  expect(text(html)).toContain("1Y");
  const head = renderToStaticMarkup(h(StatHead, { k: "bondInr" }));
  expect(head).toContain('aria-label="About Bond ₹ column"');
  expect(text(head)).toContain("What you pay if you do not serve the bond.");
  const bond = statCells(t)[2];
  const one = renderToStaticMarkup(h(StatCellView, { c: bond, t, of: "X" }));
  expect(one).toContain('aria-label="About service bond, X"');
  expect(one).toContain("1\u00a0year");
});

it("type badge: coloured by kind, an (i) by tap or keyboard for inferred and researched types, named by its row", () => {
  const inferred = renderToStaticMarkup(h(TypeBadge, { type: { value: "govt", basis: "inferred from name and quota" } }));
  expect(inferred).toContain("bg-type-govt/10");
  expect(inferred).toContain('aria-label="About college type"');
  expect(renderToStaticMarkup(h(TypeBadge, { type: { value: "govt", basis: "inferred from name and quota" }, of: "AIIMS Delhi" }))).toContain('aria-label="About college type, AIIMS Delhi"');
  expect(text(inferred)).toContain("Inferred from name and quota. Not an official field.");
  const researched = renderToStaticMarkup(h(TypeBadge, { type: { value: "trust", basis: "data/curated/clinical_facts.json (kind trust_dnb)" } }));
  expect(researched).toContain('aria-label="About college type"');
  expect(text(researched)).toContain("Trust : From Seatora&#x27;s research on this hospital. Not an official field.");
  expect(renderToStaticMarkup(h(TypeBadge, { type: { value: "deemed", basis: "inferred from name and quota" } }))).toContain("bg-type-deemed/10");
});
