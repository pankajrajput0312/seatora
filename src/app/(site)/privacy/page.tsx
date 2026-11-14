import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  const contact = siteConfig.contactEmail;
  return (
    <Container className="py-20 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Privacy</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Privacy notice</h1>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-foreground">
          <section>
            <h2>What we collect</h2>
            <p className="mt-2">
              If you create an account, we store your name, email address and a one-way hash of your password (never the password
              itself), plus two strictly necessary cookies that keep you signed in, a record of each sign-in session (when it started and expires), and a count of recent failed sign-in attempts used to protect your account. We don&apos;t use tracking or advertising cookies.
            </p>
            <p className="mt-2">When you join early access, we store your email address, the NEET PG year you chose and the time you signed up. To stop abuse, your IP address is checked briefly in memory when you submit the form and is not stored with your sign-up; our hosting provider may keep standard server logs.</p>
          </section>
          <section>
            <h2>Why</h2>
            <p className="mt-2">To run your account, and to tell you when the Seatora planner opens for your counselling year. We don&apos;t sell or share your email, and we don&apos;t send marketing from third parties.</p>
          </section>
          <section>
            <h2>How long</h2>
            <p className="mt-2">Account data is kept until you ask us to delete your account. Early-access emails are kept until the planner launches for your year or until you ask us to delete them, whichever comes first.</p>
          </section>
          <section>
            <h2>Your rights</h2>
            <p className="mt-2">
              Under India&apos;s Digital Personal Data Protection Act, 2023, you can ask to see, correct or erase your data, withdraw consent, or raise a complaint at any time
              {contact ? (
                <> by writing to <a href={`mailto:${contact}`} className="text-sky underline">{contact}</a>.</>
              ) : (
                <> by replying to any email from us.</>
              )}
            </p>
          </section>
        </div>
      </article>
    </Container>
  );
}
