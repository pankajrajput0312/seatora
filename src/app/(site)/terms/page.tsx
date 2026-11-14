import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { business } from "@/config/business";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms for using Seatora, an independent NEET PG counselling planner: accounts, acceptable use, disclaimers and liability.",
};

export default function TermsPage() {
  const { email, sellerName } = business;
  const mail = email && <a href={`mailto:${email}`} className="text-sky underline">{email}</a>;
  return (
    <Container className="py-20 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Terms &amp; Conditions</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: <time dateTime="2026-11-14">14 November 2026</time></p>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-foreground">
          <section>
            <h2>About these terms</h2>
            <p className="mt-2">
              These terms apply to Seatora, an online NEET PG counselling planner run by{" "}
              {sellerName ? `${sellerName}, an individual` : "an individual"} in India (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
              By using Seatora you agree to them.
            </p>
          </section>
          <section>
            <h2>The service</h2>
            <p className="mt-2">
              Seatora shows past MCC allotments and closing ranks, seats, and fees, stipends, bonds and penalties taken from official MCC
              and NBEMS documents, with a link to the source of each figure. It also shows names of residents from MCC&apos;s official
              admitted-candidates lists.
            </p>
            <p className="mt-2">Seatora is not affiliated with or endorsed by MCC, NBEMS, NMC or any government body.</p>
          </section>
          <section>
            <h2>Who may use it</h2>
            <p className="mt-2">
              Seatora is for NEET PG candidates and people helping them choose a seat. You must be at least 18 years old. Access is by
              invitation only at present.
            </p>
          </section>
          <section>
            <h2>Your account</h2>
            <p className="mt-2">
              One account per person. Don&apos;t share your account or let anyone else sign in with it. Keep your password safe, and tell us
              straight away if you think someone else has used your account.
            </p>
          </section>
          <section>
            <h2>Acceptable use</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Don&apos;t scrape, copy or redistribute the data, for free or for money.</li>
              <li>Use residents&apos; names only to contact them respectfully about a college. Don&apos;t publish the names.</li>
              <li>No harassment and no spam.</li>
              <li>Don&apos;t try to get around the site&apos;s security or access controls.</li>
            </ul>
            <p className="mt-2">We may suspend or close an account that breaks these rules.</p>
          </section>
          <section>
            <h2>Payments and refunds</h2>
            <p className="mt-2">
              The price is on our <Link href="/pricing" className="text-sky underline">Pricing</Link> page. {business.season} Refunds and
              cancellations are covered by our <Link href="/refund-policy" className="text-sky underline">Refund &amp; Cancellation Policy</Link>.
            </p>
          </section>
          <section>
            <h2>Intellectual property</h2>
            <p className="mt-2">
              Seatora&apos;s design, text and code are ours. The official documents belong to their publishers, and we link to them. Your
              access is for your own counselling decisions and gives you no right to reuse our compilation of the data.
            </p>
          </section>
          <section>
            <h2>Disclaimers</h2>
            <p className="mt-2">
              The data is historical. We compile it from official documents, and it can contain errors or omissions. It is not official,
              and it is no guarantee or prediction of admission. Always check the official MCC, NBEMS and college documents before choice
              filling. Seatora is provided as it is, without any warranty.
            </p>
          </section>
          <section>
            <h2>Limitation of liability</h2>
            <p className="mt-2">
              To the extent the law allows, we are not liable for decisions you make using Seatora or for any indirect loss. Our total
              liability to you is limited to the amount you paid us.
            </p>
          </section>
          <section>
            <h2>Changes to these terms</h2>
            <p className="mt-2">We may change these terms. The date at the top shows when they last changed. Using Seatora after a change means you accept the new terms.</p>
          </section>
          <section>
            <h2>Governing law</h2>
            <p className="mt-2">These terms are governed by the laws of India, and disputes are subject to the courts of India.</p>
          </section>
          <section>
            <h2>Contact</h2>
            <p className="mt-2">
              Questions about these terms: email us{mail && <> at {mail}</>}, or see our{" "}
              <Link href="/contact" className="text-sky underline">Contact</Link> page.
            </p>
          </section>
        </div>
      </article>
    </Container>
  );
}
