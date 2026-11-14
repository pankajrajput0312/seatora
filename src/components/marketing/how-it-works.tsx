import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SectionHeading } from "./section-heading";

const stages = [
  {
    title: "Registration & eligibility",
    body: "Check which counsellings you can join, their deadlines and the documents each one needs.",
    tools: [{ label: "Counselling routes", href: "#coverage" }],
  },
  {
    title: "Choice filling",
    body: "See who's at the hospitals you're considering, compare closing ranks, fees, stipends and bonds, then order your choices.",
    tools: [
      { label: "Residents by hospital", href: "#preview" },
      { label: "Closing ranks", href: "#features" },
      { label: "Compare", href: "#features" },
    ],
  },
  {
    title: "Allotment & reporting",
    body: "Read the round result, decide whether to join, upgrade or exit, and report before the deadline.",
    tools: [{ label: "Counselling tracker", href: "#features" }],
  },
  {
    title: "Round 2, 3 & stray",
    body: "See what changed between rounds (new seats, upgrades, freed-up seats) before you fill choices again.",
    tools: [{ label: "Seat matrix", href: "#features" }],
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 border-b border-border">
      <Container className="py-20 md:py-28">
        <SectionHeading eyebrow="Step by step" title="Help at every stage, from registration to reporting." />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
          {stages.map((s, i) => (
            <li key={s.title} className="flex flex-col bg-background p-6">
              <span className="font-pixel text-4xl text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-6 text-base font-medium">{s.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {s.tools.map((t) => (
                  <Link key={t.label} href={t.href} className="inline-flex min-h-11 items-center rounded-sm bg-sky/10 px-2 text-xs font-medium text-sky hover:bg-sky/20">
                    {t.label}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
