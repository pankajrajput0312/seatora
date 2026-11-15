import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { paneClass, parseView, viewHref, ViewPanes, ViewToggle } from "./view-toggle";

let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));

describe("view toggle", () => {
  it("accepts only the two views", () => {
    expect(parseView("cards")).toBe("cards");
    expect(parseView("table")).toBe("table");
    for (const v of [null, undefined, "", "list", 1, ["cards"]]) expect(parseView(v)).toBeNull();
  });

  it("sets view and keeps every other param, repeated ones too", () => {
    const p = new URLSearchParams("rank=42284&sp=ANAESTHESIOLOGY&sp=FAMILYMEDICINE&layout=table&page=2");
    expect(viewHref(p, "cards")).toBe("?rank=42284&sp=ANAESTHESIOLOGY&sp=FAMILYMEDICINE&layout=cards&page=2");
    expect(viewHref(null, "table")).toBe("?layout=table");
  });

  it("shows the chosen pane, else cards below md and the table from md", () => {
    expect([paneClass("cards", "cards"), paneClass("cards", "table")]).toEqual([undefined, "hidden"]);
    expect([paneClass("table", "cards"), paneClass("table", "table")]).toEqual(["hidden", undefined]);
    expect([paneClass(null, "cards"), paneClass(null, "table")]).toEqual(["md:hidden", "max-md:hidden"]);
  });

  it("renders links that work without JS, the address's choice marked current", () => {
    query = "rank=42284&cat=OBC&view=all&layout=table";
    const html = renderToStaticMarkup(createElement(ViewToggle, { page: "test" }));
    expect(html).toContain('role="group" aria-label="View as"');
    expect(html).toContain('href="?rank=42284&amp;cat=OBC&amp;view=all&amp;layout=cards"');
    expect(html).toMatch(/<a href="\?rank=42284&amp;cat=OBC&amp;view=all&amp;layout=table" aria-current="true"[^>]*>.*Table<\/a>/);
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });

  it("with nothing chosen, marks neither current (CSS shows the breakpoint's)", () => {
    query = "rank=1";
    const html = renderToStaticMarkup(createElement(ViewToggle, { page: "test" }));
    expect(html).not.toContain("aria-current");
    expect(html).toContain("max-md:text-sky");
    expect(html).toContain("md:text-sky");
  });

  it("panes: both rendered, the address picks one", () => {
    query = "view=all&layout=cards";
    const html = renderToStaticMarkup(createElement(ViewPanes, { page: "test", cards: "C", table: "T" }));
    expect(html).toBe('<div data-view-pane="cards">C</div><div data-view-pane="table" class="hidden">T</div>');
    query = "view=nope";
    expect(renderToStaticMarkup(createElement(ViewPanes, { page: "test", cards: "C", table: "T" }))).toBe(
      '<div data-view-pane="cards" class="md:hidden">C</div><div data-view-pane="table" class="max-md:hidden">T</div>',
    );
  });
});
