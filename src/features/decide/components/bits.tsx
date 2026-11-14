import Link from "next/link";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRank } from "@/features/cutoffs/lib/format";
import { reachLabel, reachTone, type Deepest, type Reach } from "../lib/reach";
import { roundLabel } from "../types";

export const HISTORY_CAPTION =
  "Based on previous years' closing ranks. History, not a prediction — seat matrix, category and competition change every round.";

export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight md:text-[2.25rem]">{title}</h1>
      {children && <p className="mt-2 text-base leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  );
}

export function ReachBadge({ reach, provisional }: { reach: Reach; provisional?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={reachTone[reach]} className={reach === "closed-before" ? "text-muted-foreground" : undefined}>
        {reach === "reached-both" && <History className="mr-1 size-3" aria-hidden />}
        {reachLabel(reach, 2026, [2024, 2025])}
      </Badge>
      {reach === "reached-latest" && provisional && <Badge tone="warning">Provisional</Badge>}
    </span>
  );
}

/** A deepest closing rank with its round and seat category; "—" (with sr-only text) when missing. */
export function Closing({ d }: { d: Deepest | null | undefined }) {
  if (!d) return <span>—<span className="sr-only">not available</span></span>;
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

export function SetRankPrompt({ path }: { path: string }) {
  return (
    <div className="mt-10 grid place-items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-lg font-medium">Set your rank to begin</p>
      <p className="max-w-sm text-sm text-muted-foreground">Add your All India Rank, category and courses. It stays on this device.</p>
      <Link href={`${path}?editProfile=1`} className="mt-2 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Set your rank
      </Link>
    </div>
  );
}
