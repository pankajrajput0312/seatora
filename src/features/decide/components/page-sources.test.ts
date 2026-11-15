import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSourceStore, docKey, numberRuns, PageSources, SourceRef, SourceRefs, type SourceDoc } from "./page-sources";

const a: SourceDoc = { name: "MCC profile A", url: "https://mcc.example/a", type: "OFFICIAL" };
const b: SourceDoc = { name: "MCC profile B", url: "https://mcc.example/b", type: "OFFICIAL" };
const c: SourceDoc = { name: "NBEMS notice", url: null, type: "OFFICIAL" };
const nums = (s: ReturnType<typeof createSourceStore>) => s.list().map((d) => `${d.n}:${d.name}`);

describe("createSourceStore", () => {
  it("numbers documents 1…N in first-cited order, each once however many blocks cite it", () => {
    const s = createSourceStore();
    s.add("block1", [a, b]);
    s.add("block2", [b, c, a]);
    expect(nums(s)).toEqual(["1:MCC profile A", "2:MCC profile B", "3:NBEMS notice"]);
    expect([a, b, c].map((d) => s.number(docKey(d)))).toEqual([1, 2, 3]);
  });

  it("one URL is one document, whatever name a block gives it", () => {
    const s = createSourceStore();
    s.add("x", [a]);
    s.add("y", [{ ...a, name: "The college's MCC profile" }, b]);
    expect(nums(s)).toEqual(["1:MCC profile A", "2:MCC profile B"]);
  });

  it("dedupes by key, keeping the first block's name and merging every block's links in order", () => {
    const s = createSourceStore();
    s.add("x", [{ key: "mcc|2025", name: "MCC results 2025", links: [{ label: "R2", url: "r2", order: 1 }] }]);
    s.add("y", [{ key: "mcc|2025", name: "other name", links: [{ label: "R1", url: "r1", order: 0 }, { label: "R2", url: "r2", order: 1 }] }]);
    const [d] = s.list();
    expect(s.list()).toHaveLength(1);
    expect(d.name).toBe("MCC results 2025");
    expect(d.links?.map((l) => l.label)).toEqual(["R1", "R2"]);
  });

  it("renumbers without gaps when a block goes away, and keeps a document while another block still cites it", () => {
    const s = createSourceStore();
    s.add("1", [a]);
    s.add("2", [b, c]);
    s.add("3", [c]);
    s.remove("1");
    expect(nums(s)).toEqual(["1:MCC profile B", "2:NBEMS notice"]);
    s.remove("2");
    expect(nums(s)).toEqual(["1:NBEMS notice"]);
    expect(s.number(`${a.name}|${a.url}`)).toBeNull();
  });

  it("keeps a document's place when its block re-registers (a filter change)", () => {
    const s = createSourceStore();
    s.add("1", [a]);
    s.add("2", [b]);
    s.remove("1");
    s.add("1", [a]);
    expect(nums(s)).toEqual(["1:MCC profile A", "2:MCC profile B"]);
  });

  it("tells subscribers on every change and stops after unsubscribe", () => {
    const s = createSourceStore();
    let calls = 0;
    const off = s.subscribe(() => calls++);
    s.add("1", [a]);
    s.remove("1");
    off();
    s.add("2", [b]);
    expect(calls).toBe(2);
  });
});

describe("numberRuns", () => {
  it("joins three or more consecutive numbers, keeps pairs and singles apart, sorts and dedupes", () => {
    expect(numberRuns([9, 1, 4, 5, 6, 7, 11, 12, 4])).toEqual([[1, 1], [4, 7], [9, 9], [11, 11], [12, 12]]);
    expect(numberRuns([])).toEqual([]);
  });
});

describe("SourceRefs outside a page", () => {
  it("falls back to plain links where it is cited, round links included", () => {
    const html = renderToStaticMarkup(createElement(SourceRefs, { docs: [a, { key: "y", name: "MCC results 2025", links: [{ label: "R1", url: "https://mcc.example/r1" }] }] }));
    expect(html).toContain('href="https://mcc.example/a"');
    expect(html).toContain('href="https://mcc.example/r1"');
    expect(html).toContain("MCC results 2025");
  });

  it("inside a page, before hydration (no numbers yet), still links each document", () => {
    const html = renderToStaticMarkup(createElement(PageSources, null, createElement(SourceRef, { doc: a }), createElement(SourceRefs, { docs: [b] })));
    expect(html).toContain('href="https://mcc.example/a"');
    expect(html).toContain('href="https://mcc.example/b"');
    expect(html).not.toContain("#source-");
  });
});
