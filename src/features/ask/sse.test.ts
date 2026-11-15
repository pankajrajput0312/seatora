import { expect, it } from "vitest";
import { parseSse, sseFrame } from "./sse";

it("frames events and parses complete ones, keeping the unfinished rest", () => {
  const all = sseFrame({ type: "text", text: "Hi\n\nthere" }) + sseFrame({ type: "tool", name: "schedule", label: "Checking…" }) + sseFrame({ type: "done", outcome: "ok" });
  const cut = all.length - 5;
  const a = parseSse(all.slice(0, cut));
  expect(a.events).toEqual([{ type: "text", text: "Hi\n\nthere" }, { type: "tool", name: "schedule", label: "Checking…" }]);
  const b = parseSse(a.rest + all.slice(cut));
  expect(b.events).toEqual([{ type: "done", outcome: "ok" }]);
  expect(b.rest).toBe("");
  expect(parseSse("data: {bad json\n\ndata: 1\n\n").events).toEqual([]);
});
