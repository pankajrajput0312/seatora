import { Plus } from "lucide-react";
import { Container } from "@/components/layout/container";
import Link from "next/link";
import { faqLd, JsonLd } from "@/lib/seo";
import { PriceLine, priceLine } from "./price-line";
import { SectionHeading } from "./section-heading";

/** `text`: an answer that isn't a plain string, in words (the FAQPage JSON-LD's). */
export type FaqItem = { q: string; a: React.ReactNode; text?: string };

/** "How do I get access?": the price line (the exam landing pages end on it too). Read per render: the price line has dates. */
export const accessFaq = (): FaqItem => ({
  q: "How do I get access?",
  a: (
    <>
      Create a free account and the planner opens straight away. <PriceLine /> The{" "}
      <Link href="/pricing" className="text-sky underline underline-offset-4">Pricing page</Link> lists what each plan gives.
    </>
  ),
  text: `Create a free account and the planner opens straight away. ${priceLine()} The Pricing page lists what each plan gives.`,
});

/** An answer in plain words: the string itself, else its `text`; null for neither. */
export const faqText = (f: FaqItem) => (typeof f.a === "string" ? f.a : (f.text ?? null));

/** The home page's questions (llms-full.txt's too). */
export const faqs = (): FaqItem[] => [
  {
    q: "Which counselling does Seatora cover?",
    a: "MCC's All India counselling for NEET PG: the All India Quota, deemed and central universities, and DNB seats, with their allotments, seat lists, notices and residents. State quota counselling isn't covered; a state filter shows the All India seats in that state.",
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
  accessFaq(),
];

/** The home page's questions, or a page's own (`items`, `title`), with their FAQPage JSON-LD. */
export function Faq({ items = faqs(), title = "Questions aspirants ask us." }: { items?: FaqItem[]; title?: string }) {
  return (
    <section id="faq" className="scroll-mt-16 border-b border-border">
      <JsonLd data={faqLd(items.map((f) => ({ q: f.q, text: faqText(f) })))} />
      <Container className="grid gap-12 py-20 md:py-28 lg:grid-cols-[1fr_1.5fr]">
        <SectionHeading eyebrow="FAQ" title={title} />
        <div className="divide-y divide-border border-y border-border">
          {items.map((f) => (
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
