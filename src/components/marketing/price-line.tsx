import { SEASON_PASS_UNTIL } from "@/features/payments/grant";
import { PLANS } from "@/features/payments/plans";
import { freeNow, longDate } from "@/features/plans/plans";
import { discountedPrice, formatPaise } from "@/features/referrals/lib";

const { amount } = PLANS.season_pass;
const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "23:59 IST, 20 Nov 2026". */
export const istDateTime = (d: Date) => `${time.format(d)} IST, ${longDate(d)}`;

/**
 * The paid part of the price line: "Full access free until 23:59 IST, 20 Nov 2026; then ₹199 once for the 2026 season
 * (until 31 Mar 2027)." while FREE_FOR_ALL_UNTIL (`free`) is ahead, else "Full access: ₹199 once for the 2026 season
 * (until 31 Mar 2027)." The price is PLANS', the dates FREE_FOR_ALL_UNTIL and SEASON_PASS_UNTIL (what a payment grants).
 */
export const passLine = (free: Date | null) => {
  const pass = `${formatPaise(amount)} once for the 2026 season (until ${longDate(SEASON_PASS_UNTIL)})`;
  return free ? `Full access free until ${istDateTime(free)}; then ${pass}.` : `Full access: ${pass}.`;
};

/** Seatora's price in one plain line, the same wherever a price is stated (home, FAQ, Pricing, sign-up, the policies). */
export const priceLine = (free: Date | null = freeNow()) => `Free account forever. ${passLine(free)}`;

export function PriceLine({ className }: { className?: string }) {
  return <span className={className}>{priceLine()}</span>;
}

/** The price for the policy pages: the line, the referral price and how it is paid. */
export function SeasonPassPrice() {
  return (
    <>
      {priceLine()} With a friend&apos;s referral link full access costs {formatPaise(discountedPrice(amount))}. It is paid once by card or UPI:
      there is no subscription and nothing renews.
    </>
  );
}
