import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SeasonPassPrice } from "@/components/marketing/free-price";
import { business } from "@/config/business";

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy",
  description: "Seatora is an online service: nothing physical is shipped. Access is switched on for your account immediately.",
};

export default function ShippingPolicyPage() {
  const { email } = business;
  const mail = email && <a href={`mailto:${email}`} className="text-sky underline">{email}</a>;
  return (
    <Container className="py-10 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Shipping &amp; Delivery Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: <time dateTime="2026-11-16">16 November 2026</time></p>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-foreground">
          <section>
            <h2>Shipping</h2>
            <p className="mt-2">Seatora is an online service. Nothing physical is shipped.</p>
          </section>
          <section>
            <h2>Delivery</h2>
            <p className="mt-2">
              <SeasonPassPrice /> A free account (and the free upgrade) is switched on immediately; a paid Season Pass immediately after
              your payment is confirmed.
            </p>
            <p className="mt-2">
              If you have paid and don&apos;t have access, email us{mail && <> at {mail}</>} or use our{" "}
              <Link href="/contact" className="text-sky underline">Contact</Link> page. If access is never granted, you get a full refund
              under our <Link href="/refund-policy" className="text-sky underline">Refund &amp; Cancellation Policy</Link>.
            </p>
          </section>
        </div>
      </article>
    </Container>
  );
}
