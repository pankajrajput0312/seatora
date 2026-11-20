import { SpaceBand, TaskBar } from "@/components/marketing/crew-extras";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { PlannerPreview } from "@/components/marketing/planner-preview";
import { QuestionMarquee } from "@/components/marketing/question-marquee";
import { LoggedOut } from "@/features/auth/components/log-out-button";
import { BranchRanks } from "@/features/exams/landing/branch-ranks";
import { TrackView } from "@/features/funnel/components/beacon";

// Static, re-rendered hourly so the price (FreePrice: "Free till 20 Nov. Then ₹199 once…", then ~~₹499~~ ₹199) turns over when FREE_FOR_ALL_UNTIL passes.
export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      <TrackView name="landing_view" />
      <LoggedOut />
      <TaskBar />
      <Hero />
      <BranchRanks />
      <QuestionMarquee />
      <PlannerPreview />
      <SpaceBand />
      <Features />
      <Faq />
      <Cta />
    </>
  );
}
