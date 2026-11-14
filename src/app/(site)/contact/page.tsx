import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { business } from "@/config/business";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "How to reach Seatora about your account, payments, refunds, data or residents' names. We reply within 2 working days.",
};

const link = "inline-flex min-h-11 items-center text-sky underline";

export default function ContactPage() {
  const { email, sellerName, address, phone } = business;
  // Only the details that are set.
  const rows = [
    email && { label: "Email", value: <a href={`mailto:${email}`} className={link}>{email}</a> },
    sellerName && { label: "Name", value: sellerName },
    address && { label: "Address", value: <address className="not-italic whitespace-pre-line">{address}</address> },
    phone && { label: "Phone", value: <a href={`tel:${phone.replace(/\s/g, "")}`} className={link}>{phone}</a> },
  ].filter((r) => !!r);
  return (
    <Container className="py-20 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Contact</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Contact Us</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: <time dateTime="2026-11-14">14 November 2026</time></p>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground">
          <p>
            Seatora is run by {sellerName ? `${sellerName}, an individual` : "an individual"} in India. Write to us about
            your account, payments, refunds, your data or a resident&apos;s name.
          </p>
          {rows.length > 0 && (
            <dl className="grid gap-4">
              {rows.map((r) => (
                <div key={r.label}>
                  <dt className="font-mono text-xs uppercase tracking-widest">{r.label}</dt>
                  <dd className="mt-1 text-foreground">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p>We reply within 2 working days.</p>
        </div>
      </article>
    </Container>
  );
}
