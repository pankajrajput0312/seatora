import { describe, expect, it } from "vitest";
import { addToList, defaultChoices, duplicateList, markTypedUpTo, move, nameFirstList, otherGroupItems, parseChoices, putFirst, shareText, renameOptionId, renameSaved, toCsv, toMccText, toggleItem, typedPrefix, wholeCourseRange, wholeCourseWords, type ChoiceItem, type RenamedCollege } from "./choices";
import type { ProgrammeTerms } from "../server/terms";

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
    expect(toCsv(s.lists[0]).split("\n")[0]).toBe("Order,Institute,State,PIN,Course,Quota,Latest closing,Deepest closing,Fee,Stipend,Bond period,Bond penalty,Leaving penalty");
    expect(toCsv(s.lists[0]).split("\n")[1]).toBe('1,"Inst x","S","","DNB Anaesthesiology","DNB Quota","","","","","","",""');
    // Each choice's closings and terms when loaded, in the columns' order.
    expect(toCsv(s.lists[0], (id) => (id === "x" ? ["1,234 (2025 R1)", "2,000", "₹1 L/yr", null, "1 year", "₹10 L", "None"] : null)).split("\n")[1]).toBe(
      '1,"Inst x","S","","DNB Anaesthesiology","DNB Quota","1,234 (2025 R1)","2,000","₹1 L/yr","","1 year","₹10 L","None"',
    );
    expect(toCsv(s.lists[0]).split("\n")[2]).toMatch(/,"S","462001","DNB/);
  });
});

describe("Suggest my list into her list", () => {
  const mine = { id: "l", name: "Round 3 · 2026", items: [item("a"), item("b")], typedIds: ["a"] };
  it("adds after her choices, never twice, never moving or removing hers", () => {
    const r = addToList(mine, [item("c"), item("a"), item("d"), item("c")]);
    expect(r.list.items.map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.added).toBe(2);
    expect(r.list.typedIds).toEqual(["a"]);
  });
  it("puts the suggestion first in its order and keeps her other choices after it (her own snapshots kept)", () => {
    const old = { ...item("b"), reachLabel: "hers" };
    const l = putFirst({ ...mine, items: [item("a"), old, item("x")] }, [item("c"), item("b"), item("c")]);
    expect(l.items.map((i) => i.id)).toEqual(["c", "b", "a", "x"]);
    expect(l.items[1].reachLabel).toBe("hers");
  });
  it("CSV with its own columns", () => {
    expect(toCsv(mine, (id) => [id === "a" ? "Dream" : "Safe", "why"], ["Suggested as", "Why"]).split("\n")).toEqual([
      "Order,Institute,State,PIN,Course,Quota,Suggested as,Why",
      '1,"Inst a","S","","DNB Anaesthesiology","DNB Quota","Dream","why"',
      '2,"Inst b","S","","DNB Anaesthesiology","DNB Quota","Safe","why"',
    ]);
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
    // Named for the notice: a choice with its course (and its old name), a compared id by its college.
    expect(r.names).toEqual([`${to.name}, DNB Anaesthesiology (was Inst ${id("OLDA#400001")})`, `${to.name}, DNB Anaesthesiology (was Inst ${id("OLDB#400001")})`, to.name]);
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
    expect(shareText(list, (id) => (id === "x" ? "Fee ₹1.71 L/yr; Bond period 1 year" : null), "https://seatora.test/decide/choices")).toBe(
      "My NEET PG choice list (Round 3 · 2026), in order:\n1. Inst x — DNB Anaesthesiology, DNB Quota. Fee ₹1.71 L/yr; Bond period 1 year\n2. Inst y — DNB Anaesthesiology, DNB Quota\n\nThe list on Seatora: https://seatora.test/decide/choices",
    );
  });
});

describe("otherGroupItems (NEET SS)", () => {
  it("the choices outside her question groups; none without a group", () => {
    const q = (id: string, quota: string) => ({ ...item(id), quota });
    const xs = [q("a", "All India (Medical Group)"), q("b", "Tamil Nadu All India (Medical Group)"), q("c", "All India (Surgical Group)"), q("d", "DNB Quota")];
    expect(otherGroupItems(xs, ["Medical Group"]).map((i) => i.id)).toEqual(["c", "d"]);
    expect(otherGroupItems(xs, [])).toEqual([]);
  });
  it("the share text names the exam", () => {
    expect(shareText({ ...defaultChoices.lists[0], items: [item("a")] }, () => null, "https://x", "NEET SS")).toMatch(/^My NEET SS choice list/);
  });
});

describe("wholeCourseRange (NEET SS / MDS / INI-CET choice lists)", () => {
  const t = (fee: number | null, years = 3, range = false) =>
    ({ durationYears: years, wholeCourseFee: fee, years: [{ year: 1, fee: fee == null ? null : { inr: fee / years, ...(range && { min: 1 }) }, stipend: null }] }) as unknown as ProgrammeTerms;
  it("the cheapest to the dearest published whole-course fee, never a sum; a choice with none is counted apart, never as ₹0", () => {
    expect(wholeCourseRange([t(450000), t(null), t(300000)])).toEqual({ min: 300000, max: 450000, n: 2, missing: 1, upTo: false });
    expect(wholeCourseRange([t(300000, 3, true)]).upTo).toBe(true);
    expect(wholeCourseRange([t(900000, 3, true), t(300000)]).upTo).toBe(true); // the dearest is a maximum
    expect(wholeCourseRange([t(900000), t(300000, 3, true)]).upTo).toBe(false);
    expect(wholeCourseRange([])).toEqual({ min: null, max: null, n: 0, missing: 0, upTo: false });
    expect(wholeCourseWords(t(null))).toBe("not published");
    expect(wholeCourseWords(t(450000))).toBe("₹4,50,000 (3 years)");
  });
});
