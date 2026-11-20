import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { siteConfig } from "@/config/site";
import { getCurrentUser, requireDecideAccess } from "@/features/auth/lib/session";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { StatStrip } from "@/features/decide/components/ui";
import { TrackView } from "@/features/funnel/components/beacon";
import { SEASON_PASS_UNTIL } from "@/features/payments/grant";
import { PLANS, paymentsOn } from "@/features/payments/plans";
import { ownedCoupons } from "@/features/payments/service";
import { freeNow, longDate, shortDate } from "@/features/plans/plans";
import { ShareLink } from "@/features/referrals/components/share-link";
import { UpiForm } from "@/features/referrals/components/upi-form";
import { discountedPrice, earningFor, formatPaise, REFERRAL_PERCENT } from "@/features/referrals/lib";
import { myReferrals } from "@/features/referrals/service";

// Refer & earn (docs/REFERRALS.md): her link, how it works, her numbers, her UPI ID for payouts, the rules.

export const metadata: Metadata = { title: "Refer & earn", robots: { index: false, follow: false } };
const PATH = "/decide/refer";

export default async function ReferPage() {
  await requireDecideAccess(PATH);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?${new URLSearchParams({ next: PATH })}`);
  const [{ code, payoutUpi, ...stats }, coupons] = await Promise.all([myReferrals(user.id), ownedCoupons(user.id)]);
  const list = PLANS.season_pass.amount;
  const price = discountedPrice(list);
  const free = freeNow();
  const url = `${siteConfig.url}/r/${code}`;
  // The free window: nothing to discount yet, so say when the discount starts.
  const message = free
    ? `Seatora is free till ${shortDate(free)} — then ${REFERRAL_PERCENT}% off with my link:`
    : `I'm planning NEET PG counselling on Seatora. Sign up with my link for ${REFERRAL_PERCENT}% off the Season Pass:`;

  return (
    <AppPage className="grid max-w-3xl grid-cols-1 gap-6">
      <TrackView name="referral_page_view" />
      <PageHead title="Refer & earn" about={`Your friend gets ${REFERRAL_PERCENT}% off the Season Pass; you get ${REFERRAL_PERCENT}% of what they pay.`} />
      {(free || !paymentsOn()) && (
        <p className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
          {!paymentsOn()
            ? `Paid passes aren't open yet, so discounts and earnings start when they open. Sharing works now: friends who sign up through your link get their ${REFERRAL_PERCENT}% off when they buy.`
            : `The Season Pass is free for everyone till ${shortDate(free!)}. Share your link now: after that, friends who buy it get ${REFERRAL_PERCENT}% off, and you earn ${REFERRAL_PERCENT}% of what they pay.`}
        </p>
      )}

      {/* Her own coupons (Coupon.ownerId, e.g. DRTARAL): each one's link, as the referral link is shared. */}
      {coupons.map((c) => (
        <section key={c.code} aria-labelledby={`coupon-${c.code}-h`} className="rounded-xl border border-wash-line bg-wash p-4 sm:p-6">
          <h2 id={`coupon-${c.code}-h`} className="text-title font-semibold">Your {c.percentOff}% off link</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            {c.percentOff >= 100 ? `Anyone who signs up with it gets the Season Pass free till ${longDate(SEASON_PASS_UNTIL)}.` : `Anyone who signs up with it gets ${c.percentOff}% off the Season Pass.`}{" "}
            Used <span className="numeric">{c.uses}</span> {c.uses === 1 ? "time" : "times"} so far.
          </p>
          <ShareLink url={`${siteConfig.url}/r/${c.code}`} message={c.percentOff >= 100 ? `Get Seatora's NEET PG Season Pass free with my link (code ${c.code}):` : `${c.percentOff}% off Seatora's NEET PG Season Pass with my link (code ${c.code}):`} />
          <p className="mt-2 text-xs text-muted-foreground">Code: <span className="numeric font-semibold text-foreground">{c.code}</span></p>
        </section>
      ))}

      <section aria-label="Your link" className="rounded-xl border border-border bg-card p-4 sm:p-6">
        {coupons.length > 0 && <h2 className="mb-3 text-title font-semibold">Your {REFERRAL_PERCENT}% off link</h2>}
        <ShareLink url={url} message={message} />
        <p className="mt-2 text-xs text-muted-foreground">Your code: <span className="numeric font-semibold text-foreground">{code}</span></p>
      </section>

      <section aria-labelledby="how-h" className="grid gap-2">
        <h2 id="how-h" className="text-h2 font-semibold">How it works</h2>
        <ol className="grid gap-1 pl-5 text-sm [list-style:decimal]">
          <li>Your friend gets {REFERRAL_PERCENT}% off the Season Pass: <span className="numeric font-semibold">{formatPaise(price)}</span> instead of <span className="numeric">{formatPaise(list)}</span>.</li>
          <li>You get {REFERRAL_PERCENT}% of what they pay: <span className="numeric font-semibold">{formatPaise(earningFor(price))}</span> for each friend, paid to your UPI.</li>
        </ol>
      </section>

      <section aria-labelledby="stats-h" className="grid gap-2">
        <h2 id="stats-h" className="text-h2 font-semibold">Your referrals</h2>
        <StatStrip
          items={[
            { label: "Friends signed up", value: <span className="numeric">{stats.signedUp}</span> },
            { label: "Friends who paid", value: <span className="numeric">{stats.paid}</span> },
            { label: "Pending", value: <span className="numeric">{formatPaise(stats.pending)}</span>, note: "To be paid to your UPI" },
            { label: "Paid out", value: <span className="numeric">{formatPaise(stats.paidOut)}</span> },
          ]}
        />
      </section>

      <section aria-labelledby="upi-h" id="upi" className="grid gap-2">
        <h2 id="upi-h" className="text-h2 font-semibold">Your UPI ID for payouts</h2>
        <UpiForm upi={payoutUpi} />
      </section>

      <section aria-labelledby="rules-h" className="grid gap-1 text-sm text-muted-foreground">
        <h2 id="rules-h" className="text-title font-semibold text-foreground">Rules</h2>
        <p>We pay by UPI to the ID above within 7 days after your friend&apos;s payment and any refund window.</p>
        <p>No self-referral: your own code gives you nothing, and each friend gets the discount once, on their first purchase.</p>
        <p>Seatora may withhold or cancel earnings for abuse or duplicate accounts. See the <Link href="/terms#referrals" className="text-sky underline">terms</Link>.</p>
      </section>
    </AppPage>
  );
}
