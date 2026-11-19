import { describe, expect, it } from "vitest";
import type { RoundStepInfo } from "../types";
import { alertOf, badgeOf, currentSteps, dueToday, fillWindow, fmtIST, fmtNote, nextChoiceFilling, nextFilling, joiningOf, notStarted, sharedNote, shortNote, statusNow, stepsNow, withoutJoining, type StepNow } from "./round-status";

// 2026 R2 as round_status.json gives it (as of 14 Nov 2026 17:27 IST).
const choice = { status: "open", scheduled: { from: "2026-11-10T13:00:00+05:30", to: "2026-11-15T23:55:00+05:30", on: null, tentative: false } } as const;
const result = { status: "upcoming", scheduled: { from: null, to: null, on: "2026-11-16", tentative: false } } as const;
const r3 = { status: "upcoming", scheduled: { from: "2026-11-27", to: "2026-12-02T10:00:00+05:30", on: null, tentative: true } } as const;
const at = (s: string) => new Date(s);

describe("statusNow: notice status, moved on only by the printed schedule", () => {
  it("keeps the notice status before any printed date passes", () => {
    expect(statusNow(choice, at("2026-11-14T17:27:28+05:30"))).toEqual({ status: "open", clock: null });
    expect(statusNow(result, at("2026-11-16T22:00:00+05:30"))).toEqual({ status: "upcoming", clock: null }); // its day, still ahead
    expect(statusNow(r3, at("2026-11-26T23:59:00+05:30"))).toEqual({ status: "upcoming", clock: null });
    expect(statusNow({ status: "done", scheduled: null }, at("2030-01-01"))).toEqual({ status: "done", clock: null });
  });
  it("closes an open step at its scheduled end (IST), to the minute", () => {
    expect(statusNow(choice, at("2026-11-15T23:54:00+05:30")).status).toBe("open");
    expect(statusNow(choice, at("2026-11-15T23:56:00+05:30"))).toEqual({ status: "done", clock: "ended" });
  });
  it("opens an upcoming window at its start, and never marks a missed date done", () => {
    expect(statusNow(r3, at("2026-11-27T00:00:00+05:30"))).toEqual({ status: "open", clock: "started" });
    expect(statusNow(r3, at("2026-12-02T10:01:00+05:30"))).toEqual({ status: "unknown", clock: "passed" });
    expect(statusNow(result, at("2026-11-17T00:00:01+05:30"))).toEqual({ status: "unknown", clock: "passed" });
  });
  it("leaves steps without dates alone", () => {
    expect(statusNow({ status: "upcoming", scheduled: null }, at("2030-01-01"))).toEqual({ status: "upcoming", clock: null });
  });
});

it("formats in IST whatever the server's time zone", () => {
  expect(fmtIST("2026-11-15T23:55:00+05:30")).toBe("15 Nov 23:55 IST");
  expect(fmtIST("2026-11-14T11:57:28.000Z")).toBe("14 Nov 17:27 IST");
  expect(fmtIST("2026-11-16")).toBe("16 Nov");
  expect(fmtIST("2026-11-16", true)).toBe("16 Nov 2026");
  expect(fmtNote("suspended until 2026-11-13T14:00:00+05:30 only")).toBe("suspended until 13 Nov 14:00 IST only");
});

it("banner: open steps now, then the earliest upcoming date", () => {
  const step = (step: RoundStepInfo["step"], s: Pick<RoundStepInfo, "status" | "scheduled">): RoundStepInfo => ({ step, date: null, url: null, title: null, note: null, scheduledBy: null, events: [], ...s });
  const rs = { rounds: [
    { round: "R2" as const, steps: [step("choice_filling", choice), step("provisional_result", result)] },
    { round: "R3" as const, steps: [step("choice_filling", r3)] },
  ] };
  const pick = (now: string) => {
    const { live, next } = currentSteps(stepsNow(rs, at(now)));
    return { live: live.map((s) => `${s.round} ${s.step}`), next: next && `${next.round} ${next.step}` };
  };
  expect(pick("2026-11-14T17:27:28+05:30")).toEqual({ live: ["R2 choice_filling"], next: "R2 provisional_result" });
  expect(pick("2026-11-16T09:00:00+05:30")).toEqual({ live: [], next: "R2 provisional_result" });
  expect(pick("2026-11-17T09:00:00+05:30")).toEqual({ live: [], next: "R3 choice_filling" });
  expect(pick("2026-11-28T09:00:00+05:30")).toEqual({ live: ["R3 choice_filling"], next: null });

  // Choices names her list after the choice filling she fills next.
  const fill = (now: string) => {
    const s = nextChoiceFilling(stepsNow(rs, at(now)));
    return s && `${s.round}: ${fillWindow(s)}`;
  };
  expect(fill("2026-11-14T17:27:28+05:30")).toBe("R2: open until 15 Nov 23:55 IST");
  expect(fill("2026-11-16T09:00:00+05:30")).toBe("R3: 27 Nov – 2 Dec 10:00 IST (tentative)");
  expect(fill("2026-11-28T09:00:00+05:30")).toBe("R3: open until 2 Dec 10:00 IST");
  expect(fill("2026-12-03T09:00:00+05:30")).toBeNull();
  // Home's "Today": the next step when its first date is today in IST (05:00 IST on the 16th is still the 15th in UTC).
  const today = (now: string) => { const { next } = currentSteps(stepsNow(rs, at(now))); return !!next && dueToday(next, at(now)); };
  expect([today("2026-11-15T23:00:00+05:30"), today("2026-11-16T05:00:00+05:30"), today("2026-11-16T23:59:00+05:30"), today("2026-11-26T09:00:00+05:30")]).toEqual([false, true, true, false]);
  // The next-step card's round: R2 filling while open, then R3's once R2 closed, never a closed one.
  const filling = (now: string) => { const s = nextFilling(stepsNow(rs, at(now))); return s && `${s.round} ${s.now}`; };
  expect([filling("2026-11-14T17:27:28+05:30"), filling("2026-11-16T09:00:00+05:30"), filling("2026-11-28T09:00:00+05:30"), filling("2026-12-03T09:00:00+05:30")]).toEqual(["R2 open", "R3 upcoming", "R3 open", null]);
});

