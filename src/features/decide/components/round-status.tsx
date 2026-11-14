import Link from "next/link";
import { cn } from "@/lib/cn";
import { decideLinks } from "../lib/links";
import { LATEST_YEAR } from "../lib/reach";
import { currentSteps, fmtIST, nextDate, roundName, stepName, stepsNow, type StepNow } from "../lib/round-status";
import { roundStatus } from "../server/notices";
import { smallLink } from "./ui";

/** A step's MCC notice (for an upcoming step, the schedule notice), opening in a new tab; without `children` its title. */
export function NoticeLink({ s, children }: { s: StepNow; children?: React.ReactNode }) {
  if (!s.url) return null;
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>
      {children ?? s.title ?? "MCC notice"}<span className="sr-only">{children && s.title && `: ${s.title}`} (opens in a new tab)</span>
    </a>
  );
}

/** Compact Overview banner: what is open now and the next scheduled date, each with its MCC notice. */
export async function RoundStatusBanner({ params }: { params: URLSearchParams }) {
  const rs = await roundStatus(LATEST_YEAR);
  if (!rs) return null;
  const { live, next } = currentSteps(stepsNow(rs, new Date()));
  return (
    <section aria-label={`MCC counselling ${rs.year} now`} className="grid rounded-xl border border-border bg-card px-4 py-1 text-sm">
      {live.map((s) => (
        <p key={s.round + s.step} className="flex flex-wrap items-center gap-x-2">
          <span className="flex items-start gap-2">
            <span className={cn("mt-[0.45em] size-2 shrink-0 rounded-full", s.now === "open" ? "bg-leaf" : "bg-sun")} aria-hidden />
            <strong className="font-semibold">
              {roundName[s.round]} {stepName[s.step].toLowerCase()} {s.now === "suspended" ? "suspended" : s.scheduled?.to ? `open until ${fmtIST(s.scheduled.to)}` : "open"}
            </strong>
          </span>
          {s.clock === "started" && <span className="text-muted-foreground">as scheduled, not yet confirmed by an MCC notice</span>}
          <NoticeLink s={s}>MCC notice</NoticeLink>
        </p>
      ))}
      {!live.length && <p className="py-2.5">No MCC counselling step is open now.</p>}
      {next && (
        <p className="flex flex-wrap items-center gap-x-2">
          <span>
            Next: {roundName[next.round]} {stepName[next.step].toLowerCase()} {next.scheduled?.from ? "from" : "on"} <span className="numeric">{fmtIST(nextDate(next)!)}</span>
            {next.scheduled?.tentative && " (tentative)"}
          </span>
          <NoticeLink s={next}>MCC schedule</NoticeLink>
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>From MCC notices as of <span className="numeric">{fmtIST(rs.asOf)}</span>.</span>
        <Link href={decideLinks(params).to("/decide/counselling")} className={`${smallLink} text-sky`}>Full schedule</Link>
      </p>
    </section>
  );
}
