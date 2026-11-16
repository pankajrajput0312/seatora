import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { business } from "@/config/business";
import { FreePrice } from "@/components/marketing/free-price";
import { askConfig } from "@/features/ask/config";
import { getCurrentUser } from "@/features/auth/lib/session";
import { paymentsOn, PLANS } from "@/features/payments/plans";
import { PlanCards } from "@/features/plans/components/plan-cards";
import { freeNow, longDate, shortDate } from "@/features/plans/plans";
import { SEASON_PASS_UNTIL } from "@/features/payments/grant";
import { InviteBanner } from "@/features/referrals/components/invite-banner";
import { discountedPrice, formatPaise, REF_COOKIE, REFERRAL_PERCENT } from "@/features/referrals/lib";
import { quote } from "@/features/referrals/service";

export const metadata: Metadata = {
  title: "Pricing — Seatora NEET PG 2026 Season Pass",
  description: `The Seatora NEET PG 2026 Season Pass: ${formatPaise(PLANS.season_pass.amount)} (was ${formatPaise(PLANS.season_pass.wasAmount)}) ${business.period}, paid once, with no subscription or auto-renewal. Free and Season Pass limits compared.`,
};

/** Rendered per request: her price (a referral), her Season Pass, and whether the free period and payments are on. */
export default async function PricingPage() {
  const user = await getCurrentUser();
  const q = await quote(user?.id ?? null, (await cookies()).get(REF_COOKIE)?.value);
  const free = freeNow();
  const paying = paymentsOn();
  const askOpen = askConfig().enabled && process.env.ASK_FOR_MEMBERS === "1";
  return (
    <Container className="py-10 md:py-28">
      <article className="max-w-prose">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Pricing</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Seatora NEET PG 2026 Season Pass</h1>
        {q.inviter && <InviteBanner inviter={q.inviter} className="mt-4" />}
        <p className="mt-3 text-2xl font-semibold">
          <FreePrice /> <span className="text-base font-normal text-muted-foreground">{business.period}</span>
        </p>
        <p className="mt-3 text-muted-foreground">
          Online NEET PG counselling planner for MCC All India counselling: Round 2 seats, past closing ranks, fees, stipends and bonds, and
          residents at each college, from official MCC, NBEMS and NMC documents. A free account opens the planner straight away.
        </p>
        <section id="buy" aria-labelledby="plans-h" className="mt-8 scroll-mt-24 md:w-[44rem]">
          <h2 id="plans-h" className="text-lg font-medium">Free and Season Pass</h2>
          <PlanCards className="mt-3" />
          <p className="mt-3 text-sm text-muted-foreground">
            Limits reset at 00:00 IST. {free && `Everything has Season Pass limits till ${shortDate(free)}. `}
            {!askOpen && "Ask Seatora is in beta and opens to members later."}
          </p>
        </section>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: <time dateTime="2026-11-16">16 November 2026</time></p>
        <div className="mt-8 grid gap-6 leading-relaxed text-muted-foreground [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-foreground">
          <section>
            <h2>What you pay</h2>
            {paying ? (
              <p className="mt-2">
                The Season Pass costs <s>{formatPaise(PLANS.season_pass.wasAmount)}</s> {formatPaise(q.listAmount)} {business.period}, paid once by card or UPI through Razorpay
                ({formatPaise(discountedPrice(q.listAmount))} with a friend&apos;s referral link), and runs till {longDate(SEASON_PASS_UNTIL)}.{" "}
                {free && `Till ${shortDate(free)} you can also upgrade free, with no payment; that free upgrade ends on ${shortDate(free)}. `}There is no
                subscription and nothing renews automatically. Prices are in Indian Rupees (INR).
              </p>
            ) : (
              <p className="mt-2">
                {free ? `Till ${shortDate(free)} you can upgrade to the Season Pass free` : "Paid passes open soon"} (regular price{" "}
                <s>{formatPaise(PLANS.season_pass.wasAmount)}</s> {formatPaise(PLANS.season_pass.amount)}). Nothing is charged right now, there is no subscription and nothing renews automatically.
                Any price is in Indian Rupees (INR).
              </p>
            )}
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
            <h2>Refer a friend</h2>
            <p className="mt-2">
              Share your link from <Link href="/decide/refer" className="text-sky underline">Refer &amp; earn</Link>: your friend gets{" "}
              {REFERRAL_PERCENT}% off the Season Pass and you get {REFERRAL_PERCENT}% of what they pay, sent to your UPI.
            </p>
          </section>
          <section>
            <h2>Refunds</h2>
            <p className="mt-2">
              {paying ? "A Season Pass payment is not refundable once access has been granted; the free upgrade costs nothing." : "Nothing is charged right now. For any future paid purchase, the payment is not refundable once access has been granted."}{" "}
              See our <Link href="/refund-policy" className="text-sky underline">Refund &amp; Cancellation Policy</Link> for the exceptions.
            </p>
          </section>
          <section>
            <h2>How to get it</h2>
            <p className="mt-2">
              {paying
                ? `Create a free account with your email address, then ${free ? "upgrade free or " : ""}buy the Season Pass above. A paid pass is switched on the moment the payment is confirmed.`
                : `Click Create free account and sign up with your email address${free ? ", then upgrade free above" : ""}. Access is switched on for your account immediately.`}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {!user && (
                <Button asChild>
                  <Link href="/signup">Create free account</Link>
                </Button>
              )}
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
