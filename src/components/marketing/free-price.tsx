import { business } from "@/config/business";
import { PLANS } from "@/features/payments/plans";
import { freeNow, shortDate } from "@/features/plans/plans";
import { discountedPrice, formatPaise } from "@/features/referrals/lib";

const { amount, wasAmount } = PLANS.season_pass;

/**
 * While FREE_FOR_ALL_UNTIL is ahead: "₹0 ~~₹499~~ Free till 20 Nov", read out as "Was ₹499, now free till 20 November".
 * After it: "~~₹499~~ ₹199". The prices come from PLANS, the date from FREE_FOR_ALL_UNTIL.
 */
export function FreePrice({ className }: { className?: string }) {
  const free = freeNow();
  if (!free)
    return (
      <span className={className}>
        <span className="sr-only">Was {formatPaise(wasAmount)}, now {formatPaise(amount)}</span>
        <span aria-hidden>
          <s className="numeric font-normal text-muted-foreground">{formatPaise(wasAmount)}</s> <span className="numeric">{formatPaise(amount)}</span>
        </span>
      </span>
    );
  const long = free.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  return (
    <span className={className}>
      <span className="sr-only">Was {formatPaise(wasAmount)}, now free till {long}</span>
      <span aria-hidden>
        <span className="numeric">{formatPaise(0)}</span>{" "}
        <s className="numeric font-normal text-muted-foreground">{formatPaise(wasAmount)}</s> Free till {shortDate(free)}
      </span>
    </span>
  );
}

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
