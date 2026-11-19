import { SpaceBand } from "@/components/marketing/crew-extras";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { PlannerPreview } from "@/components/marketing/planner-preview";
import { QuestionMarquee } from "@/components/marketing/question-marquee";
import { LoggedOut } from "@/features/auth/components/log-out-button";
import { landingData, rankCheck, residentCounts } from "@/features/exams/landing/data";
import { TrackView } from "@/features/funnel/components/beacon";

// Static, re-rendered hourly: the price line turns over when FREE_FOR_ALL_UNTIL passes, and the figures (the rank check's
// example, residents, NEET PG's examples) follow an import within the hour.
export const revalidate = 3600;

/** The hero's example: a mid-table AIR and category, answered from the data like any typed rank. */
const EXAMPLE = { rank: 18500, category: "OBC" } as const;

export default async function HomePage() {
  // The home page never fails on its data: without it, the words and the rank form still stand (the form's own page reads the data).
  const [d, example] = await Promise.all([landingData("neet-pg").catch(() => null), rankCheck(EXAMPLE.rank, EXAMPLE.category, 3).catch(() => null)]);
  const college = d?.closing?.college ?? null;
  const counts = await residentCounts(college?.key ?? null).catch(() => null);
  return (
    <>
      <TrackView name="landing_view" />
      <LoggedOut />
      <Hero example={example} />
      <QuestionMarquee />
      <PlannerPreview counts={counts} college={college?.name ?? null} />
      <SpaceBand />
      <Features d={d} />
      <Faq />
      <Cta />
    </>
  );
}
