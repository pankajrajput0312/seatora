import { cookies } from "next/headers";
import Link from "next/link";
import { getCurrentUser } from "@/features/auth/lib/session";
import { ClaimFreePass } from "@/features/plans/components/claim-free-pass";
import { freeNow, longDate, passState, shortDate } from "@/features/plans/plans";
import { formatPaise, REF_COOKIE } from "@/features/referrals/lib";
import { quote } from "@/features/referrals/service";
import { cn } from "@/lib/cn";
import { paymentsOn, PLANS } from "../plans";
import { BuySeasonPass } from "./buy-season-pass";

/**
 * The Season Pass call to action everywhere (Pricing #buy, the planner's home, the paywall, the account page), from her
 * state on the server (plans.ts passState):
 * - a Season Pass beyond the free period, or staff: "Season Pass active till 31 Mar 2027";
 * - in the free period: one button, "Upgrade for ~~₹499~~ ₹0" (the free claim; or "Season Pass · free till 20 Nov" once
 *   done). No paid option while it is free;
 * - after it: "Upgrade for ₹499" ("Upgrade for ~~₹499~~ ₹399 with Rahul's invite" with a referrer: her own, or the /r/
 *   cookie's code), or "Payments open soon";
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
  const list = formatPaise(q?.listAmount ?? PLANS.season_pass.amount);
  const claimLabel = free && (
    <>
      Upgrade for <s className="mx-1 opacity-70">{list}</s> ₹0
    </>
  );

  if (!user)
    return (
      <Link href={`/signup?${new URLSearchParams({ next: "/pricing#buy" })}`} className={cn("inline-flex items-center justify-center", className)}>
        {claimLabel ||
          (q ? (
            <>
              Upgrade for {q.amount < q.listAmount && <s className="mr-1 opacity-70">{list}</s>}
              {formatPaise(q.amount)}
              {q.inviter ? ` with ${q.inviter}'s invite` : ""}
            </>
          ) : (
            "Create free account"
          ))}
      </Link>
    );

  const offer = q && { amount: q.amount, listAmount: q.listAmount, inviter: q.inviter, code: q.referrerId ? code : null };
  if (!free || !s || s.state === "free")
    return offer ? <BuySeasonPass offer={offer} verb="Upgrade" className={className} noteClassName={noteClassName} /> : <p className={cn(text, "font-semibold")}>Payments open soon</p>;

  return s.state === "claimed" ? (
    <p className={cn(text, "font-semibold")} role="status">Season Pass · free till {shortDate(free)}</p>
  ) : (
    <ClaimFreePass label={claimLabel} className={className} noteClassName={noteClassName} />
  );
}
