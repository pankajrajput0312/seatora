import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { business } from "@/config/business";
import { FreePrice } from "@/components/marketing/free-price";
import { formatINR } from "@/features/cutoffs/lib/format";
import { BuySeasonPass } from "@/features/payments/components/buy-season-pass";

export const metadata: Metadata = {
  title: "Pricing — Seatora NEET PG 2026 Season Pass",
  description: `The Seatora NEET PG 2026 Season Pass is free: ${formatINR(business.price)} (regular price ${formatINR(business.regularPrice)}) ${business.period}, with no subscription or auto-renewal.`,
};

const buyClass = "h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90";

export default function PricingPage() {
  return (
    <Container className="py-10 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Pricing</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Seatora NEET PG 2026 Season Pass</h1>
        <p className="mt-3 text-2xl font-semibold">
          <FreePrice /> <span className="text-base font-normal text-muted-foreground">{business.period}</span>
        </p>
        <p className="mt-3 text-muted-foreground">
          Online NEET PG counselling planner for MCC All India counselling: Round 2 seats, past closing ranks, fees, stipends and bonds, and
          residents at each college, from official MCC, NBEMS and NMC documents. Create a free account and access is switched on immediately.
        </p>
        <div className="mt-5">
          <BuySeasonPass next="/pricing" className={buyClass} noteClassName="text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: <time dateTime="2026-11-15">15 November 2026</time></p>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-foreground">
          <section>
            <h2>What you pay</h2>
            <p className="mt-2">
              The Season Pass is free right now: {formatINR(business.price)} {business.period} (regular price{" "}
              {formatINR(business.regularPrice)}). No payment or card is needed, there is no subscription and nothing renews
              automatically. Any price is in Indian Rupees (INR).
            </p>
            <p className="mt-2">{business.season}</p>
          </section>
          <section>
            <h2>What you get</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Round 2 seats in your courses from MCC&apos;s clear vacancy, virtual vacancy and newly added seat lists.</li>
              <li>Every option with past closing ranks (2023 to 2026, by round and seat category) and a label showing how your rank compares.</li>
              <li>Seat matrix and allotment tables for every college, course and quota.</li>
              <li>Fee, stipend, service bond and seat-leaving penalty for each college, with the official source of each figure.</li>
              <li>Names of residents at each college from MCC&apos;s official admitted-candidates lists.</li>
              <li>MCC notices and the round schedule, NEET PG score-to-rank and merit position from NBEMS results, choice lists and side-by-side compare.</li>
            </ul>
            <p className="mt-2">
              The data is historical, can contain errors and is not a prediction or a promise of admission. Check the official documents before
              choice filling. Seatora is not affiliated with or endorsed by MCC, NBEMS, NMC or any government body.
            </p>
          </section>
          <section>
            <h2>Refunds</h2>
            <p className="mt-2">
              The Season Pass is free right now, so nothing is charged. For any future paid purchase, the payment is not refundable once
              access has been granted. See our{" "}
              <Link href="/refund-policy" className="text-sky underline">Refund &amp; Cancellation Policy</Link> for the exceptions.
            </p>
          </section>
          <section>
            <h2>How to get it</h2>
            <p className="mt-2">
              Click Create free account and sign up with your email address. Access is switched on for your account immediately.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/signup">Create free account</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/contact">Contact us</Link>
              </Button>
            </div>
          </section>
        </div>
      </article>
    </Container>
  );
}
