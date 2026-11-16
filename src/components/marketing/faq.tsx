import { Plus } from "lucide-react";
import { Container } from "@/components/layout/container";
import { FreePrice } from "./free-price";
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
    a: "From MCC's official admitted-candidates lists, with the All India Rank from that year's NBEMS NEET PG result where it is known. Seatora shows a name, course and year only. It holds no contact details, and hides a name if that person asks.",
  },
  {
    q: "How do I get access?",
    a: (
      <>
        A free account opens the planner straight away. The Seatora NEET PG 2026 Season Pass, for the whole 2026 counselling season: <FreePrice />. See the Pricing page for what each plan gives.
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 border-b border-border">
      <Container className="grid gap-12 py-20 md:py-28 lg:grid-cols-[1fr_1.5fr]">
        <SectionHeading eyebrow="FAQ" title="Questions aspirants ask us." />
        <div className="divide-y divide-border border-y border-border">
          {faqs.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" strokeWidth={1.75} aria-hidden />
              </summary>
              <p className="-mt-2 max-w-prose pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
