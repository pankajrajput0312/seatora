import { cookies } from "next/headers";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { activeExam, examInfo } from "@/features/exams/active";
import { authorityOf, DEFAULT_EXAM, exams, yearName, type ExamKey } from "@/features/exams/registry";
import { decideLinks } from "../lib/links";
import { alertOf, badgeOf, currentSteps, NOTICE_CLOSED_COOKIE, dueToday, fmtIST, fmtNote, nextDate, notStarted, roundName, stepName, stepsNow, type StepNow } from "../lib/round-status";
import { listNotices, roundStatus, scheduleYear } from "../server/notices";
import { InfoTip } from "./info-tip";
import { NoticeStrip } from "./notice-strip";
import { MCC_PG } from "./pages/mcc-link";
import { smallLink } from "./ui";

/**
 * A step's MCC notice (for an upcoming step, the schedule notice), or the schedule behind its dates (`s.scheduledBy`),
 * opening in a new tab; without `children` its title.
 */
export function NoticeLink({ s, children, by = "MCC" }: { s: Pick<StepNow, "url" | "title">; children?: React.ReactNode; by?: string }) {
  if (!s.url) return null;
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>
      {children ?? s.title ?? `${by} notice`}<span className="sr-only">{children && s.title && `: ${s.title}`} (opens in a new tab)</span>
    </a>
  );
}

/** The exam's counselling site (NEET PG: MCC's PG counselling site; NEET SS, MDS: MCC's page for it; INI-CET: AIIMS's exams site). */
export const siteLink = (exam: ExamKey, className = `${smallLink} text-sky`) => {
  const s = exams[exam].site ?? { url: MCC_PG, name: "MCC PG counselling site" };
  return <a href={s.url} target="_blank" rel="noopener noreferrer" className={className}>{s.name}<span className="sr-only"> (opens in a new tab)</span></a>;
};

/**
 * The newest notice in the data, linked, with the counselling it is about and its date: what Home and Schedule say while
 * no step of the year is announced (NEET SS 2026: the SS 2025 counselling's last notice). Nothing without notices.
 */
export async function LatestNotice({ exam, by }: { exam: ExamKey; by: string }) {
  const n = (await listNotices({}, exam))[0];
  if (!n) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      <span className="text-muted-foreground">
        Latest {by} notice ({exam === DEFAULT_EXAM ? "PG" : exams[exam].label} {yearName(exam, n.year)} counselling, <time dateTime={n.date} className="numeric">{fmtIST(n.date, true)}</time>):
      </span>
      {n.url ? <NoticeLink s={n} /> : <span>{n.title}</span>}
    </p>
  );
}

/**
 * Home's status strip, merged with the schedule: "Today:" what MCC has open (or what its schedule puts on today's date),
 * then "Next:" the next scheduled step, each with its MCC notice or schedule as a plain link (no numbered footnote), and
 * "Full schedule" (at that round). No round status in the data: says so and points to MCC, never a made-up date.
 */
