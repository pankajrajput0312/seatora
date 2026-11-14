import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { business } from "@/config/business";

export const metadata: Metadata = {
  title: "About Us",
  description: "Who runs Seatora, an independent NEET PG counselling planner built on official MCC and NBEMS documents.",
};

export default function AboutPage() {
  const { sellerName } = business;
  return (
    <Container className="py-20 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">About</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">About Us</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: <time dateTime="2026-11-14">14 November 2026</time></p>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-foreground">
          <section>
            <h2>Who we are</h2>
            <p className="mt-2">Seatora is run by {sellerName ? `${sellerName}, an individual` : "an individual"} in India.</p>
          </section>
          <section>
            <h2>What Seatora is</h2>
            <p className="mt-2">
              An online planner for NEET PG counselling. It shows past MCC allotments and closing ranks, seats, and fees, stipends, bonds
              and penalties from official MCC and NBEMS documents, with a link to the source of each figure, so you can build your choice
              list. It also shows the names of residents at each college from MCC&apos;s official admitted-candidates lists.
            </p>
            <p className="mt-2">The data is historical. It is not a prediction or a promise of admission.</p>
          </section>
          <section>
            <h2>Independent</h2>
            <p className="mt-2">Seatora is not affiliated with or endorsed by MCC, NBEMS, NMC or any government body.</p>
          </section>
          <section>
            <h2>Get in touch</h2>
            <p className="mt-2">
              See our <Link href="/contact" className="text-sky underline">Contact</Link> page.
            </p>
          </section>
        </div>
      </article>
    </Container>
  );
}
