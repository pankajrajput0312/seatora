import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { business } from "@/config/business";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "Seatora is a digital service: no refunds once access is granted, except for duplicate charges or payments where access was never granted.",
};

export default function RefundPolicyPage() {
  const { email } = business;
  const mail = email && <a href={`mailto:${email}`} className="text-sky underline">{email}</a>;
  return (
    <Container className="py-20 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Refund &amp; Cancellation Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: <time dateTime="2026-11-14">14 November 2026</time></p>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-foreground">
          <section>
            <h2>Refunds</h2>
            <p className="mt-2">Seatora is a digital service. Once access has been granted to your account, the payment is not refundable.</p>
            <p className="mt-2">
              There are two exceptions. If you were charged twice for the same season, or your payment was taken but access was never
              granted, we refund the payment in full to the original payment method within 7 working days of your request.
            </p>
          </section>
          <section>
            <h2>Cancellation</h2>
            <p className="mt-2">You can stop using Seatora at any time. There is no subscription and no recurring charge, so there is nothing to cancel.</p>
          </section>
          <section>
            <h2>How to ask for a refund</h2>
            <p className="mt-2">
              Email us{mail && <> at {mail}</>} from the email address on your account, with the date and amount of the payment. We reply
              within 2 working days.
            </p>
          </section>
        </div>
      </article>
    </Container>
  );
}
