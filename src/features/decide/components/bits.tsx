import Link from "next/link";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { LATEST_YEAR, PAST_YEARS, reachLabel, reachTone, type Deepest, type Reach } from "../lib/reach";
import { roundLabel, type Term } from "../types";
import { EmptyState } from "./ui";

export const HISTORY_CAPTION =
  "Based on previous years' closing ranks. History, not a prediction — seat matrix, category and competition change every round.";

/** Page title. The h1 takes focus (id main-h1) when the content it heads is removed, e.g. the last Compare column. */
export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h1 id="main-h1" tabIndex={-1} className="text-3xl font-bold tracking-tight md:text-[2.25rem]">{title}</h1>
      {children && <p className="mt-2 text-base leading-relaxed text-muted-foreground">{children}</p>}
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

/** `provisional`: the label rests on the provisional latest-year R1 (OptionRow.reachProvisional), whatever the label. */
export function ReachBadge({ reach, provisional, includeLatest = true }: { reach: Reach; provisional?: boolean; includeLatest?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={reachTone[reach]} className={reach === "closed-before" ? "text-muted-foreground" : undefined}>
        {reach === "reached-both" && <History className="mr-1 size-3" aria-hidden />}
        {reachLabel(reach, LATEST_YEAR, PAST_YEARS, includeLatest)}
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
 * "yr 1/2/3" stay in their words), with a link to the document it came from; "—" when not listed.
 */
export function TermText({ term }: { term: Pick<Term, "text" | "source"> | null | undefined }) {
  if (!term) return <Dash />;
  const { name, url } = term.source;
  return (
    <span>
      {term.text}{" "}
      <span className="text-xs font-normal text-muted-foreground">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" title={name} aria-label={`Source: ${name} (opens in a new tab)`} className="underline hover:text-sky">source</a>
        ) : (
          `(${name})`
        )}
      </span>
    </span>
  );
}

export function SetRankPrompt({ path }: { path: string }) {
  return (
    <EmptyState title="Set your rank to begin" description="Add your All India Rank, category and courses. They are saved on this device and added to Decide page links, so your rank and category appear in the page address." className="mt-10">
      <Button asChild size="lg"><Link href={`${path}?editProfile=1`}>Set your rank</Link></Button>
    </EmptyState>
  );
}