describe("badgeOf", () => {
  it("a held result is On hold; suspended choice filling stays Suspended", () => {
    expect(badgeOf({ step: "final_result", now: "suspended" }).text).toBe("On hold");
    expect(badgeOf({ step: "choice_filling", now: "suspended" }).text).toBe("Suspended");
    expect(badgeOf({ step: "final_result", now: "upcoming" }).text).toBe("Upcoming");
  });
});

describe("alertOf", () => {
  const held = (step: RoundStepInfo["step"], url = "https://x/202611171047091852.pdf"): RoundStepInfo =>
    ({ step, status: "suspended", date: "2026-11-17", url, title: "Notice for result of Round-2", note: null, scheduled: null, scheduledBy: null, events: [] });
  const r2 = (...steps: RoundStepInfo[]) => stepsNow({ rounds: [{ round: "R2", steps }] }, new Date("2026-11-17T20:00:00+05:30"));
  it("one strip for a round's held results, a suspended step by name, nothing when none is held", () => {
    expect(alertOf(r2(held("provisional_result"), held("final_result")))).toEqual({ id: "202611171047091852.pdf", url: "https://x/202611171047091852.pdf", text: "Round 2 result on hold" });
    expect(alertOf(r2(held("choice_filling", "https://x/n9.pdf")))?.text).toBe("Round 2 choice filling suspended");
    expect(alertOf(r2({ ...held("final_result"), status: "upcoming" }))).toBeNull();
  });
});

describe("a counselling not announced yet (NEET SS 2026, INI-CET January 2027)", () => {
  const up = (note?: string) => ({ step: "seat_matrix", round: "R1", now: "upcoming", clock: null, status: "upcoming", date: null, url: null, title: null, note: note ?? null, scheduled: null, scheduledBy: null, events: [] }) as unknown as StepNow;
  it("not started: every step upcoming with no notice and no date", () => {
    expect(notStarted([up(), up()])).toBe(true);
    expect(notStarted([up(), { ...up(), url: "https://mcc.nic.in/x.pdf" }])).toBe(false);
    expect(notStarted([up(), { ...up(), scheduled: { from: "2027-01-02", to: null, on: null, tentative: true } }])).toBe(false);
    expect(notStarted([up(), { ...up(), now: "done" }])).toBe(false);
    expect(notStarted([])).toBe(false);
  });
  it("a note two steps of a round share is said once for the round, each step keeping only its own words", () => {
    const na = 'not announced: no seat-allocation schedule (Part A: "Will be notified separately").';
    const notes = [`${na} Mock round choice filling first: ${na}`, `Mock round (preview of the 1st round, no seat allotted): ${na}`, na, null];
    expect(sharedNote(notes)).toBe(na);
    expect(notes.map((n) => shortNote(n, na))).toEqual(["not announced. Mock round choice filling first: not announced.", "Mock round (preview of the 1st round, no seat allotted): not announced.", null, null]);
    expect(sharedNote([na, "final seat position applies from round 1", null])).toBeNull();
    // A hold's reason, with no "head": the step that only had it says nothing more.
    const held = "held under a Madras High Court interim order (WP No. 46350 of 2026) of 17 Nov; MCC will declare it after the court's clarification.";
    expect([sharedNote([held, held]), shortNote(held, held)]).toEqual([held, null]);
  });
});

describe("a round's last date of joining, from its final result's note (MCC's AIQ and State Schedule)", () => {
  const r2 = "held under a Madras High Court interim order (WP No. 46350 of 2026) of 17 Nov; MCC will declare it after the court's clarification. AIQ and State Schedule PG 2026 (16 Nov): Round 2 from 6 Nov to 14 Nov, last date of joining 24 Nov. Tentative: MCC put the Round 2 result on hold (Notice No. 10, 17 Nov); later dates may move";
  const steps = [{ step: "provisional_result", note: "held under …" }, { step: "final_result", note: r2 }] as unknown as StepNow[];
  it("finds the date, its sentences and the step; the step's own note keeps the rest", () => {
    const j = joiningOf(steps)!;
    expect([j.by, j.tentative, j.step.step]).toEqual(["24 Nov", true, "final_result"]);
    expect(j.said).toEqual(["AIQ and State Schedule PG 2026 (16 Nov): Round 2 from 6 Nov to 14 Nov, last date of joining 24 Nov.", "Tentative: MCC put the Round 2 result on hold (Notice No. 10, 17 Nov); later dates may move"]);
    expect(withoutJoining(r2)).toBe("held under a Madras High Court interim order (WP No. 46350 of 2026) of 17 Nov; MCC will declare it after the court's clarification.");
    expect(withoutJoining("AIQ and State Schedule PG 2026 (16 Nov): Round 1 from 12 Oct to 24 Oct, last date of joining 2 Nov")).toBeNull();
    expect(joiningOf([{ step: "final_result", note: "suspended" }] as unknown as StepNow[])).toBeNull();
  });
});
