import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InfoTip } from "./info-tip";

// The keyboard and pointer behaviour is the browser's (a <button popovertarget> and a popover="auto" panel), so the
// markup is the contract: e2e/info-tip.spec.ts drives it in a real browser.
const tip = (label: string, text: string) => createElement(InfoTip, { label } as React.ComponentProps<typeof InfoTip>, text);
const page = renderToStaticMarkup(createElement("div", null, createElement("p", null, "Fee ", tip("Fee", "Year 1 fee for this course and quota.")), tip("Bond", "Two years.")));
// Every tip's look is one stylesheet, once per page (React hoists it to <head>); the markup is the rest.
const css = page.match(/<style[^>]*>([^]*?)<\/style>/)![1];
const html = page.replace(/<style[^>]*>[^]*?<\/style>/g, "").replace(/^<div>|<\/div>$/g, "");
const rule = (sel: string) => css.match(new RegExp(`${sel.replace(/[.:]/g, "\\$&")}\\{([^}]*)\\}`))![1];

describe("InfoTip", () => {
  it("is a real button named About <label> that opens its panel natively (click, tap, Enter, Space)", () => {
    const btn = html.match(/<button[^>]*>/)![0];
    expect(btn).toContain('type="button"');
    expect(btn).toContain('aria-label="About Fee"');
    const target = btn.match(/popovertarget="([^"]+)"/i)![1];
    expect(html).toMatch(new RegExp(`<span[^>]*id="${target}"[^>]*popover="auto"`));
    expect(btn).toContain(`aria-controls="${target}"`);
    expect(btn).toContain('aria-expanded="false"');
  });

  it("light-dismisses (Escape, outside click) and takes focus: an auto popover dialog with tabindex -1", () => {
    const panel = html.match(/<span[^>]*popover[^>]*>/)![0];
    expect(panel).toContain('popover="auto"');
    expect(panel).toContain('role="dialog"');
    expect(panel).toContain('aria-label="Fee"');
    expect(panel).toContain('tabindex="-1"');
  });

  it("never opens on hover and nests inside a <p> (a span panel, no div)", () => {
    expect(html).not.toMatch(/onmouse|onpointer|<div/i);
    expect(html.startsWith("<p>Fee <button")).toBe(true);
    expect(html).toContain("Year 1 fee for this course and quota.</span></p>");
  });

  it("leaves a closed panel to the UA's display:none (no display class or rule on it)", () => {
    const cls = html.match(/<span[^>]*popover[^>]*class="([^"]*)"/)![1].split(/\s+/);
    expect(cls).toEqual(["tip-p"]);
    expect(css.match(/\.tip-p\{[^}]*\}/g)!.join("")).not.toMatch(/display:/);
  });

  it("has a 44px hit area round its 20px icon, none on paper", () => {
    expect(rule(".tip-i")).toContain("width:1.25rem;height:1.25rem");
    expect(rule(".tip-i::before")).toContain("inset:-.75rem");
    expect(css).toContain("@media print{.tip-i::before,.tip-t::before{display:none}");
  });

  it("is light: the stylesheet once however many tips, two short classes and a trimmed icon per tip", () => {
    expect(page.match(/<style/g)).toHaveLength(1);
    expect(css.startsWith("@layer components{")).toBe(true); // a caller's utilities still win
    const one = html.match(/<button[^]*?<\/button><span[^>]*>/)![0];
    expect(one.length).toBeLessThan(450);
  });

  it("before JS: under its button by CSS anchor positioning where the browser has it, else the UA's centring", () => {
    expect(rule(".tip-p")).not.toMatch(/(^|;)(inset|margin|top|left|right|bottom):/);
    expect(css).toMatch(/@supports \(top:anchor\(bottom\)\)\{\.tip-p\{position-anchor:auto;margin:0;right:auto;bottom:auto;top:calc\(anchor\(bottom/);
  });
});
