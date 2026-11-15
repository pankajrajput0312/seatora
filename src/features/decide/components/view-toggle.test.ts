import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "./ui";
import { deviceView, parseView, VIEW_PARAM, viewHref, ViewField, ViewPanes, ViewToggle } from "./view-toggle";

let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));
vi.mock("next/form", () => ({ default: (p: React.ComponentProps<"form">) => createElement("form", p) }));

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

  it("nothing chosen: cards on a phone, the table elsewhere", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1";
    const androidPhone = "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36";
    const androidTablet = "Mozilla/5.0 (Linux; Android 14) Chrome/130 Safari/537.36";
    expect([deviceView(iphone, null), deviceView(androidPhone, null), deviceView(androidTablet, null), deviceView(null, null)]).toEqual(["cards", "cards", "table", "table"]);
    expect([deviceView(androidTablet, "?1"), deviceView(androidPhone, "?0")]).toEqual(["cards", "table"]);
  });

  it("renders links that work without JS, the view on show marked current", () => {
    query = "rank=42284&cat=OBC&view=all&layout=table";
    const html = renderToStaticMarkup(createElement(ViewToggle, { page: "test", view: "table" }));
    expect(html).toContain('role="group" aria-label="View as"');
    expect(html).toContain('href="?rank=42284&amp;cat=OBC&amp;view=all&amp;layout=cards"');
    expect(html).toMatch(/<a href="\?rank=42284&amp;cat=OBC&amp;view=all&amp;layout=table" aria-current="true"[^>]*>.*Table<\/a>/);
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).not.toContain("<button");
  });

  it("the view the server picked (her cookie, the device) is marked even with no `layout` in the address", () => {
    query = "rank=1";
    const html = renderToStaticMarkup(createElement(ViewToggle, { page: "test", view: "cards" }));
    expect(html).toMatch(/<a href="\?rank=1&amp;layout=cards" aria-current="true"/);
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });

  it("the server can read the param: view-toggle.tsx is not a client module (its exports would be references there)", () => {
    expect(readFileSync(new URL("./view-toggle.tsx", import.meta.url), "utf8")).not.toMatch(/^\s*["']use client["']/);
    expect(VIEW_PARAM).toBe("layout");
  });

  it("panes: only the view on show is rendered", () => {
    expect(renderToStaticMarkup(createElement(ViewPanes, { page: "test", view: "table", cards: "C", table: "T" }))).toBe('<div data-view-pane="table">T</div>');
    expect(renderToStaticMarkup(createElement(ViewPanes, { page: "test", view: "cards", cards: "C", table: "T" }))).toBe('<div data-view-pane="cards">C</div>');
  });

  it("Apply keeps the address's choice, without JS too: FilterBar carries it, nothing else does", () => {
    query = "rank=1&layout=cards&view=all";
    expect(renderToStaticMarkup(createElement(ViewField))).toBe('<input type="hidden" name="layout" value="cards"/>');
    const form = renderToStaticMarkup(createElement(FilterBar, { action: "/decide/fees", params: new URLSearchParams(query) } as React.ComponentProps<typeof FilterBar>));
    expect(form.match(/type="hidden" name="[^"]+" value="[^"]*"/g)).toEqual(['type="hidden" name="rank" value="1"', 'type="hidden" name="layout" value="cards"']);
    query = "layout=list";
    expect(renderToStaticMarkup(createElement(ViewField))).toBe("");
  });
});
