import { cookies } from "next/headers";
import Link from "next/link";
import { getCurrentUser } from "@/features/auth/lib/session";
import { ClaimFreePass } from "@/features/plans/components/claim-free-pass";
import { freeNow, longDate, passState, shortDate } from "@/features/plans/plans";
import { formatPaise, REF_COOKIE } from "@/features/referrals/lib";
import { quote } from "@/features/referrals/service";
import { cn } from "@/lib/cn";
import { paymentsOn, PLANS } from "../plans";
import { priceFor } from "../service";
import { BuySeasonPass } from "./buy-season-pass";
import { CouponForm } from "./coupon-form";

/**
 * The Season Pass call to action everywhere (Pricing #buy, the planner's home, the paywall, the account page), from her
 * state on the server (plans.ts passState):
 * - a Season Pass beyond the free period, or staff: "Season Pass active till 31 Mar 2027";
 * - in the free period: one button, "Upgrade free till 20 Nov" (the free claim; or "Season Pass · free till 20 Nov" once
 *   done), and "Have a coupon?" (CouponForm: a 100% coupon gives the whole season). No paid option while it is free;
 * - after it: "Upgrade for ~~₹499~~ ₹199" ("Upgrade for ~~₹499~~ ₹159 with Rahul's invite" with a referrer: her own, or the /r/
 *   cookie's code; "… with coupon X" with a coupon), or "Payments open soon" and "Have a coupon?";
 * - signed out: the same words, to /signup?next=/pricing#buy.
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

  if (!user)
    return (
      <Link href={`/signup?${new URLSearchParams({ next: `/pricing${coupon ? `?coupon=${coupon}` : ""}#buy` })}`} data-upgrade="" className={cn("inline-flex items-center justify-center", className)}>
        {claimLabel ||
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

  const couponForm = <CouponForm initialCode={coupon} noteClassName={noteClassName} />;
  if (!free || !s || s.state === "free") {
    if (!q)
      return (
        <div>
          <p className={cn(text, "font-semibold")}>Payments open soon</p>
          {couponForm}
        </div>
      );
    const c = coupon ? await priceFor(user.id, coupon) : null; // ?coupon=: priced as if she had typed it
    const ok = c && !c.error ? c : null;
    const p = ok ?? q;
    const offer = { amount: p.amount, listAmount: p.listAmount, inviter: p.inviter, coupon: ok?.coupon ?? null, code: ok ? (coupon ?? null) : q.referrerId ? code : null };
    const initial = coupon ? { code: coupon, error: c?.error ?? null } : undefined;
    return <BuySeasonPass offer={offer} initial={initial} verb="Upgrade" className={className} noteClassName={noteClassName} />;
  }

  return (
    <div>
      {s.state === "claimed" ? (
        <p className={cn(text, "font-semibold")} role="status">Season Pass · free till {shortDate(free)}</p>
      ) : (
        <ClaimFreePass label={claimLabel} className={className} noteClassName={noteClassName} />
      )}
      {couponForm}
    </div>
  );
}
