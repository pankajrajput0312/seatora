import { Coverage } from "@/components/marketing/coverage";
import { Cta } from "@/components/marketing/cta";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PlannerPreview } from "@/components/marketing/planner-preview";
import { QuestionMarquee } from "@/components/marketing/question-marquee";
import { Trust } from "@/components/marketing/trust";

export default function HomePage() {
  return (
    <>
      <Hero />
      <QuestionMarquee />
      <PlannerPreview />
      <Coverage />
      <Features />
      <HowItWorks />
      <Trust />
      <Faq />
      <Cta />
    </>
  );
}
