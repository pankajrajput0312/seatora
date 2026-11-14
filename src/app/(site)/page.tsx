import { SpaceBand, TaskBar } from "@/components/marketing/crew-extras";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { PlannerPreview } from "@/components/marketing/planner-preview";

export default function HomePage() {
  return (
    <>
      <TaskBar />
      <Hero />
      <PlannerPreview />
      <SpaceBand />
      <Features />
      <Faq />
      <Cta />
    </>
  );
}
