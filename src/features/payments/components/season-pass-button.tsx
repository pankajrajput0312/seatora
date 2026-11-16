import { cookies } from "next/headers";
import Link from "next/link";
import { getCurrentUser } from "@/features/auth/lib/session";
import { ClaimFreePass } from "@/features/plans/components/claim-free-pass";
import { freeNow, longDate, passState, shortDate } from "@/features/plans/plans";
import { discountedPrice, formatPaise, REF_COOKIE } from "@/features/referrals/lib";
import { quote } from "@/features/referrals/service";
import { cn } from "@/lib/cn";
import { SEASON_PASS_UNTIL } from "../grant";
import { paymentsOn } from "../plans";
import { BuySeasonPass } from "./buy-season-pass";

/**
 * The Season Pass call to action everywhere (Pricing #buy, the planner's home, the paywall, the account page), from her
 * state on the server (plans.ts passState):
 * - a Season Pass beyond the free period, or staff: "Season Pass active till 31 Mar 2027";
 * - in the free period: "Upgrade to Season Pass, free till 20 Nov" (or "Season Pass · free till 20 Nov" once done), and
 *   under it, while payments are on, "Keep it for the whole season (till 31 Mar 2027): ₹499, or ₹399 with an invite";
 * - after it: "Upgrade · ₹499" (₹399 with a referrer: her own, or the /r/ cookie's code), or "Payments open soon";
 * - signed out: the same words, to /signup?next=/pricing#buy.
 * `className`: the primary button; `noteClassName`: text (and the secondary button's colour).
 */
export async function SeasonPassButton({ className, noteClassName }: { className?: string; noteClassName?: string }) {
  const user = await getCurrentUser();
  const s = user && passState(user);
  const text = cn("text-sm", noteClassName);
  if (s && (s.state === "staff" || s.state === "pass"))
    return <p className={cn(text, "font-semibold")} role="status">Season Pass active{s.until ? ` till ${longDate(s.until)}` : ""}</p>;

  const free = freeNow();
  const code = (await cookies()).get(REF_COOKIE)?.value ?? null;
  const q = paymentsOn() ? await quote(user?.id ?? null, code) : null;
  const price = q && `${formatPaise(q.amount)}${q.inviter ? ` with ${q.inviter}'s invite` : ""}`;
  const claimLabel = free && `Upgrade to Season Pass, free till ${shortDate(free)}`;

  if (!user)
    return (
      <Link href={`/signup?${new URLSearchParams({ next: "/pricing#buy" })}`} className={cn("inline-flex items-center justify-center", className)}>
        {claimLabel || (price ? `Upgrade · ${price}` : "Create free account")}
      </Link>
    );

  const offer = q && { amount: q.amount, listAmount: q.listAmount, inviter: q.inviter, code: q.referrerId ? code : null };
  if (!free || !s || s.state === "free")
    return offer ? <BuySeasonPass offer={offer} verb="Upgrade" className={className} noteClassName={noteClassName} /> : <p className={cn(text, "font-semibold")}>Payments open soon</p>;

  return (
    <div className="grid gap-3">
      {s.state === "claimed" ? (
        <p className={cn(text, "font-semibold")} role="status">Season Pass · free till {shortDate(free)}</p>
      ) : (
        <ClaimFreePass label={claimLabel || "Upgrade to Season Pass"} className={className} noteClassName={noteClassName} />
      )}
      {offer && q && (
        <div className={text}>
          {/* The colour on the <p> itself: the app's reset colours paragraphs. */}
          <p className={text}>
            Keep it for the whole season (till {longDate(SEASON_PASS_UNTIL)})
            {q.inviter ? "" : `: ${formatPaise(q.listAmount)}, or ${formatPaise(discountedPrice(q.listAmount))} with an invite`}
          </p>
          <BuySeasonPass offer={offer} verb="Pay" className="mt-1.5 min-h-10 rounded-md border border-current px-3 text-sm font-semibold" noteClassName={noteClassName} />
        </div>
      )}
    </div>
  );
}
