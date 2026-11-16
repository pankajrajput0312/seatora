import { describe, expect, it } from "vitest";
import { defaultChoices, duplicateList, markTypedUpTo, move, nameFirstList, parseChoices, shareText, renameOptionId, renameSaved, toCsv, toMccText, toggleItem, typedPrefix, type ChoiceItem, type RenamedCollege } from "./choices";

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
    const s = toggleItem(toggleItem(defaultChoices, item("x")), item("GANDHIMEDICALCOLLEGEBHOPAL#462001~MD~RADIODIAGNOSIS~All India"));
    expect(toMccText(s.lists[0]).split("\n")).toEqual([
      "1. Inst x, S — DNB Anaesthesiology — DNB Quota",
      "2. Inst GANDHIMEDICALCOLLEGEBHOPAL#462001~MD~RADIODIAGNOSIS~All India, S 462001 — DNB Anaesthesiology — DNB Quota",
    ]);
    expect(toCsv(s.lists[0]).split("\n")[1]).toBe('1,"Inst x","S","","DNB Anaesthesiology","DNB Quota"');
    expect(toCsv(s.lists[0]).split("\n")[2]).toMatch(/,"S","462001","DNB/);
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

describe("retired college keys", () => {
  const to: RenamedCollege = { key: "SEPNEWNAME#400001", slug: "new-name-400001", name: "New Name" };
  const of = (k: string) => (k === "OLDA#400001" || k === "OLDB#400001" ? to : undefined);
  const id = (k: string, sp = "ANAESTHESIOLOGY") => `${k}~DNB~${sp}~DNB Quota`;
  it("renames an option id's college key, nothing else", () => {
    expect(renameOptionId(id("OLDA#400001"), of)).toBe(id("SEPNEWNAME#400001"));
    expect(renameOptionId(id("KEPT#400002"), of)).toBe(id("KEPT#400002"));
  });
  it("moves choices and compare ids to the new key, once each, with the college's link and name", () => {
    const s = { lists: [{ id: "l", name: "L", items: [item(id("OLDA#400001")), item(id("KEPT#400002")), item(id("OLDB#400001"))], typedIds: [id("OLDA#400001"), id("OLDB#400001")] }], activeId: "l" };
    const r = renameSaved(s, [id("OLDB#400001"), id("OLDA#400001", "FAMILYMEDICINE")], of);
    expect(r.choices.lists[0].items.map((i) => [i.id, i.slug, i.institute])).toEqual([[id("SEPNEWNAME#400001"), to.slug, to.name], [id("KEPT#400002"), id("KEPT#400002"), `Inst ${id("KEPT#400002")}`]]);
    expect(r.choices.lists[0].typedIds).toEqual([id("SEPNEWNAME#400001")]);
    expect(r.compare).toEqual([id("SEPNEWNAME#400001"), id("SEPNEWNAME#400001", "FAMILYMEDICINE")]);
    expect(r.renamed).toHaveLength(3);
    expect(renameSaved(r.choices, r.compare, of).renamed).toEqual([]);
  });
});

describe("nameFirstList", () => {
  it("the default first list takes the round's name once; a named list, a clash or the same name: nothing", () => {
    const renamed = nameFirstList(defaultChoices, "Round 3 · 2026")!;
    expect(renamed.lists[0].name).toBe("Round 3 · 2026");
    expect(nameFirstList(renamed, "Round 3 · 2026")).toBeNull();
    expect(nameFirstList(defaultChoices, "Round 2 · 2026")).toBeNull();
    expect(nameFirstList({ ...defaultChoices, lists: [{ ...defaultChoices.lists[0], name: "Mine" }] }, "Round 3 · 2026")).toBeNull();
    const twoLists = { activeId: "r2-2026", lists: [defaultChoices.lists[0], { id: "x", name: "Round 3 · 2026", items: [], typedIds: [] }] };
    expect(nameFirstList(twoLists, "Round 3 · 2026")).toBeNull();
  });
});

describe("shareText", () => {
  it("the list in order with each choice's terms when loaded, then the link", () => {
    const list = { id: "a", name: "Round 3 · 2026", items: [item("x"), item("y")], typedIds: [] };
    expect(shareText(list, (id) => (id === "x" ? "Fee ₹1.71 L/yr; Bond period 1 year" : null), "https://seatora.test")).toBe(
      "My NEET PG choice list (Round 3 · 2026), in order:\n1. Inst x — DNB Anaesthesiology, DNB Quota. Fee ₹1.71 L/yr; Bond period 1 year\n2. Inst y — DNB Anaesthesiology, DNB Quota\n\nMade with Seatora: https://seatora.test",
    );
  });
});
