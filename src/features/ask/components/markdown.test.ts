import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { blocks, Markdown, safeHref } from "./markdown";

it("keeps links to Seatora paths and https only", () => {
  expect(safeHref("/decide/options")).toBe("/decide/options");
  expect(safeHref("https://mcc.nic.in/x")).toBe("https://mcc.nic.in/x");
  for (const bad of ["javascript:alert(1)", "//evil.com", "/\\evil.com", "http://x.com", "data:text/html,1"]) expect(safeHref(bad)).toBeNull();
});

it("splits headings, lists, tables and fences", () => {
  const b = blocks("## Plan\n\n1. One\n2. Two\n\n| No. | College |\n|---|---|\n| 1 | KEM |\n\n```Copy in MCC order\n1. KEM — MD — All India\n```\ntail");
  expect(b.map((x) => x.kind)).toEqual(["h", "ol", "table", "code", "p"]);
  expect(b[2]).toEqual({ kind: "table", head: ["No.", "College"], rows: [["1", "KEM"]] });
  expect(b[3]).toMatchObject({ title: "Copy in MCC order", text: "1. KEM — MD — All India" });
});

it("escapes HTML and drops unsafe links", () => {
  const html = renderToStaticMarkup(Markdown({ text: "<img src=x onerror=alert(1)> **bold** [x](javascript:alert(1)) [ok](/decide/fees)" }));
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img");
  expect(html).toContain("<strong>bold</strong>");
  expect(html).not.toContain("javascript:");
  expect(html).toContain('href="/decide/fees"');
});
