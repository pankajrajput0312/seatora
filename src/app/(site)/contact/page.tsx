import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { business } from "@/config/business";
import { RequestForm } from "@/features/requests/components/request-form";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta("/contact", {
  title: "Contact Us",
  description: "How to reach Seatora about your account, payments, refunds, data or residents' names. We reply within 2 working days.",
});

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
    <Container className="py-10 md:py-28">
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
        <section aria-labelledby="request-h" className="mt-12 border-t border-border pt-10">
          <h2 id="request-h" className="text-xl font-semibold tracking-tight">Request a feature or customization</h2>
          <p className="mt-2 mb-6 text-sm leading-relaxed text-muted-foreground">
            Ask for a new feature, a change for your own use, a correction to our data or anything else. You don&apos;t need an account.
          </p>
          <RequestForm page="/contact" />
        </section>
      </article>
    </Container>
  );
}
