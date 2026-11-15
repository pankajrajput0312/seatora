import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { business } from "@/config/business";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Seatora collects, why, where it is stored, the cookies it uses, how long data is kept and how to have it deleted.",
};

export default function PrivacyPage() {
  const { email, sellerName } = business;
  const mail = email && <a href={`mailto:${email}`} className="text-sky underline">{email}</a>;
  return (
    <Container className="py-20 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: <time dateTime="2026-11-15">15 November 2026</time></p>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-foreground">
          <section>
            <h2>Who we are</h2>
            <p className="mt-2">
              Seatora is an online NEET PG counselling planner run by {sellerName ? `${sellerName}, an individual` : "an individual"} in India. This policy explains what we collect and what we do with it.
            </p>
          </section>
          <section>
            <h2>What we collect</h2>
            <p className="mt-2">
              Accounts are by invitation only. For an account we store your name, your email address and a one-way hash of your password
              (never the password itself), a record of each sign-in session (when it started and when it expires), and a count of recent
              failed sign-in attempts, used to protect your account.
            </p>
            <p className="mt-2">
              The rank, category, PwD status, filters and choice lists you enter in the planner are saved only in your browser&apos;s local
              storage, not in our database. They are also put in page addresses so the server can show your results, so they can appear
              in our hosting provider&apos;s request logs. Clearing this site&apos;s data in your browser removes them.
            </p>
            <p className="mt-2">If you write to us or leave your email address with us, we store that email address, the NEET PG year you chose and the time.</p>
            <p className="mt-2">
              If you send us a request (from the Contact page or inside the planner), we store your message, its type, your email address,
              the page you sent it from and the time, and link it to your account if you are signed in.
            </p>
            <p className="mt-2">To stop abuse, your IP address is held in memory for up to a day to limit repeated requests, and we don&apos;t store it. Our hosting provider may keep standard server logs.</p>
          </section>
          <section>
            <h2>Cookies</h2>
            <p className="mt-2">
              Seatora uses three strictly necessary cookies and no others: a sign-in cookie that keeps you signed in, a small flag cookie
              with no personal data that lets the page header show your account link, and an access cookie that lets your browser through
              the site&apos;s access check. Each expires after 30 days, and signing out removes all three. We use no
              analytics, tracking or advertising cookies.
            </p>
          </section>
          <section>
            <h2>Where it is stored</h2>
            <p className="mt-2">Your data is kept in a database hosted by Supabase in its Singapore region. The website is hosted on Vercel.</p>
          </section>
          <section>
            <h2>Why we use it</h2>
            <p className="mt-2">
              To run your account and the site, to keep them secure, to reply to your requests, and to tell people who left their email
              when the planner opens for their NEET PG year. We don&apos;t sell your data, we don&apos;t show ads, and we don&apos;t send marketing from third parties.
            </p>
          </section>
          <section>
            <h2>Residents&apos; names</h2>
            <p className="mt-2">
              Seatora shows the names of residents at each college, with their course, their year and, where NBEMS has published it, their
              NEET PG All India Rank. The names come from MCC&apos;s official admitted-candidates lists and the ranks from that year&apos;s NBEMS
              NEET PG result, both public documents. We hold no contact details for anyone on them. Names are shown only to signed-in accounts that
              have been given access. We never show a category beside a name, but a rank shown with a name can be looked up in MCC&apos;s public
              allotment results, which Seatora also shows and which list each rank&apos;s seat and candidate category, PwD included.
            </p>
            <p className="mt-2">
              If your name is listed and you want it removed, email us{mail && <> at {mail}</>}. We will hide it from the site and keep it
              hidden when the lists are refreshed.
            </p>
          </section>
          <section>
            <h2>How long we keep it</h2>
            <p className="mt-2">Account data is kept until you ask us to delete your account. Emails left with us for a NEET PG year are kept until the planner opens for that year or until you ask us to delete them, whichever comes first. Requests are kept until you ask us to delete them or your account.</p>
          </section>
          <section>
            <h2>Your rights</h2>
            <p className="mt-2">
              Under India&apos;s Digital Personal Data Protection Act, 2023, you can ask to see, correct or delete your data, withdraw
              consent, or raise a complaint at any time by emailing us{mail && <> at {mail}</>}.
              {sellerName && <> Complaints are handled by {sellerName}.</>} We reply within 2 working days. See also our{" "}
              <Link href="/terms" className="text-sky underline">Terms &amp; Conditions</Link>.
            </p>
          </section>
          <section>
            <h2>Changes</h2>
            <p className="mt-2">When this policy changes, we update it here and change the date at the top.</p>
          </section>
        </div>
      </article>
    </Container>
  );
}
