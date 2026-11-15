import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultCard, ResultCards } from "./result-card";

const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("ResultCard", () => {
  const card = (props: Partial<React.ComponentProps<typeof ResultCard>> = {}) =>
    renderToStaticMarkup(h(ResultCard, {
      title: "Maulana Azad Medical College",
      href: "/decide/institute/mamc",
      chips: ["2026 · R1", "All India Quota", null, "Open"],
      stat: { label: "Rank", value: "1" },
      subtitle: "MD Anaesthesiology",
      meta: ["Delhi", h("span", { "data-badge": true }, "Govt"), false, "1,538 beds"],
      footer: h("dl", { "data-cells": true }),
      actions: h("button", { type: "button", "aria-label": "Save" }),
      ...props,
    }));

  it("reads title first, then course, meta, number, chips, footer; skips empty slots", () => {
    expect(text(card())).toBe("Maulana Azad Medical CollegeMD AnaesthesiologyDelhi•, Govt•, 1,538 bedsRank12026 · R1, All India Quota, Open");
    const html = card();
    expect(html.indexOf("<h3")).toBeLessThan(html.indexOf("Rank"));
    expect(html.indexOf("Rank")).toBeLessThan(html.indexOf("order-first"));
    expect(html.indexOf("order-first")).toBeLessThan(html.indexOf("data-cells"));
    expect(html).toMatch(/<a [^>]*href="\/decide\/institute\/mamc"/);
    expect(html).toContain('aria-label="Save"');
  });

  it("hides the separators from screen readers, with a comma in their place", () => {
    const html = card();
    expect(html.match(/<span aria-hidden="true">•<\/span><span class="sr-only">, <\/span>/g)).toHaveLength(2);
    expect(html.match(/aria-hidden="true" class="h-3 w-px bg-border"><\/span><span class="sr-only">, <\/span>/g)).toHaveLength(2);
  });

  it("external: an icon link beside an in-app title, or the title itself; both say they open a new tab", () => {
    const both = card({ external: { href: "https://mcc.nic.in/x", label: "MCC profile: Maulana Azad Medical College" } });
    expect(both).toContain('href="/decide/institute/mamc"');
    expect(both).toMatch(/<a href="https:\/\/mcc.nic.in\/x" target="_blank" rel="noopener noreferrer" aria-label="MCC profile: Maulana Azad Medical College \(opens in a new tab\)"/);
    const only = card({ href: undefined, external: { href: "https://mcc.nic.in/x", label: "MCC profile" } });
    expect(only).toMatch(/<a href="https:\/\/mcc.nic.in\/x" target="_blank" rel="noopener noreferrer"[^>]*>Maulana Azad Medical College<span[^>]*><svg[^>]*aria-hidden="true"/);
    expect(text(only)).toContain("Maulana Azad Medical College (opens in a new tab)");
    expect(card({ href: undefined })).not.toContain("<a ");
  });

  it("leaves out the header, number, meta and footer when not given; heading level is the page's", () => {
    const html = renderToStaticMarkup(h(ResultCard, { title: "X", level: 4, chips: [null, ""] }));
    expect(html).toContain("<h4");
    for (const s of ["order-first", "Rank", "border-t", "•"]) expect(html).not.toContain(s);
  });
});

describe("ResultCards", () => {
  it("names the list by its heading and count, one item per card", () => {
    const html = renderToStaticMarkup(h(ResultCards, { title: "Allotments", count: "1–25 of 1,234", id: "results" }, h(ResultCard, { key: "a", title: "A" }), null, h(ResultCard, { key: "b", title: "B" })));
    expect(html).toMatch(/^<section aria-labelledby="results"[^>]*><h2 id="results" tabindex="-1"/);
    expect(text(html)).toContain("Allotments (1–25 of 1,234)");
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toContain('<ul role="list"');
  });

  it("makes its own heading id when none is given; hideTitle keeps it for screen readers", () => {
    const html = renderToStaticMarkup(h(ResultCards, { title: "Fees", hideTitle: true, level: 3 }, h(ResultCard, { title: "A" })));
    const id = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(id).toMatch(/^cards[\w-]+$/);
    expect(html).toContain(`<h3 id="${id}" tabindex="-1" class="text-sm font-semibold sr-only">Fees</h3>`);
  });
});
