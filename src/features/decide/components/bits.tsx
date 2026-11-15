import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { LATEST_YEAR, PAST_YEARS, reachLabel, reachTone, type Deepest, type Reach } from "../lib/reach";
import { roundLabel, type Term } from "../types";
import { InfoTip } from "./info-tip";
import { SourceRef } from "./page-sources";

export const HISTORY_CAPTION =
  "Based on previous years' closing ranks. History, not a prediction — seat matrix, category and competition change every round.";

/**
 * HISTORY_CAPTION as a few words, the rest behind an (i): an inline span, so it sits on a results page's count line
 * (or any line) instead of a line of its own. `more`: the block's own caveat, added in the tip (phrasing content). Every
 * block of past closing ranks keeps the short words visible (docs/DATA_INTEGRITY.md, rule 3).
 */
export function HistoryNote({ more, className }: { more?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-x-1 text-xs text-muted-foreground", className)}>
      History, not a prediction
      <InfoTip label="previous years' closing ranks">{HISTORY_CAPTION}{more && <> {more}</>}</InfoTip>
    </span>
  );
}

/**
 * Page title and its (i). `children`: the page's intro, kept in the (i) with `about` (the longer explanation; phrasing
 * content), so results start right under the title. `note`: a few words that must stay in view (a caveat), beside the
 * title. The h1 takes focus (id main-h1) when the content it heads is removed, e.g. the last Compare column.
 */
export function PageHead({ title, children, about, note }: { title: string; children?: React.ReactNode; about?: React.ReactNode; note?: React.ReactNode }) {
  const tip = children && about ? <>{children} {about}</> : (children ?? about);
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <h1 id="main-h1" tabIndex={-1} className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
      {tip && <InfoTip label={title}>{tip}</InfoTip>}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

/**
 * The one marker for numbers from a provisional MCC result (Source.provisional); renders nothing otherwise. `when` is
 * required: a missing closing passes undefined, which must mean "no badge", never a default of true.
 */
export function Provisional({ when }: { when: boolean | null | undefined }) {
  return when ? <Badge tone="warning">Provisional</Badge> : null;
}

/**
 * `provisional`: the label rests on the provisional latest-year R1 (OptionRow.reachProvisional), whatever the label.
 * `on`: the label is on that one seat category (Seats rows), so its no-data wording names it.
 */
export function ReachBadge({ reach, provisional, includeLatest = true, on }: { reach: Reach; provisional?: boolean; includeLatest?: boolean; on?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={reachTone[reach]} className={reach === "closed-before" ? "text-muted-foreground" : undefined}>
        {reach === "reached-both" && <History className="mr-1 size-3" aria-hidden />}
        {reachLabel(reach, LATEST_YEAR, PAST_YEARS, includeLatest, on)}
      </Badge>
      <Provisional when={provisional} />
    </span>
  );
}

/** A deepest closing rank with its round and seat category; "—" (with sr-only text) when missing. */
export function Closing({ d }: { d: Deepest | null | undefined }) {
  if (!d) return <Dash />;
  return (
    <span className="numeric">
      <span className="text-[15px] font-semibold">{formatRank(d.closing)}</span>
      <span className="block text-xs font-normal text-muted-foreground">{roundLabel[d.round]}, {d.category} seat</span>
    </span>
  );
}

export function Dash() {
  return <span>—<span className="sr-only">not available</span></span>;
}

/**
 * A fee, stipend, bond or seat-leaving penalty exactly as published (amounts with a qualifier such as "at least" or
 * "yr 1/2/3" stay in their words), with its numbered source (the page's Sources footer); "—" when not listed.
 */
export function TermText({ term }: { term: Pick<Term, "text" | "source"> | null | undefined }) {
  if (!term) return <Dash />;
  return (
    <span>
      {term.text}
      <SourceRef doc={term.source} />
    </span>
  );
}

// A client component (it reads the saved profile), kept importable from here with the other page bits.
export { SetRankPrompt } from "./dashboard-parts";
