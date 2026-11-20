import "server-only";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatRank } from "@/features/cutoffs/lib/format";
import { BranchTables, shortTab, tabsOf } from "@/features/exams/landing/branch-ranks";
import { branchRanks, vsRank } from "@/features/exams/landing/data";
import { DEFAULT_EXAM, type ExamKey } from "@/features/exams/registry";
import type { DecideLinks } from "../lib/links";
import { roundName } from "../lib/round-status";
import type { Profile } from "../profile";
import { Provisional } from "./bits";
import { WaitForSaved } from "./dashboard-parts";
import { InfoTip } from "./info-tip";
import { TryingText } from "./trying-text";
import { smallLink } from "./ui";

/**
 * Home's rank analysis by branch: the latest NEET PG round's last rank by branch (the public home's data and tables,
 * exams/landing/branch-ranks.tsx) with her rank against each branch, reached first; without a rank, the plain table and
 * "Set your rank to compare" (try a rank). NEET PG only: no other exam has this table's data yet.
 */
export async function RankByBranch({ profile, exam, L }: { profile: Profile | null; exam: ExamKey; L: DecideLinks }) {
  if (exam !== DEFAULT_EXAM) return null;
  const d = await branchRanks();
  if (!d) return null;
  const round = roundName[d.round];
  const me = profile ? { rank: profile.rank, category: profile.category, pwd: profile.pwd, quotas: profile.quotas } : undefined;
  const counts = me ? tabsOf(d, me).map((t) => ({ label: shortTab[t.key] ?? t.label, n: vsRank(t.rows, me.rank, me.category, me.pwd).filter((r) => r.reached).length })) : [];
  const n = counts.reduce((a, c) => a + c.n, 0);
  const section = (
    <section aria-labelledby="by-branch-h" className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id="by-branch-h" className="text-h2 font-bold">
          {me ? <TryingText saved={`Your rank vs ${round}'s last rank by branch`} tried={`The rank you're trying vs ${round}'s last rank by branch`} /> : `NEET PG ${d.year} ${round}: last rank by branch`}
        </h2>
        <Provisional when={d.provisional} />
        <InfoTip label="last rank by branch">
          The highest All India Rank given a seat in {round}, per seat category
          {d.round !== "R1" && `; ${round} counts only new allotments (Fresh Allotted and Upgraded), not seats kept from an earlier round`}.{" "}
          {me && "Reached: the last rank on a seat you can take (Open or your category, and their PwD seats if you are PwD) is at or after your rank. "}
          Restricted quotas (NRI, AFMS, university, minority) {me ? "show only when you tick them in your profile" : "are kept apart"} and never mix into the All India, Deemed or DNB
          numbers. History, not a prediction.
        </InfoTip>
      </div>
      {me ? (
        <p className="text-body">
          <span className="numeric font-semibold">AIR {formatRank(me.rank)} {me.category}{me.pwd && " PwD"}</span>: {formatRank(n)} {n === 1 ? "branch" : "branches"} reached your rank in {round} (
          {counts.map((c) => `${c.label} ${formatRank(c.n)}`).join(" · ")})
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-body text-muted-foreground">The highest All India Rank given a seat in {round}, per seat category.</p>
          <Button asChild size="lg" className="min-h-11 max-sm:w-full"><Link href={L.to("/decide", { editProfile: "try" })}>Set your rank to compare</Link></Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {d.source.url ? <a href={d.source.url} target="_blank" rel="noopener noreferrer" className={`${smallLink} text-sky`}>{d.source.name}<span className="sr-only"> (opens in a new tab)</span></a> : d.source.name}
      </p>
      <BranchTables d={d} href={(slug, quota) => L.lastRanks(slug, { quota })} me={me} app />
    </section>
  );
  // No rank in the address: hidden while a saved one is read (the shell then adds it), never "set your rank" to her.
  return me ? section : <WaitForSaved wait={null}>{section}</WaitForSaved>;
}
