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
            <p className="mt-2">When you join early access, we store your email address, the NEET PG year you chose and the time you signed up. Nothing else.</p>
          </section>
          <section>
            <h2>Why</h2>
            <p className="mt-2">Only to tell you when the MEDPATH planner opens for your counselling year. We don&apos;t sell or share your email, and we don&apos;t send marketing from third parties.</p>
          </section>
          <section>
            <h2>How long</h2>
            <p className="mt-2">Until the planner launches for your year, or until you ask us to delete it, whichever comes first.</p>
          </section>
          <section>
            <h2>Your rights</h2>
            <p className="mt-2">
              Under India&apos;s Digital Personal Data Protection Act, 2023, you can ask to see, correct or erase your data and withdraw consent at any time
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
