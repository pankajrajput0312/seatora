import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PlannerPreview } from "@/components/marketing/planner-preview";
import { QuestionMarquee } from "@/components/marketing/question-marquee";
import { SeatFactors } from "@/components/marketing/seat-factors";
import { Trust } from "@/components/marketing/trust";

export default function HomePage() {
  return (
    <>
      <Hero />
      <QuestionMarquee />
      <PlannerPreview />
      <Features />
      <SeatFactors />
      <HowItWorks />
      <Trust />
      <Faq />
      <Cta />
    </>
  );
}
