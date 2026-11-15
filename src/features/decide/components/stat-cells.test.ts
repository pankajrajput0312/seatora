import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { normalizeProgramme } from "../server/terms";
import type { Term } from "../types";
import { TermStatCells } from "./stat-cells";
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

it("table: five tds with full values, keyed by data-col", () => {
  const html = renderToStaticMarkup(h("tr", null, h(TermStatCells, { t, variant: "table" })));
  expect([...html.matchAll(/data-col="(\w+)"/g)].map((m) => m[1])).toEqual(["fee", "stipend", "bond", "bondInr", "leaving"]);
  expect(text(html)).toContain("₹50,00,000");
});

it("type badge: green for government, an (i) only when the type is inferred", () => {
  const inferred = renderToStaticMarkup(h(TypeBadge, { type: { value: "govt", basis: "inferred from name and quota" } }));
  expect(inferred).toContain("bg-leaf/10");
  expect(inferred).toContain('aria-label="About college type"');
  expect(renderToStaticMarkup(h(TypeBadge, { type: { value: "govt", basis: "inferred from name and quota" }, of: "AIIMS Delhi" }))).toContain('aria-label="About college type, AIIMS Delhi"');
  expect(text(inferred)).toContain("Inferred from name and quota. Not an official field.");
  const researched = renderToStaticMarkup(h(TypeBadge, { type: { value: "trust", basis: "data/curated/clinical_facts.json (kind trust_dnb)" } }));
  expect(researched).not.toContain("<button");
  expect(researched).toContain("title=\"From Seatora&#x27;s research on this hospital. Not an official field.\"");
  expect(renderToStaticMarkup(h(TypeBadge, { type: { value: "deemed", basis: "inferred from name and quota" } }))).toContain("bg-sky/10");
});
