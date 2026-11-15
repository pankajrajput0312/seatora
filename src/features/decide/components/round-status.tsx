import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { decideLinks } from "../lib/links";
import { LATEST_YEAR } from "../lib/reach";
import { currentSteps, fmtIST, fmtNote, nextDate, roundName, statusBadge, stepName, stepsNow, type StepNow } from "../lib/round-status";
import { roundStatus } from "../server/notices";
import { InfoTip } from "./info-tip";
import { SourceRef } from "./page-sources";
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

/** The MCC schedule behind a step's dates, as a numbered source (the page's Sources footer). */
const scheduleRef = (s: Pick<StepNow, "url" | "title">) => s.url && <SourceRef doc={{ name: s.title ?? "MCC schedule", url: s.url, type: "OFFICIAL" }} />;

/**
 * Overview's first block: what is open now and the next scheduled date, in the Counselling page's status badges, each
 * with its MCC notice (a link) and the schedule behind its dates (a numbered source). No round status in the data:
 * says so and points to MCC, never a made-up date.
 */
export async function RoundStatusBanner({ params }: { params: URLSearchParams }) {
  const rs = await roundStatus(LATEST_YEAR);
  if (!rs)
    return (
      <section aria-label={`MCC counselling ${LATEST_YEAR} now`} className="rounded-xl border border-border bg-card px-4 py-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-2">
          <span>No MCC round status for {LATEST_YEAR} is in the data, so no dates are shown. Check the</span>
          {mccSite}
        </p>
      </section>
    );
  const { live, next } = currentSteps(stepsNow(rs, new Date()));
  const datesNote = `Dates are as MCC printed them; tentative ones may change.${live.some((s) => s.clock === "started") ? " \"Not yet confirmed by MCC\": the step started as scheduled, and no MCC notice confirms it yet." : ""}`;
  return (
    <section aria-label={`MCC counselling ${rs.year} now`} className="grid rounded-xl border border-border bg-card px-4 py-1 text-sm">
      {live.map((s) => (
        <p key={s.round + s.step} className="flex flex-wrap items-center gap-x-2">
          <Badge tone={statusBadge[s.now].tone}>{statusBadge[s.now].text}</Badge>
          {/* The deadline is the Overview's first fact: body size, whatever the banner's small print. */}
          <strong className="text-[0.9375rem] font-semibold md:text-base">
            {roundName[s.round]} {stepName[s.step].toLowerCase()}{s.now !== "suspended" && s.scheduled?.to && <> until <span className="numeric">{fmtIST(s.scheduled.to)}</span></>}
          </strong>
          {/* The end date's own source when the status cites a later notice (e.g. a suspension) that doesn't print it. */}
          {s.now !== "suspended" && s.scheduled?.to && s.scheduledBy && s.scheduledBy.url !== s.url && scheduleRef(s.scheduledBy)}
          {s.clock === "started" && <span className="text-muted-foreground">not yet confirmed by MCC</span>}
          {/* The notice's own status line, e.g. a suspension that has since lifted ("suspended until …, then resumed"). */}
          {s.note && <span className="text-muted-foreground">{fmtNote(s.note)}</span>}
          <NoticeLink s={s}>MCC notice</NoticeLink>
        </p>
      ))}
      {!live.length && <p className="py-2.5">No MCC counselling step is open now.</p>}
      {next && (
        <p className="flex flex-wrap items-center gap-x-2">
          <Badge tone={statusBadge.upcoming.tone}>Next</Badge>
          <span>
            {roundName[next.round]} {stepName[next.step].toLowerCase()} {next.scheduled?.from ? "from" : "on"} <span className="numeric">{fmtIST(nextDate(next)!)}</span>
            {next.scheduled?.tentative && " (tentative)"}
            {scheduleRef(next.scheduledBy ?? next)}
          </span>
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
        <Link href={decideLinks(params).to("/decide/counselling")} className={`${smallLink} text-sky`}>Full schedule</Link>
        <InfoTip label="round status">
          From MCC notices as of <span className="numeric">{fmtIST(rs.asOf)}</span>. {datesNote}
        </InfoTip>
      </p>
    </section>
  );
}
