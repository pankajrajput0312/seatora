import type { Metadata } from "next";
import { AppPage } from "@/features/decide/components/app-page";
import { HistoryNote, PageHead } from "@/features/decide/components/bits";
import { ChoicesView } from "@/features/decide/components/choices-view";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { decideLinks } from "@/features/decide/lib/links";
import { fillWindow, nextChoiceFilling, roundName, stepsNow } from "@/features/decide/lib/round-status";
import { toURLSearchParams } from "@/features/decide/profile";
import { roundStatus } from "@/features/decide/server/notices";
import { chosenView } from "@/features/decide/server/view";
import { currentSeatLists, getMeta, optionsView } from "@/features/decide/service";
import { activeExam } from "@/features/exams/active";
import { DEFAULT_EXAM, exams, latestOf, yearName } from "@/features/exams/registry";
import { currentPlan } from "@/features/plans/usage";
import { liveReach } from "./actions";

export const metadata: Metadata = { title: "Choices" };

export default async function ChoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const exam = await activeExam();
  const { latestYear: LATEST_YEAR, pastYears: PAST_YEARS } = exams[exam];
  const [lists, view, me, rs, meta] = await Promise.all([currentSeatLists(exam), chosenView(params, "choices"), currentPlan(), roundStatus(LATEST_YEAR, exam).catch(() => null), getMeta(exam)]);
  // Her list is for the choice filling she fills next (MCC's schedule), never a fixed round (the layout names it the same).
  const fill = rs && nextChoiceFilling(stepsNow(rs, new Date()));
  const nextRound = fill && { name: `${roundName[fill.round]} · ${yearName(exam, rs.year)}`, when: `${roundName[fill.round]} choice filling, ${fillWindow(fill)}` };
  return (
    <AppPage>
      <PageHead title="Choices" about="Your list in the order you'll enter it on the MCC portal, saved to your account (every device you sign in on). Reorder by dragging, with the keyboard (Space to pick up, arrows to move, Space to drop), or with the move buttons; in the table, pick a choice's number to move it straight there." />
      {/* Another exam: "no seats in the lists" only while their round is current (no result yet: its choice filling). */}
      <ChoicesView reachFor={liveReach} view={view} maxLists={me?.eff.limits.choiceLists} hasLists={lists.length > 0} nextRound={nextRound} latest={latestOf(meta.sources, exam)} listsCurrent={exam === DEFAULT_EXAM || optionsView(undefined, lists, meta.sources) === "round"} />
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
        <HistoryNote />
        {/* The reach labels read the past years' closing ranks and the latest year's rounds; the seat counts these lists. */}
        <DataSource used={[{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR }]} />
        <SeatSource lists={lists} L={L} />
      </div>
    </AppPage>
  );
}
