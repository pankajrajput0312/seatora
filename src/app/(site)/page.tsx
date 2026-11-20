import type { Metadata } from "next";
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
import { appLd, JsonLd, organizationLd, pageWords, websiteLd } from "@/lib/seo";

// Static, re-rendered hourly so the price (FreePrice: "Free till 20 Nov. Then ₹199 once…", then ~~₹499~~ ₹199) turns over when FREE_FOR_ALL_UNTIL passes.
export const revalidate = 3600;
// The brand first in the title; the description is the layout's (siteConfig). Open Graph stays the layout's (residents first).
export const metadata: Metadata = { title: { absolute: pageWords["/"].title }, alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <>
      <JsonLd data={{ "@graph": [organizationLd, websiteLd, appLd] }} />
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
