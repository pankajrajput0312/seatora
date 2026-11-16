import { business } from "@/config/business";
import { PLANS } from "@/features/payments/plans";
import { freeNow, shortDate } from "@/features/plans/plans";
import { discountedPrice, formatPaise } from "@/features/referrals/lib";

const { amount, wasAmount } = PLANS.season_pass;

/**
 * The Season Pass's price in one line, a sentence. While FREE_FOR_ALL_UNTIL is ahead: "Free till 20 Nov. Then ₹199 once —
 * no auto-renew, no card now." After it: "~~₹499~~ ₹199 once, no auto-renew." The prices come from PLANS, the date from
 * FREE_FOR_ALL_UNTIL.
 */
export function FreePrice({ className }: { className?: string }) {
  const free = freeNow();
  if (!free)
    return (
      <span className={className}>
        <span className="sr-only">Was {formatPaise(wasAmount)}, now </span>
        <s aria-hidden className="numeric font-normal text-muted-foreground">{formatPaise(wasAmount)}</s> <span className="numeric">{formatPaise(amount)}</span> once, no auto-renew.
      </span>
    );
  return <span className={className}>{freeLine(free)}</span>;
}

/** "Free till 20 Nov. Then ₹199 once — no auto-renew, no card now." (sign-up, the plan cards, the landing page). */
export const freeLine = (free: Date) => `Free till ${shortDate(free)}. Then ${formatPaise(amount)} once — no auto-renew, no card now.`;

/** The Season Pass's price for the policy pages, true before and after the free period. */
export function SeasonPassPrice() {
  const free = freeNow();
  return (
    <>
      The Seatora NEET PG 2026 Season Pass costs <s>{formatPaise(wasAmount)}</s> {formatPaise(amount)} {business.period} ({formatPaise(discountedPrice(amount))} with
      a friend&apos;s referral link), paid once by card or UPI.{free && ` Till ${shortDate(free)} anyone can also upgrade to it free; that free upgrade ends on ${shortDate(free)}.`}
    </>
  );
}
