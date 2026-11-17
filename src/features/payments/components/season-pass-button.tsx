import { cookies } from "next/headers";
import Link from "next/link";
import { getCurrentUser } from "@/features/auth/lib/session";
import { ClaimFreePass } from "@/features/plans/components/claim-free-pass";
import { freeNow, longDate, passState, shortDate } from "@/features/plans/plans";
import { formatPaise, REF_COOKIE } from "@/features/referrals/lib";
import { quote } from "@/features/referrals/service";
import { cn } from "@/lib/cn";
import type { CouponBannerInfo } from "../coupons";
import { SEASON_PASS_UNTIL } from "../grant";
import { paymentsOn, PLANS } from "../plans";
import { priceFor } from "../service";
import { BuySeasonPass } from "./buy-season-pass";
import { ApplyCoupon, CouponForm } from "./coupon-form";

/**
 * The Season Pass call to action everywhere (Pricing #buy, the planner's home, the paywall, the account page), from her
 * state on the server (plans.ts passState):
 * - a Season Pass beyond the free period, or staff: "Season Pass active till 31 Mar 2027";
 * - in the free period: "Upgrade free till 20 Nov" (the free claim; or "Season Pass · free till 20 Nov" once done), and
 *   under it, as a link, the paid pass for the whole season: "Or get it till 31 Mar 2027 for ~~₹499~~ ₹199" ("Keep it…"
 *   once claimed; its own "Have a coupon?"), or CouponForm while payments are off;
 * - after it: "Upgrade for ~~₹499~~ ₹199" ("Upgrade for ~~₹499~~ ₹159 with Rahul's invite" with a referrer: her own, or the /r/
 *   cookie's code; "… with coupon X" with a coupon), or "Payments open soon" and "Have a coupon?";
 * - signed out: the same words, to /signup?next=/pricing#buy;
 * - a valid 100% ?coupon= (any of these but a pass): "Apply DRTARAL: free till 31 Mar 2027" in their place (ApplyCoupon;
 *   signed out, to /signup?coupon=, which lands on the plan page with it).
 * `className`: the primary button; `noteClassName`: text (and the secondary button's colour). Each Upgrade carries
 * data-upgrade: a click is an upgrade_click at the nearest data-placement (docs/FUNNEL.md). `coupon`: the page's
 * ?coupon=, applied to the price (or filled into "Have a coupon?") and kept through sign-up. `freeLabel`: the free
 * claim's words in place of "Upgrade for ~~₹499~~ ₹0" (Decide's home: "Get free Season Pass", its price shown beside it).
 */
export async function SeasonPassButton({ className, noteClassName, coupon, freeLabel }: { className?: string; noteClassName?: string; coupon?: string | null; freeLabel?: string }) {
  const user = await getCurrentUser();
  const s = user && passState(user);
  const text = cn("text-sm", noteClassName);
  if (s && (s.state === "staff" || s.state === "pass"))
    return <p className={cn(text, "font-semibold")} role="status">Season Pass active{s.until ? ` till ${longDate(s.until)}` : ""}</p>;

  const free = freeNow();
  const code = (await cookies()).get(REF_COOKIE)?.value ?? null;
  const q = paymentsOn() ? await quote(user?.id ?? null, code) : null;
  const was = formatPaise(PLANS.season_pass.wasAmount); // struck beside every price
  const claimLabel = free && (freeLabel ?? <span>Upgrade free till {shortDate(free)}</span>);

  const c = coupon ? await priceFor(user?.id ?? null, coupon) : null; // ?coupon=: priced as if she had typed it
  const ok = c && !c.error ? c : null;
  const season = longDate(SEASON_PASS_UNTIL);
  const freeCoupon = ok?.coupon && ok.amount === 0 ? ok.coupon : null;
  const applyLabel = freeCoupon && `Apply ${freeCoupon}: free till ${season}`;

  if (!user)
    return (
      <Link href={coupon ? `/signup?${new URLSearchParams({ coupon })}` : `/signup?${new URLSearchParams({ next: "/pricing#buy" })}`} data-upgrade="" className={cn("inline-flex items-center justify-center", className)}>
        {applyLabel || claimLabel ||
          (q ? (
            <span>
              Upgrade for {q.amount < PLANS.season_pass.wasAmount && <s className="mr-1 opacity-70">{was}</s>}
              {formatPaise(q.amount)}
              {q.inviter ? ` with ${q.inviter}'s invite` : ""}
            </span>
          ) : (
            "Create free account"
          ))}
      </Link>
    );

  if (freeCoupon) return <ApplyCoupon code={freeCoupon} label={`Apply ${freeCoupon}: free till ${season}`} done={`Season Pass till ${season}`} className={className} noteClassName={noteClassName} />;
  const couponForm = <CouponForm initialCode={coupon} done={`Season Pass till ${season}`} noteClassName={noteClassName} />;
  // The paid pass through Razorpay (null while payments are off).
  const buy = (verb: string, buttonClass?: string) => {
    if (!q) return null;
    const p = ok ?? q;
    const offer = { amount: p.amount, listAmount: p.listAmount, inviter: p.inviter, coupon: ok?.coupon ?? null, code: ok ? (coupon ?? null) : q.referrerId ? code : null };
    const initial = coupon ? { code: coupon, error: c?.error ?? null } : undefined;
    return <BuySeasonPass offer={offer} initial={initial} verb={verb} className={buttonClass} noteClassName={noteClassName} />;
  };
  if (!free || !s || s.state === "free")
    return (
      buy("Upgrade", className) ?? (
        <div>
          <p className={cn(text, "font-semibold")}>Payments open soon</p>
          {couponForm}
        </div>
      )
    );
  // One Season Pass, one button (the free upgrade); paying is a line that says what it buys: the whole season.
  const pay = buy(`${s.state === "claimed" ? "Keep it" : "Or get it"} till ${season}`, "min-h-11 justify-start text-left text-sm font-semibold underline underline-offset-4 hover:opacity-80");

  return (
    <div>
      {s.state === "claimed" ? (
        <p className={cn(text, "font-semibold")} role="status">Season Pass · free till {shortDate(free)}</p>
      ) : (
        <ClaimFreePass label={claimLabel} done={`Season Pass active till ${shortDate(free)}`} className={className} noteClassName={noteClassName} />
      )}
      {pay ? <div className="mt-1">{pay}</div> : couponForm}
    </div>
  );
}

/** The ?coupon= banner on Pricing, sign-up and the plan page (couponCheck): what the code gives, or quietly why it gives nothing. */
export function CouponBanner({ b, className }: { b: CouponBannerInfo | null; className?: string }) {
  if (!b) return null;
  return b.ok ? (
    <p role="status" className={cn("rounded-md border border-sky/40 bg-sky/10 px-3 py-2 text-sm font-semibold text-foreground", className)}>{b.text}</p>
  ) : (
    <p role="status" className={cn("text-sm text-muted-foreground", className)}>{b.text}</p>
  );
}
