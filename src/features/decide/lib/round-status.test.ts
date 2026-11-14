import { describe, expect, it } from "vitest";
import type { RoundStepInfo } from "../types";
import { currentSteps, fmtIST, fmtNote, statusNow, stepsNow } from "./round-status";

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
});
