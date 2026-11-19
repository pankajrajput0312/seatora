import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readTermFilters } from "../lib/term-filters";
import { TermFilterControls } from "./term-filter-controls";

const render = (q: string, caps?: { maxFeeLakh: number | null; maxBondYears: number | null }) =>
  renderToStaticMarkup(createElement("form", null, createElement(TermFilterControls, { f: readTermFilters(new URLSearchParams(q)).params, caps })));
const checked = (html: string, name: string, value: string) =>
  (html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`, "g")) ?? []).some((i) => i.includes(`value="${value}"`) && i.includes("checked"));
const selected = (html: string, name: string) => html.match(new RegExp(`<select name="${name}"[\\s\\S]*?</select>`))![0].match(/<option value="([^"]*)" selected/)?.[1];

describe("TermFilterControls", () => {
  it("native GET fields named as the params, the applied values selected", () => {
    const html = render("ctype=govt&maxfee=5&bondyrs=0&minstip=80000&maxbond=10&maxleave=5&nd=keep");
    for (const n of ["maxfee", "bondyrs", "minstip", "maxbond", "maxleave"]) expect(html).toContain(`<select name="${n}"`);
    expect(selected(html, "maxfee")).toBe("5");
    expect(selected(html, "bondyrs")).toBe("0");
    expect(checked(html, "ctype", "govt")).toBe(true);
    expect(checked(html, "ctype", "esic")).toBe(false);
    expect(checked(html, "nd", "keep")).toBe(true);
    expect(html).toContain(">No bond / none declared to MCC<");
    expect(checked(html, "nf", "hide")).toBe(false); // a fee cap keeps the options with no published fee by default
    expect(html).toContain('aria-label="About Fees &amp; bond"'); // "Include not published" explained behind the section's (i)
  });

  it("nothing applied: any, include-not-declared unticked", () => {
    const html = render("");
    expect(selected(html, "maxfee")).toBe("");
    expect(html).toContain("Hide options with no published fee");
    expect(checked(html, "nd", "keep")).toBe(false);
    expect(html).toMatch(/>Stipend<\/span><select name="minstip"/); // a short visible label, its row in the sheet
  });

  it("her profile's caps are the default, and Any clears them; a value off the list is kept", () => {
    const html = render("maxfee=7", { maxFeeLakh: 10, maxBondYears: 1 });
    expect(html).toContain("Your cap: Fee up to ₹10 L/yr");
    expect(html).toContain("Your cap: Bond up to 1 year");
    expect(html).toContain('<option value="any">Any fee</option>');
    expect(selected(html, "maxfee")).toBe("7");
  });
});
