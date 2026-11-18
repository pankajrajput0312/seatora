import { describe, expect, it } from "vitest";
import { examPart, fingerprint, hasChoices, mergeChoices, reconcile, withExamPart } from "./account-sync";
import { defaultChoices, toggleItem, type ChoiceItem, type ChoicesState } from "./choices";

const item = (id: string): ChoiceItem => ({ id, institute: id, slug: id, state: null, course: "MD X", quota: "All India", reachLabel: "", closedEveryRound: false });
const withItems = (...ids: string[]) => ids.reduce((s, id) => toggleItem(s, item(id)), defaultChoices);
const ids = (s: ChoicesState | null) => s?.lists.map((l) => `${l.id}:${l.items.map((i) => i.id).join(",")}`);

describe("mergeChoices", () => {
  it("keeps the newer order and appends the older one's choices and lists", () => {
    const older: ChoicesState = { ...withItems("a", "b", "c"), lists: [...withItems("a", "b", "c").lists, { id: "r3", name: "R3", items: [item("z")], typedIds: [] }] };
    expect(ids(mergeChoices(withItems("b", "x"), older))).toEqual(["r2-2026:b,x,a,c", "r3:z"]);
  });
});

describe("reconcile", () => {
  const merge = mergeChoices;
  const a = withItems("a");
  const b = withItems("b");
  it("uploads local data when the account has none, and takes the server copy when nothing is here", () => {
    expect(reconcile({ local: a, dirty: true, localAt: 0, seen: null, server: null }, merge)).toEqual({ value: a, upload: true });
    expect(reconcile({ local: null, dirty: false, localAt: 0, seen: null, server: { value: b, at: 5 } }, merge)).toEqual({ value: b, upload: false });
  });
  it("uploads a local change when the server copy is the one last seen; takes a newer server copy when nothing changed here", () => {
    expect(reconcile({ local: a, dirty: true, localAt: 9, seen: 5, server: { value: b, at: 5 } }, merge)).toEqual({ value: a, upload: true });
    expect(reconcile({ local: a, dirty: false, localAt: 9, seen: 5, server: { value: b, at: 7 } }, merge)).toEqual({ value: b, upload: false });
  });
  it("both changed: the newer wins and no choice is lost (a first sync with an unknown local time prefers the server)", () => {
    expect(ids(reconcile({ local: a, dirty: true, localAt: 9, seen: 5, server: { value: b, at: 7 } }, merge).value)).toEqual(["r2-2026:a,b"]);
    expect(ids(reconcile({ local: a, dirty: true, localAt: 0, seen: null, server: { value: b, at: 7 } }, merge).value)).toEqual(["r2-2026:b,a"]);
  });
});

it("hasChoices and fingerprint", () => {
  expect(hasChoices(defaultChoices)).toBe(false);
  expect(hasChoices(withItems("a"))).toBe(true);
  expect(fingerprint(withItems("a"))).toBe(fingerprint(withItems("a")));
  expect(fingerprint(withItems("a"))).not.toBe(fingerprint(withItems("b")));
});

describe("exam parts of the account's json (NEET PG's format unchanged)", () => {
  const pg = { rank: 42284, category: "OBC" };
  it("NEET PG reads and writes the top level exactly as before when no other exam is saved", () => {
    expect(examPart(pg, "neet-pg")).toBe(pg);
    expect(JSON.stringify(withExamPart(null, "neet-pg", pg))).toBe(JSON.stringify(pg));
    expect(JSON.stringify(withExamPart(pg, "neet-pg", { ...pg, rank: 1 }))).toBe(JSON.stringify({ ...pg, rank: 1 }));
  });
  it("another exam lives under its key; each exam's write keeps the others", () => {
    const mds = { rank: 900, category: "Open" };
    const both = withExamPart(pg, "neet-mds", mds);
    expect(both).toEqual({ ...pg, "neet-mds": mds });
    expect(examPart(both, "neet-pg")).toEqual(pg);
    expect(examPart(both, "neet-mds")).toEqual(mds);
    expect(examPart(both, "neet-ss")).toBeNull();
    expect(withExamPart(both, "neet-pg", { rank: 5 })).toEqual({ rank: 5, "neet-mds": mds });
    expect(examPart({ "neet-ss": { rank: 3 } }, "neet-pg")).toEqual({});
  });
});
