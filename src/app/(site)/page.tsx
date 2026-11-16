import { SpaceBand, TaskBar } from "@/components/marketing/crew-extras";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { PlannerPreview } from "@/components/marketing/planner-preview";
import { QuestionMarquee } from "@/components/marketing/question-marquee";

// Static, re-rendered hourly so the price (FreePrice: "free till 20 Nov", then ~~₹499~~ ₹199) turns over when FREE_FOR_ALL_UNTIL passes.
export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      <TaskBar />
      <Hero />
      <QuestionMarquee />
      <PlannerPreview />
      <SpaceBand />
      <Features />
      <Faq />
      <Cta />
    </>
  );
}
