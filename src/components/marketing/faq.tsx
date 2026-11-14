import { Plus } from "lucide-react";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "./section-heading";

const faqs = [
  {
    q: "Which counselling does Seatora cover?",
    a: "All India Quota through MCC first, including central and deemed institutes, with state counselling added authority by authority. Each page shows which counselling the data comes from.",
  },
  {
    q: "Will it tell me which college I'll get?",
    a: "No one can promise that honestly. Seatora shows where your rank sat against previous-year closing ranks by round, quota and category, so you can build a realistic, well-researched choice list.",
  },
  {
    q: "Where does the data come from?",
    a: "Official allotment lists, seat matrices and notices from counselling authorities, plus documents from the institutes themselves. Each figure links to its source and shows when it was last verified.",
  },
  {
    q: "Where do residents' names come from?",
    a: "From MCC's official admitted-candidates lists, with the 2025 All India Rank from the NBEMS merit list where it is published. Seatora shows a name, course and year only. It holds no contact details, and hides a name if that person asks.",
  },
  {
    q: "When can I start using it?",
    a: "We're opening in stages. Join early access and we'll email you when the planner is ready for your counselling year.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 border-b border-border">
      <Container className="grid gap-12 py-20 md:py-28 lg:grid-cols-[1fr_1.5fr]">
        <SectionHeading eyebrow="FAQ" title="Questions aspirants ask us." />
        <div className="divide-y divide-border border-y border-border">
          {faqs.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" strokeWidth={1.75} aria-hidden />
              </summary>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
