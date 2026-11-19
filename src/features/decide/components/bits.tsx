import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRank } from "@/features/cutoffs/lib/format";
import { cn } from "@/lib/cn";
import { shortName } from "../lib/format";
import { pastOf, reachedElsewhere, reachLabel, reachTone, type Deepest, type Latest, type Reach } from "../lib/reach";
import type { OptionRow } from "../service";
import type { Term } from "../types";
import { InfoTip } from "./info-tip";
import { SourceRef } from "./page-sources";
import { RoundName, RoundShort, YearName } from "./round-name";

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
      <InfoTip label="previous years' closing ranks" more={more}>{HISTORY_CAPTION}</InfoTip>
    </span>
  );
}

/**
 * Page title and its (i). `children`: the page's intro, kept in the (i) with `about` (the longer explanation; phrasing
 * content), so results start right under the title. `note`: a few words that must stay in view (a caveat), beside the
 * title. The h1 takes focus (id main-h1) when the content it heads is removed, e.g. the last Compare column.
 */
export function PageHead({ title, children, about, more, note }: { title: string; children?: React.ReactNode; about?: React.ReactNode; /** The rest, behind the (i)'s "More". */ more?: React.ReactNode; note?: React.ReactNode }) {
  const tip = children && about ? <>{children} {about}</> : (children ?? about);
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <h1 id="main-h1" tabIndex={-1} className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
      {tip && <InfoTip label={title} more={more}>{tip}</InfoTip>}
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
 * `provisional`: the label rests on the provisional latest round (OptionRow.reachProvisional), whatever the label.
 * `latest`: lib/reach.ts latestRound. `on`: the label is on that one seat category (Seats rows), so its no-data wording
 * names it.
 */
/** `seats`: the option's reach per category and the newest lists' seats (OptionRow), so a reach on categories those lists have no seats of says so (lib/reach.ts reachedElsewhere). */
export function ReachBadge({ reach, provisional, latest, includeLatest = true, on, otherGroup, from, seats }: { reach: Reach; provisional?: boolean; latest: Latest; includeLatest?: boolean; on?: string; otherGroup?: boolean; from?: OptionRow["reachFrom"]; seats?: Parameters<typeof reachedElsewhere>[1] }) {
  // NEET SS: her rank isn't compared with another question group's seats (OptionRow.otherGroup).
  if (otherGroup) return <Badge tone="neutral" className="text-muted-foreground">Another question group</Badge>;
  const elsewhere = seats && reachedElsewhere(reach, seats, latest.exam);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={elsewhere ? "warning" : reachTone[reach]} className={reach === "closed-before" ? "text-muted-foreground" : undefined}>
        {reach === "reached-both" && <History className="mr-1 size-3" aria-hidden />}
        {reachLabel(reach, latest, pastOf(latest), includeLatest, on)}{elsewhere && ` ${elsewhere.on}`}
      </Badge>
      <Provisional when={provisional} />
      {elsewhere && <span className="block w-full text-xs text-sun"><span className="sr-only">; </span>{elsewhere.lists[0].toUpperCase() + elsewhere.lists.slice(1)}</span>}
      {from && <ReachedFrom from={from} reach={reach} />}
    </span>
  );
}

/**
 * Under a "reached" label (OptionRow.reachFrom): "In Round 1", or "Only in a later round (R3)", with the year when the
 * label rests on two, so an option first reached in R2 or R3 never reads like a Round 1 seat.
 */
function ReachedFrom({ from, reach }: { from: NonNullable<OptionRow["reachFrom"]>; reach: Reach }) {
  const year = reach !== "reached-latest" && <span className="numeric"><YearName year={from.year} />: </span>;
  if (from.round === "R1") return <span className="block w-full text-xs text-muted-foreground">{reach === "reached-one" && year}In Round 1</span>;
  return <span className="block w-full text-xs text-sun">{year}Only in a later round (<RoundName year={from.year} round={from.round} />)</span>;
}

/** A deepest closing rank with its round (named as that `year`'s PDFs call it, when given) and seat category; "—" (with sr-only text) when missing. */
export function Closing({ d, year }: { d: Deepest | null | undefined; year?: number }) {
  if (!d) return <Dash />;
  return (
    <span className="numeric">
      <span className="text-[15px] font-semibold">{formatRank(d.closing)}</span>
      <span className="block text-xs font-normal text-muted-foreground">{year == null ? <RoundShort round={d.round} /> : <RoundName year={year} round={d.round} />}, {d.category} seat</span>
    </span>
  );
}

/** Not applicable ("—"); missing data is "Not published" (lib/stat-format.ts NOT_PUBLISHED). */
export function Dash() {
  return <span>—<span className="sr-only">not applicable</span></span>;
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

/**
 * An institute's name in a narrow cell: the full name from md up; on phones its short name with the state code
 * ("GMC Latur, MH", lib/format.ts shortName) so a clamped cell never hides which college it is, the full name read out.
 */
export function InstName({ name, state }: { name: string; state?: string | null }) {
  return (
    <>
      {/* A long unbroken name ("Modakkallur(PO),Kerla") breaks inside its cell, never over the next one (names only). */}
      <span className="wrap-anywhere max-md:hidden">{name}</span>
      <span className="wrap-anywhere md:hidden"><span aria-hidden title={name}>{shortName(name, state)}</span><span className="sr-only">{name}</span></span>
    </>
  );
}
