import type { Metadata } from "next";
import { AppPage } from "@/features/decide/components/app-page";
import { HistoryNote, PageHead } from "@/features/decide/components/bits";
import { ChoicesView } from "@/features/decide/components/choices-view";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { decideLinks } from "@/features/decide/lib/links";
import { toURLSearchParams } from "@/features/decide/profile";
import { chosenView } from "@/features/decide/server/view";
import { currentSeatLists, LATEST_YEAR, PAST_YEARS } from "@/features/decide/service";
import { liveReach } from "./actions";

export const metadata: Metadata = { title: "Choices" };

export default async function ChoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = toURLSearchParams(await searchParams);
  const L = decideLinks(params);
  const [lists, view] = await Promise.all([currentSeatLists(), chosenView(params, "choices")]);
  return (
    <AppPage>
      <PageHead title="Choices" about="Your list in the order you'll enter it on the MCC portal, saved to your account (every device you sign in on). Reorder by dragging, with the keyboard (Space to pick up, arrows to move, Space to drop), or with the move buttons." />
      <ChoicesView reachFor={liveReach} view={view} />
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
        <HistoryNote />
        {/* The reach labels read the past years' closing ranks and the latest year's R1; the seat counts these lists. */}
        <DataSource used={[{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR, round: "R1" }]} />
        <SeatSource lists={lists} L={L} />
      </div>
    </AppPage>
  );
}
