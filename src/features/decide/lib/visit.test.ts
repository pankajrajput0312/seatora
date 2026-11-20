import { describe, expect, it } from "vitest";
import type { MccNotice, RoundStepInfo, SeatList, Source } from "../types";
import { besides, noticeKey, visitDiff, visitItems, VISIT_NOTICES } from "./visit";

const notice = (date: string, title: string): MccNotice => ({ title, date, url: `https://mcc.example/${title}.pdf`, authority: "MCC", kind: "notice", year: 2026, round: null });
const step = (s: Partial<RoundStepInfo>): RoundStepInfo => ({ step: "choice_filling", status: "upcoming", date: null, url: null, title: null, note: null, scheduled: null, scheduledBy: null, events: [], ...s });
const list = (key: string, round: "R2" | "R3" = "R2"): SeatList => ({ key, name: key, url: null, year: 2026, round, kind: "clear", publishedAt: "2026-11-13", seats: 100 });
const src = (key: string, provisional = false): Source => ({ key, url: null, year: 2026, round: key.startsWith("R2") ? "R2" : "R1", provisional, name: key });

const R3 = { from: "2026-11-27", to: "2026-12-02T10:00:00+05:30", on: null, tentative: true };
const before = { notices: [notice("2026-11-16", "schedule"), notice("2026-11-13", "r2-seats")], rounds: [{ round: "R3" as const, steps: [step({ scheduled: R3 })] }], lists: [list("R2_clear")], sources: [src("R1_final")] };
const at = new Date("2026-11-19T12:00:00+05:30");

describe("What changed since your last visit (lib/visit.ts)", () => {
  it("nothing on a first visit, nothing when nothing changed", () => {
    const items = visitItems(before, at);
    expect(visitDiff(null, items)).toBeNull();
    expect(visitDiff(undefined, items)).toBeNull();
    expect(visitDiff(items.map((i) => i.k), items)).toEqual([]);
  });
  it("a new notice, a new seat list and a new result each show once, by kind", () => {
    const seen = visitItems(before, at).map((i) => i.k);
    const now = visitItems({ ...before, notices: [notice("2026-11-24", "r3-schedule"), ...before.notices], lists: [list("R3_clear", "R3"), ...before.lists], sources: [...before.sources, src("R2_final")] }, at);
    expect(visitDiff(seen, now)!.map((i) => [i.kind, "title" in i ? i.title : i.kind === "result" || i.kind === "list" ? i.round : ""])).toEqual([
      ["notice", "r3-schedule"],
      ["list", "R3"],
      ["result", "R2"],
    ]);
  });
  it("a step whose status or dates moved is a change; the schedule's clock counts (upcoming → open on its date)", () => {
    const seen = visitItems(before, at).map((i) => i.k);
    const moved = visitItems({ ...before, rounds: [{ round: "R3", steps: [step({ scheduled: { ...R3, from: "2026-11-28" } })] }] }, at);
    expect(visitDiff(seen, moved)!.map((i) => i.kind === "step" && [i.round, i.step, i.now, i.from])).toEqual([["R3", "choice_filling", "upcoming", "2026-11-28"]]);
    const opened = visitDiff(seen, visitItems(before, new Date("2026-11-27T09:00:00+05:30")))!;
    expect(opened.map((i) => i.kind === "step" && i.now)).toEqual(["open"]);
  });
  it("a provisional result replaced by the final one is new; the newest notices only, keyed as Announcements marks them", () => {
    const seen = visitItems({ ...before, sources: [src("R2", true)] }, at).map((i) => i.k);
    expect(visitDiff(seen, visitItems({ ...before, sources: [src("R2")] }, at))!.map((i) => i.kind)).toEqual(["result"]);
    const many = Array.from({ length: VISIT_NOTICES + 5 }, (_, i) => notice(`2026-10-${String(30 - (i % 28)).padStart(2, "0")}`, `n${i}`));
    const items = visitItems({ ...before, notices: many }, at).filter((i) => i.kind === "notice");
    expect(items.length).toBe(VISIT_NOTICES);
    expect(items[0].k).toBe(noticeKey(many[0]));
  });
  it("Home's result card folds what else is new: not its own round's result, any other", () => {
    const seen = visitItems(before, at).map((i) => i.k);
    const fresh = visitDiff(seen, visitItems({ ...before, notices: [notice("2026-11-20", "r2-result"), ...before.notices], sources: [...before.sources, src("R2", true)] }, at))!;
    expect(besides(fresh, { year: 2026, round: "R2" }).map((i) => i.kind)).toEqual(["notice"]);
    expect(besides(fresh, { year: 2026, round: "R3" }).map((i) => i.kind)).toEqual(["notice", "result"]);
  });
});
