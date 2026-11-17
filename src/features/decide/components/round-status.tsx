import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { decideLinks } from "../lib/links";
import { LATEST_YEAR } from "../lib/reach";
import { badgeOf, currentSteps, dueToday, fmtIST, fmtNote, nextDate, roundName, stepName, stepsNow, type StepNow } from "../lib/round-status";
import { roundStatus } from "../server/notices";
import { InfoTip } from "./info-tip";
import { MCC_PG } from "./pages/mcc-link";
import { smallLink } from "./ui";

/**
 * A step's MCC notice (for an upcoming step, the schedule notice), or the schedule behind its dates (`s.scheduledBy`),
 * opening in a new tab; without `children` its title.
 */
export function NoticeLink({ s, children }: { s: Pick<StepNow, "url" | "title">; children?: React.ReactNode }) {
  if (!s.url) return null;
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>
      {children ?? s.title ?? "MCC notice"}<span className="sr-only">{children && s.title && `: ${s.title}`} (opens in a new tab)</span>
    </a>
  );
}

const mccSite = (
  <a href={MCC_PG} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>MCC PG counselling site<span className="sr-only"> (opens in a new tab)</span></a>
);

/**
 * Home's status strip, merged with the schedule: "Today:" what MCC has open (or what its schedule puts on today's date),
 * then "Next:" the next scheduled step, each with its MCC notice or schedule as a plain link (no numbered footnote), and
 * "Full schedule" (at that round). No round status in the data: says so and points to MCC, never a made-up date.
 */
export async function RoundStatusBanner({ params }: { params: URLSearchParams }) {
  const rs = await roundStatus(LATEST_YEAR);
  if (!rs)
    return (
      <section aria-label={`MCC counselling ${LATEST_YEAR} today`} className="rounded-xl border border-border bg-card px-4 py-3 text-body">
        <p className="flex flex-wrap items-center gap-x-2">
          <span>No MCC round status for {LATEST_YEAR} is in the data, so no dates are shown. Check the</span>
          {mccSite}
        </p>
      </section>
    );
  const now = new Date();
  const { live, next } = currentSteps(stepsNow(rs, now));
  const today = next && dueToday(next, now) ? next : null;
  // "Full schedule" opens at the round of the step on today (or next), not at the finished Round 1 the page starts with.
  const at = (live[0] ?? next)?.round;
  const full = <Link href={`${decideLinks(params).to("/decide/counselling")}${at ? `#round-${at}` : ""}`} className={`${smallLink} text-sky`}>Full schedule</Link>;
  const datesNote = `Dates are as MCC printed them; tentative ones may change.${live.some((s) => s.clock === "started") ? " \"Not yet confirmed by MCC\": the step started as scheduled, and no MCC notice confirms it yet." : ""}`;
  const label = <span className="font-semibold">Today:</span>;
  // One notice holding both of a round's results: one line, "Round 2 result".
  const bothHeld = (s: StepNow) => s.now === "suspended" && s.step.endsWith("_result") && live.some((o) => o !== s && o.round === s.round && o.now === "suspended" && o.step.endsWith("_result") && o.url === s.url);
  const shown = live.filter((s) => !(bothHeld(s) && s.step === "final_result"));
  return (
    <section aria-label={`MCC counselling ${rs.year} today`} className="grid gap-1 rounded-xl border border-border bg-card px-4 py-3 text-body">
      {shown.map((s) => (
        <p key={s.round + s.step} className="flex flex-wrap items-center gap-x-2">
          {label}
          {/* The deadline is the strip's first fact. */}
          <strong className="font-semibold">
            {roundName[s.round]} {bothHeld(s) ? "result" : stepName[s.step].toLowerCase()}{s.now !== "suspended" && s.scheduled?.to && <>, open until <span className="numeric">{fmtIST(s.scheduled.to)}</span></>}
          </strong>
          {s.now === "suspended" && <Badge tone={badgeOf(s).tone}>{badgeOf(s).text}</Badge>}
          {s.clock === "started" && <span className="text-muted-foreground">not yet confirmed by MCC</span>}
          {/* The notice's own status line, e.g. a suspension that has since lifted ("suspended until …, then resumed"). */}
          {s.note && <span className="text-muted-foreground">{fmtNote(s.note)}</span>}
          <NoticeLink s={s}>MCC notice</NoticeLink>
          {/* The end date's own source when the status cites a later notice (e.g. a suspension) that doesn't print it. */}
          {s.now !== "suspended" && s.scheduled?.to && s.scheduledBy && s.scheduledBy.url !== s.url && <NoticeLink s={s.scheduledBy}>MCC schedule</NoticeLink>}
        </p>
      ))}
      {today && (
        <p className="flex flex-wrap items-center gap-x-2">
          {label}
          <strong className="font-semibold">{roundName[today.round]} {stepName[today.step].toLowerCase()}</strong>
          <span className="text-muted-foreground">scheduled for today{today.scheduled?.tentative && " (tentative)"}</span>
          <NoticeLink s={today.scheduledBy ?? today}>MCC notice</NoticeLink>
        </p>
      )}
      {!live.length && !today && <p>{label} no MCC counselling step is open.</p>}
      {next && !today && (
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="text-muted-foreground">Next:</span>
          <span>
            {roundName[next.round]} {stepName[next.step].toLowerCase()} {next.scheduled?.from ? "from" : "on"} <span className="numeric">{fmtIST(nextDate(next)!)}</span>
            {next.scheduled?.tentative && " (tentative)"}
          </span>
          <NoticeLink s={next.scheduledBy ?? next}>MCC schedule</NoticeLink>
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-1 text-caption text-muted-foreground">
        {full}
        <InfoTip label="round status">
          From MCC notices as of <span className="numeric">{fmtIST(rs.asOf)}</span>. {datesNote}
        </InfoTip>
      </p>
    </section>
  );
}
