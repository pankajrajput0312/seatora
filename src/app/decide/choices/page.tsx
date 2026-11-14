import type { Metadata } from "next";
import { AppPage } from "@/features/decide/components/app-page";
import { HISTORY_CAPTION, PageHead } from "@/features/decide/components/bits";
import { ChoicesView } from "@/features/decide/components/choices-view";
import { DataSource, SeatSource } from "@/features/decide/components/data-source";
import { decideLinks } from "@/features/decide/lib/links";
import { toURLSearchParams } from "@/features/decide/profile";
import { currentSeatLists, LATEST_YEAR, PAST_YEARS } from "@/features/decide/service";
import { liveReach } from "./actions";

export const metadata: Metadata = { title: "Choices" };

export default async function ChoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [L, lists] = await Promise.all([searchParams.then((p) => decideLinks(toURLSearchParams(p))), currentSeatLists()]);
  return (
    <AppPage className="py-6">
      <PageHead title="Choices">
        Your choice list in the order you&apos;ll enter it on the MCC portal. Saved on this device. Drag, use the keyboard (Space to pick up, arrows to move), or the move buttons.
      </PageHead>
      <ChoicesView reachFor={liveReach} />
      <div className="mt-6 grid gap-2 text-xs text-muted-foreground">
        <p>{HISTORY_CAPTION}</p>
        {/* The reach labels read the past years' closing ranks and the latest year's R1; the seat counts these lists. */}
        <DataSource used={[{ year: PAST_YEARS[0] }, { year: PAST_YEARS[1] }, { year: LATEST_YEAR, round: "R1" }]} />
        {lists.map((l) => <SeatSource key={l.key} list={l} L={L} />)}
      </div>
    </AppPage>
  );
}
