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

/** A step's badge: MCC suspends choice filling but holds a result (17 Nov 2026: the Round 2 result, by court order). */
export const badgeOf = (s: { step: RoundStepName; now: StepStatus }) =>
  s.now === "suspended" && s.step.endsWith("_result") ? { text: "On hold", tone: statusBadge.suspended.tone } : statusBadge[s.now];

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

/** True when an upcoming step's first scheduled date (nextDate) is today in IST: Home says "Today" for it, not "Next". */
export const dueToday = (s: StepNow, now: Date) => nextDate(s)?.slice(0, 10) === new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** Home's next-step card: the choice filling open now, else the next one MCC has scheduled (earliest first date); null for none. */
export const nextFilling = (steps: StepNow[]) =>
  steps.find((s) => s.step === "choice_filling" && s.now === "open") ??
  steps.filter((s) => s.step === "choice_filling" && nextDate(s)).sort((a, b) => +instant(nextDate(a)!) - +instant(nextDate(b)!))[0] ??
  null;

/** Nothing of the year's counselling announced yet: every step upcoming, with no notice and no date (NEET SS 2026 on 19 Nov 2026). */
export const notStarted = (steps: StepNow[]) => steps.length > 0 && steps.every((s) => s.now === "upcoming" && !s.url && !s.scheduled);

/**
 * The longest note that two or more of a round's notes hold ("not announced: no seat-allocation schedule… (Part A: …)",
 * or a hold's reason): said once for the round, not on each step (shortNote). Null when none is shared.
 */
export const sharedNote = (notes: (string | null | undefined)[]) =>
  notes.filter((n): n is string => !!n).sort((a, b) => b.length - a.length).find((c) => notes.filter((n) => n?.includes(c)).length > 1) ?? null;
/**
 * A step's note with the round's shared note (said above it) cut to its head: "not announced. Mock round choice filling
 * first: not announced."; null when nothing else is left (the step's note was just that).
 */
export function shortNote(note: string | null | undefined, shared: string | null) {
  if (!note || !shared || !note.includes(shared)) return note ?? null;
  const head = shared.includes(": ") ? `${shared.split(": ")[0]}${/[.!?]["”')]*$/.test(shared) ? "." : ""}` : "";
  const left = note.split(shared).join(head).replace(/\s+/g, " ").trim();
  return left === head.trim() ? null : left || null;
}

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

/** The cookie the alert strip's ✕ sets: the closed notice's id, so it stays closed until MCC posts another. */
export const NOTICE_CLOSED_COOKIE = "seatora_notice_closed";

/**
 * Home's alert strip: the first step MCC has held or suspended (a result "on hold", choice filling "suspended"), with its
 * notice; both of a round's results held by one notice say "Round 2 result". Null when nothing is held.
 */
export function alertOf(steps: StepNow[]) {
  const s = steps.find((x) => x.now === "suspended" && x.url);
  if (!s) return null;
  const both = s.step.endsWith("_result") && steps.some((o) => o !== s && o.round === s.round && o.now === "suspended" && o.step.endsWith("_result") && o.url === s.url);
  return { id: s.url!.split("/").pop()!, url: s.url!, text: `${roundName[s.round]} ${both ? "result" : stepName[s.step].toLowerCase()} ${badgeOf(s).text.toLowerCase()}` };
}

/** A note's sentences ("…clarification. AIQ and State Schedule PG 2026 (16 Nov): …"), a "No. 10" never split. */
const sentences = (note: string) => note.split(/(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
const JOINING = /last date of joining\s+(\d{1,2} [A-Z][a-z]{2}(?: \d{4})?)/i;
const isJoining = (s: string) => JOINING.test(s) || /^Tentative:/.test(s);

/**
 * A round's joining words from its steps' notes (MCC's "AIQ and State Schedule", as round_status.json gives them on the
 * final result): the last date of joining, its window and caveat sentences ("Tentative: …"), and the step they are on.
 * Null when no note of the round names a last date of joining.
 */
export function joiningOf(steps: Pick<StepNow, "note" | "step" | "url" | "title" | "scheduledBy">[]) {
  const s = steps.find((x) => x.note && JOINING.test(x.note));
  if (!s) return null;
  const said = sentences(s.note!).filter(isJoining);
  return { by: JOINING.exec(s.note!)![1], tentative: said.some((x) => /^Tentative:/.test(x)), said, step: s };
}

/** A note with its joining sentences taken out (said once under the round, joiningOf); null when nothing is left. */
export const withoutJoining = (note: string | null) => (note ? sentences(note).filter((x) => !isJoining(x)).join(" ") || null : null);
