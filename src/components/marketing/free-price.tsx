import { business } from "@/config/business";
import { formatINR } from "@/features/cutoffs/lib/format";
import { freeNow, shortDate } from "@/features/plans/plans";
import { discountedPrice, formatPaise } from "@/features/referrals/lib";

/**
 * While FREE_FOR_ALL_UNTIL is ahead: "₹0 ~~₹499~~ Free till 20 Nov", read out as "Was ₹499, now free till 20 November".
 * After it: "₹499". The date always comes from FREE_FOR_ALL_UNTIL.
 */
export function FreePrice({ className }: { className?: string }) {
  const free = freeNow();
  if (!free) return <span className={`numeric ${className ?? ""}`}>{formatINR(business.regularPrice)}</span>;
  const long = free.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  return (
    <span className={className}>
      <span className="sr-only">Was {formatINR(business.regularPrice)}, now free till {long}</span>
      <span aria-hidden>
        <span className="numeric">{formatINR(0)}</span>{" "}
        <s className="numeric font-normal text-muted-foreground">{formatINR(business.regularPrice)}</s> Free till {shortDate(free)}
      </span>
    </span>
  );
}

/** The Season Pass's price for the policy pages, true before and after the free period. */
export function SeasonPassPrice() {
  const free = freeNow();
  return (
    <>
      The Seatora NEET PG 2026 Season Pass costs {formatINR(business.regularPrice)} {business.period} ({formatPaise(discountedPrice(business.regularPrice * 100))} with
      a friend&apos;s referral link), paid once by card or UPI.{free && ` Till ${shortDate(free)} anyone can also upgrade to it free; that free upgrade ends on ${shortDate(free)}.`}
    </>
  );
}
