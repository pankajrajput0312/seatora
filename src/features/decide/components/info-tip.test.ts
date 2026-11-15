import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InfoTip } from "./info-tip";

// The keyboard and pointer behaviour is the browser's (a <button popovertarget> and a popover="auto" panel), so the
// markup is the contract: e2e/info-tip.spec.ts drives it in a real browser.
const html = renderToStaticMarkup(createElement("p", null, "Fee ", createElement(InfoTip, { label: "Fee" } as React.ComponentProps<typeof InfoTip>, "Year 1 fee for this course and quota.")));

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

  it("leaves a closed panel to the UA's display:none (no display class on it)", () => {
    const cls = html.match(/<span[^>]*popover[^>]*class="([^"]*)"/)![1].split(/\s+/);
    expect(cls.filter((c) => /^(block|inline|inline-block|flex|grid|inline-flex|contents)$/.test(c))).toEqual([]);
  });

  it("has a 44px hit area round its 20px icon", () => {
    expect(html).toContain("size-5");
    expect(html).toContain("before:-inset-3");
  });
});
