import Link from "next/link";
import { Lock } from "lucide-react";
import { business } from "@/config/business";
import { formatINR } from "@/features/cutoffs/lib/format";
import { COUNTED, FEATURE_LABEL, planLimits, shortDate, type Effective, type Feature } from "../plans";

const SHOWN: Feature[] = ["institutes", "residents", "compare", "csv", "choiceLists"];
const value = (n: number) => (n === Infinity ? "Unlimited" : n === 0 ? "—" : String(n));

/**
 * In place of a page body (or beside a capped view) when the plan's limit is reached: what it was, what each plan gives,
 * and the Season Pass. A counted feature (ask, institutes, residents) is a daily limit: "more at 00:00 IST".
 */
export function Paywall({ feature, eff, used, className }: { feature: Feature; eff: Effective; used?: number; className?: string }) {
  const daily = (COUNTED as readonly string[]).includes(feature);
  const free = planLimits("FREE");
  const premium = planLimits("PREMIUM");
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
      <table className="mt-4 w-full max-w-md text-sm">
        <caption className="sr-only">What each plan gives</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1 font-semibold">Each day / at once</th>
            <th scope="col" className="py-1 text-right font-semibold">Free</th>
            <th scope="col" className="py-1 text-right font-semibold">Season Pass</th>
          </tr>
        </thead>
        <tbody>
          {SHOWN.map((f) => (
            <tr key={f} className="border-t border-border">
              <th scope="row" className="py-1.5 text-left font-normal">{FEATURE_LABEL[f]}</th>
              <td className="numeric py-1.5 text-right">{value(free[f])}</td>
              <td className="numeric py-1.5 text-right font-semibold">{value(premium[f])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link href="/pricing" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-foreground px-4 text-sm font-semibold text-background">
        Season Pass {formatINR(business.regularPrice)}
      </Link>
    </section>
  );
}
