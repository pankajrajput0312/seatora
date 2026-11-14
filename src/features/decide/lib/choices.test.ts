import { describe, expect, it } from "vitest";
import { defaultChoices, duplicateList, markTypedUpTo, move, parseChoices, toCsv, toMccText, toggleItem, typedPrefix, type ChoiceItem } from "./choices";

const item = (id: string): ChoiceItem => ({ id, institute: `Inst ${id}`, slug: id, state: "S", course: "DNB Anaesthesiology", quota: "DNB Quota", reachLabel: "", closedEveryRound: false });

describe("move", () => {
  it("moves an item and clamps out-of-range targets", () => {
    expect(move(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
    expect(move(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("lists", () => {
  it("toggles items in the active list and duplicates to the next round", () => {
    let s = toggleItem(defaultChoices, item("x"));
    s = toggleItem(s, item("y"));
    expect(s.lists[0].items.map((i) => i.id)).toEqual(["x", "y"]);
    expect(toggleItem(s, item("x")).lists[0].items.map((i) => i.id)).toEqual(["y"]);
    const d = duplicateList(s, "r2-2026");
    expect(d.lists[1].name).toBe("Round 3 · 2026");
    expect(d.activeId).toBe(d.lists[1].id);
  });
  it("exports MCC order text and CSV", () => {
    const s = toggleItem(defaultChoices, item("x"));
    expect(toMccText(s.lists[0])).toBe("1. Inst x — DNB Anaesthesiology — DNB Quota");
    expect(toCsv(s.lists[0]).split("\n")[1]).toBe('1,"Inst x","S","DNB Anaesthesiology","DNB Quota"');
  });
});

describe("typed into MCC follows items, not positions", () => {
  it("keeps marks on the same items after a reorder and reports the broken prefix", () => {
    let s = defaultChoices;
    for (const id of ["a", "b", "c", "d"]) s = toggleItem(s, item(id));
    let l = markTypedUpTo(s.lists[0], 2); // a, b typed
    expect(l.typedIds).toEqual(["a", "b"]);
    l = { ...l, items: move(l.items, 3, 1) }; // d moves to #2: a, d, b, c
    expect(l.items.filter((i) => l.typedIds.includes(i.id)).map((i) => i.id)).toEqual(["a", "b"]);
    expect(typedPrefix(l)).toBe(1); // portal matches only up to #1 now
  });
  it("validates stored data, migrates the legacy count, and survives garbage", () => {
    const legacy = { lists: [{ id: "x", name: "R2", items: [item("a"), item("b")], transcribedUpTo: 1 }], activeId: "x" };
    expect(parseChoices(legacy).lists[0].typedIds).toEqual(["a"]);
    expect(parseChoices({ lists: "nope" })).toEqual(defaultChoices);
    expect(parseChoices(null)).toEqual(defaultChoices);
  });
  it("a swap inside the typed block breaks the match (portal order differs)", () => {
    let s = defaultChoices;
    for (const id of ["a", "b", "c"]) s = toggleItem(s, item(id));
    const l = markTypedUpTo(s.lists[0], 2);
    expect(typedPrefix(l)).toBe(2);
    expect(typedPrefix({ ...l, items: move(l.items, 1, 0) })).toBe(0); // b, a, c while the portal has a, b
  });
  it("keeps the good items and lists when one stored entry is bad", () => {
    const bad = { ...item("z"), state: undefined };
    const raw = { lists: [{ id: "x", name: "R2", items: [item("a"), bad, item("b")] }, { id: "y", name: 3 }, { id: "w", name: "R3", items: [] }], activeId: "w" };
    const p = parseChoices(raw);
    expect(p.lists.map((l) => [l.id, l.items.map((i) => i.id)])).toEqual([["x", ["a", "b"]], ["w", []]]);
    expect(p.activeId).toBe("w");
  });
});