export async function RoundStatusBanner({ params }: { params: URLSearchParams }) {
  const exam = await activeExam();
  // Another exam: once its data has a round status or notices (examInfo).
  if (!(await examInfo(exam)).has.notices) return null;
  // NEET PG: LATEST_YEAR, as ever; INI-CET: the session its round status follows (January 2027).
  const year = await scheduleYear(exam);
  const rs = year == null ? null : await roundStatus(year, exam);
  const by = authorityOf(exam); // MCC; INI-CET: AIIMS
  const rn = (r: keyof typeof roundName) => exams[exam].roundWords?.[r] ?? roundName[r]; // INI-CET's R3: "Open Round"
  const now = new Date();
  const all = rs ? stepsNow(rs, now) : [];
  // No round status, or one with nothing announced yet (NEET SS 2026): say which, and the newest notice in the data.
  if (!rs || notStarted(all)) {
    const named = `${exam === DEFAULT_EXAM ? "PG" : exams[exam].label} ${yearName(exam, year ?? exams[exam].latestYear)}`;
    return (
      <section aria-label={`${by} counselling ${named} today`} className="grid gap-1 rounded-xl border border-border bg-card px-4 py-3 text-body">
        <p className="flex flex-wrap items-center gap-x-2">
          {rs ? <><span className="font-semibold">Today:</span><strong className="font-semibold">{named} counselling hasn&apos;t started</strong><span className="text-muted-foreground">no {by} notice for it yet</span></> : <span>No {by} round status for {named} is in the data, so no dates are shown.</span>}
        </p>
        <LatestNotice exam={exam} by={by} />
        <p className="flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground">
          <Link href={decideLinks(params).to("/decide/counselling")} className={`${smallLink} text-sky`}>Full schedule</Link>
          {siteLink(exam)}
        </p>
      </section>
    );
  }
  const { live, next } = currentSteps(all);
  const today = next && dueToday(next, now) ? next : null;
  // "Full schedule" opens at the round of the step on today (or next), not at the finished Round 1 the page starts with.
  const at = (live[0] ?? next)?.round;
  const full = <Link href={`${decideLinks(params).to("/decide/counselling")}${at ? `#round-${at}` : ""}`} className={`${smallLink} text-sky`}>Full schedule</Link>;
  const datesNote = `Dates are as ${by} printed them; tentative ones may change.${live.some((s) => s.clock === "started") ? ` "Not yet confirmed by ${by}": the step started as scheduled, and no ${by} notice confirms it yet.` : ""}`;
  const label = <span className="font-semibold">Today:</span>;
  // One notice holding both of a round's results: one line, "Round 2 result".
  const bothHeld = (s: StepNow) => s.now === "suspended" && s.step.endsWith("_result") && live.some((o) => o !== s && o.round === s.round && o.now === "suspended" && o.step.endsWith("_result") && o.url === s.url);
  const shown = live.filter((s) => !(bothHeld(s) && s.step === "final_result"));
  return (
    <section aria-label={`${by} counselling ${yearName(exam, rs.year)} today`} className="grid gap-1 rounded-xl border border-border bg-card px-4 py-3 text-body">
      {shown.map((s) => (
        <p key={s.round + s.step} className="flex flex-wrap items-center gap-x-2">
          {label}
          {/* The deadline is the strip's first fact. */}
          <strong className="font-semibold">
            {rn(s.round)} {bothHeld(s) ? "result" : stepName[s.step].toLowerCase()}{s.now !== "suspended" && s.scheduled?.to && <>, open until <span className="numeric">{fmtIST(s.scheduled.to)}</span></>}
          </strong>
          {s.now === "suspended" && <Badge tone={badgeOf(s).tone}>{badgeOf(s).text}</Badge>}
          {s.clock === "started" && <span className="text-muted-foreground">not yet confirmed by {by}</span>}
          {/* The notice's own status line, e.g. a suspension that has since lifted ("suspended until …, then resumed"). */}
          {s.note && <span className="text-muted-foreground">{fmtNote(s.note)}</span>}
          <NoticeLink s={s}>{by} notice</NoticeLink>
          {/* The end date's own source when the status cites a later notice (e.g. a suspension) that doesn't print it. */}
          {s.now !== "suspended" && s.scheduled?.to && s.scheduledBy && s.scheduledBy.url !== s.url && <NoticeLink s={s.scheduledBy}>{by} schedule</NoticeLink>}
        </p>
      ))}
      {today && (
        <p className="flex flex-wrap items-center gap-x-2">
          {label}
          <strong className="font-semibold">{rn(today.round)} {stepName[today.step].toLowerCase()}</strong>
          <span className="text-muted-foreground">scheduled for today{today.scheduled?.tentative && " (tentative)"}</span>
          <NoticeLink s={today.scheduledBy ?? today}>{by} notice</NoticeLink>
        </p>
      )}
      {!live.length && !today && <p>{label} no {by} counselling step is open.</p>}
      {next && !today && (
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="text-muted-foreground">Next:</span>
          <span>
            {rn(next.round)} {stepName[next.step].toLowerCase()} {next.scheduled?.from ? "from" : "on"} <span className="numeric">{fmtIST(nextDate(next)!)}</span>
            {next.scheduled?.tentative && " (tentative)"}
          </span>
          <NoticeLink s={next.scheduledBy ?? next}>{by} schedule</NoticeLink>
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-1 text-caption text-muted-foreground">
        {full}
        <InfoTip label="round status">
          From {by} notices as of <span className="numeric">{fmtIST(rs.asOf)}</span>. {datesNote}
        </InfoTip>
      </p>
    </section>
  );
}

/** Home's top strip while MCC holds a step (alertOf: "Round 2 result on hold"), unless she closed this notice's strip. */
export async function HeldStrip() {
  const exam = await activeExam();
  if (!(await examInfo(exam)).has.notices) return null;
  const year = await scheduleYear(exam);
  const rs = year == null ? null : await roundStatus(year, exam);
  const a = rs && alertOf(stepsNow(rs, new Date()));
  if (!a || decodeURIComponent((await cookies()).get(NOTICE_CLOSED_COOKIE)?.value ?? "") === a.id) return null;
  return <NoticeStrip id={a.id} text={a.text} href={a.url} />;
}
