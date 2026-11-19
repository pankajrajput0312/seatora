import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Inside } from "@/features/exams/landing/exam-landing";
import type { LandingData } from "@/features/exams/landing/data";

const problems = [
  { title: "Cutoffs in scattered PDFs", body: "MCC prints every round's allotments as a long PDF, a new one each round, every year." },
  { title: "Fees and bonds out of date", body: "Stipends, bond penalties and fee hikes are rarely dated or easy to find." },
  { title: "Who's there, buried in PDFs", body: "Admitted-candidate lists are long PDFs with no way to see one college's residents." },
];

/** The tools that need her rank or her list, named rather than drawn (a drawing would be made-up data). */
const tools = [
  "Options for your rank, each marked reached, within 10% or closed before it",
  "Compare up to four options side by side",
  "Your choice list in the order you'll fill it",
  "A page for every institute: seats, closing ranks, fees, bond and residents",
];

/** The problem strip, then real figures from NEET PG's data (the /neet-pg page's examples), never sample screens. */
export function Features({ d }: { d: LandingData | null }) {
  return (
    <>
      <section className="border-b border-border">
        <Container className="grid gap-px overflow-hidden py-0 md:grid-cols-3">
          {problems.map((p) => (
            <div key={p.title} className="border-t border-border py-10 first:border-t-0 md:border-t-0 md:px-8 md:first:pl-0 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-border">
              <p className="text-base font-medium">{p.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </Container>
      </section>

      {d && (
        <div id="features" className="scroll-mt-16">
          <Inside d={d} title="Everything for MCC counselling, from its own documents" closing>
            <div className="mt-14 grid gap-6 border-t border-border pt-8 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <h3 className="text-lg font-medium">And with your rank and your list</h3>
                <ul className="mt-3 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2 sm:gap-x-8">
                  {tools.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <Link href="/neet-pg" className="inline-flex min-h-11 items-center text-sm text-sky underline underline-offset-4 hover:no-underline">
                NEET PG counselling: where it stands and more examples
              </Link>
            </div>
          </Inside>
        </div>
      )}
    </>
  );
}
