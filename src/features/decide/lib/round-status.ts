import type { Round, RoundStepInfo, RoundStepName, StepStatus } from "../types";

// Where MCC counselling stands: each step's status comes from MCC notices (RoundStep, as of `asOf`) and moves on only
// when today passes a date printed in MCC's schedule notice. Nothing is guessed.

export const roundName: Record<Round, string> = { R1: "Round 1", R2: "Round 2", R3: "Round 3", stray: "Stray vacancy round", special_stray: "Special stray round" };
export const stepName: Record<RoundStepName, string> = { seat_matrix: "Seat matrix", choice_filling: "Choice filling", provisional_result: "Provisional result", final_result: "Final result" };
export const statusBadge: Record<StepStatus, { text: string; tone: "neutral" | "success" | "warning" | "info" }> = {
  done: { text: "Done", tone: "neutral" },
  open: { text: "Open now", tone: "success" },
  suspended: { text: "Suspended", tone: "warning" },
  upcoming: { text: "Upcoming", tone: "info" },
  unknown: { text: "Not confirmed", tone: "warning" },
};

/** A schedule value as printed: an IST date-time, or a bare date (its start, or with `end` its last second, in IST). */
export const instant = (v: string, end = false) => new Date(v.length === 10 ? `${v}T${end ? "23:59:59" : "00:00:00"}+05:30` : v);
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", ...o });
const day = fmt({}), dayYear = fmt({ year: "numeric" }), time = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** "15 Nov 23:55 IST" for a date-time, "16 Nov" (or "16 Nov 2026") for a bare date. */
export const fmtIST = (v: string, withYear = false) => (v.length === 10 ? (withYear ? dayYear : day).format(instant(v)) : `${time.format(new Date(v)).replace(",", "")} IST`);
/** Note text with its ISO date-times written as "13 Nov 14:00 IST". */
export const fmtNote = (note: string) => note.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+05:30/g, (m) => fmtIST(m));

/**
 * Status now: the notice status holds until today passes a date in the schedule notice. Then an open step whose end
 * passed is done ("ended"), an upcoming step whose start passed is open ("started"), and an upcoming step whose last
 * date passed with no notice is unknown ("passed": check MCC).
 */
export function statusNow(s: Pick<RoundStepInfo, "status" | "scheduled">, now: Date): { status: StepStatus; clock: "ended" | "started" | "passed" | null } {
  const { from, to, on } = s.scheduled ?? {};
  const end = to ?? on;
  if (s.status === "open" && end && instant(end, true) < now) return { status: "done", clock: "ended" };
  if (s.status === "upcoming" && end && instant(end, true) < now) return { status: "unknown", clock: "passed" };
  if (s.status === "upcoming" && from && instant(from) <= now) return { status: "open", clock: "started" };
  return { status: s.status, clock: null };
}

export type StepNow = RoundStepInfo & { round: Round; now: StepStatus; clock: ReturnType<typeof statusNow>["clock"] };
export const stepsNow = (rs: { rounds: { round: Round; steps: RoundStepInfo[] }[] }, now: Date): StepNow[] =>
  rs.rounds.flatMap((r) => r.steps.map((s) => { const n = statusNow(s, now); return { ...s, round: r.round, now: n.status, clock: n.clock }; }));

/** Why the clock moved a step on, or null. */
export function clockNote(s: StepNow) {
  const { from, to, on } = s.scheduled ?? {};
  if (s.clock === "ended") return `Closed at ${fmtIST((to ?? on)!)} as scheduled; no later MCC notice is in the data.`;
  if (s.clock === "started") return `Open from ${fmtIST(from!)} as scheduled; no MCC notice in the data confirms it yet.`;
  if (s.clock === "passed") return `Scheduled for ${fmtIST((to ?? on)!)}; no MCC notice about it is in the data yet. Check MCC.`;
  return null;
}

/** An upcoming step's first scheduled date (start of a window, or its one day). */
export const nextDate = (s: StepNow) => (s.now === "upcoming" ? s.scheduled?.from ?? s.scheduled?.on ?? null : null);

/** Banner lines: steps open or suspended now, and the upcoming step with the earliest scheduled date. */
export function currentSteps(steps: StepNow[]) {
  const live = steps.filter((s) => s.now === "open" || s.now === "suspended");
  const next = steps.filter((s) => nextDate(s)).sort((a, b) => +instant(nextDate(a)!) - +instant(nextDate(b)!))[0] ?? null;
  return { live, next };
}

/** The choice filling she fills next: one open or suspended now, else the first upcoming one (rounds in order); null when none. */
export const nextChoiceFilling = (steps: StepNow[]) =>
  steps.find((s) => s.step === "choice_filling" && (s.now === "open" || s.now === "suspended" || s.now === "upcoming")) ?? null;

/** Its dates in a few words: "open until 2 Dec 10:00 IST", "27 Nov – 2 Dec 10:00 IST (tentative)", "on 27 Nov", "suspended now". */
export function fillWindow(s: StepNow) {
  const { from, to, on, tentative } = s.scheduled ?? {};
  const t = tentative ? " (tentative)" : "";
  if (s.now === "suspended") return "suspended now";
  if (s.now === "open") return to ? `open until ${fmtIST(to)}` : "open now";
  if (from && to) return `${fmtIST(from)} – ${fmtIST(to)}${t}`;
  const d = from ?? on;
  return d ? `${from ? "from" : "on"} ${fmtIST(d)}${t}` : "dates not announced";
}
