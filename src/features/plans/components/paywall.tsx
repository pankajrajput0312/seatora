import Link from "next/link";
import { Lock } from "lucide-react";
import { COUNTED, FEATURE_LABEL, shortDate, type Effective, type Feature } from "../plans";
import { PlanCards } from "./plan-cards";

/**
 * In place of a page body (or beside a capped view) when the plan's limit is reached: what it was, and the plan cards
 * with the Season Pass call to action right here (SeasonPassButton: the free upgrade, or the buy button, or when payments
 * open), and a link to her plan page.
 * A counted feature (ask, institutes, residents) is a daily limit: "more at 00:00 IST".
 */
export function Paywall({ feature, eff, used, className }: { feature: Feature; eff: Effective; used?: number; className?: string }) {
  const daily = (COUNTED as readonly string[]).includes(feature);
  const limit = eff.limits[feature];
  return (
    <section aria-labelledby="paywall-h" className={`rounded-xl border border-border bg-card p-6 ${className ?? ""}`}>
      <h2 id="paywall-h" className="flex items-center gap-2 text-lg font-semibold">
        <Lock className="size-5 text-muted-foreground" aria-hidden />
        {daily ? `Today's limit reached: ${limit} ${FEATURE_LABEL[feature]}` : `${FEATURE_LABEL[feature][0].toUpperCase()}${FEATURE_LABEL[feature].slice(1)} need the Season Pass`}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {daily
          ? `Your ${eff.plan === "FREE" ? "Free" : "Season Pass"} plan gives ${limit} a day${used != null ? ` and you have used ${used}` : ""}. More at 00:00 IST.`
          : limit === 0 ? "Your Free plan has none." : `Your Free plan gives ${limit} ${FEATURE_LABEL[feature]}.`}
        {eff.freeUntil && ` Everything is free till ${shortDate(eff.freeUntil)}.`}
      </p>
      <PlanCards className="mt-4" />
      <Link href="/decide/plan" className="mt-2 inline-flex min-h-11 items-center text-sm text-sky underline">Compare plans</Link>
    </section>
  );
}
