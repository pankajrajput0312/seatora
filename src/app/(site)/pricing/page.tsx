import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { business } from "@/config/business";
import { formatINR } from "@/features/cutoffs/lib/format";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Seatora costs ${formatINR(business.price)} ${business.period}: a one-time payment for that season, with no subscription or auto-renewal.`,
};

export default function PricingPage() {
  return (
    <Container className="py-20 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Pricing</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          <span className="numeric">{formatINR(business.price)}</span> {business.period}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: <time dateTime="2026-11-14">14 November 2026</time></p>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-foreground">
          <section>
            <h2>What you pay</h2>
            <p className="mt-2">
              {formatINR(business.price)} {business.period}, paid once for that season. There is no subscription and nothing renews
              automatically. Prices are in Indian Rupees (INR).
            </p>
            <p className="mt-2">{business.season}</p>
          </section>
          <section>
            <h2>What you get</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Past MCC allotments and closing ranks.</li>
              <li>Seats, and fees, stipends, bonds and penalties, from official MCC and NBEMS documents, with each figure linked to its source.</li>
              <li>Names of residents from MCC&apos;s official admitted-candidates lists.</li>
            </ul>
            <p className="mt-2">
              The data is historical, can contain errors and is no guarantee or prediction of admission. Check the official documents before
              choice filling. Seatora is not affiliated with or endorsed by MCC, NBEMS, NMC or any government body.
            </p>
          </section>
          <section>
            <h2>Refunds</h2>
            <p className="mt-2">
              Once access has been granted, the payment is not refundable. See our{" "}
              <Link href="/refund-policy" className="text-sky underline">Refund &amp; Cancellation Policy</Link> for the exceptions.
            </p>
          </section>
          <section>
            <h2>Getting access</h2>
            <p className="mt-2">Access is invite-only right now.</p>
            <Button asChild className="mt-4">
              <Link href="/contact">Contact us</Link>
            </Button>
          </section>
        </div>
      </article>
    </Container>
  );
}
