import { cn } from "@/lib/cn";
import { FEATURE_LABEL, planLimits, type Feature } from "../plans";

export const ALL_FEATURES: Feature[] = ["ask", "institutes", "residents", "csv", "reports", "compare", "choiceLists"];
export const limitValue = (n: number) => (n === Infinity ? "Unlimited" : n === 0 ? "—" : String(n));
export const featureName = (f: Feature) => FEATURE_LABEL[f][0].toUpperCase() + FEATURE_LABEL[f].slice(1);

/** Free vs Season Pass, read from the plans config (env overrides included): Pricing, the paywall, the account page. */
export function PlanTable({ features = ALL_FEATURES, className }: { features?: Feature[]; className?: string }) {
  const free = planLimits("FREE");
  const premium = planLimits("PREMIUM");
  return (
    <table className={cn("w-full max-w-md text-sm", className)}>
      <caption className="sr-only">What each plan gives</caption>
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="py-1 font-semibold">Each day / at once</th>
          <th scope="col" className="py-1 text-right font-semibold">Free</th>
          <th scope="col" className="py-1 text-right font-semibold">Season Pass</th>
        </tr>
      </thead>
      <tbody>
        {features.map((f) => (
          <tr key={f} className="border-t border-border">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal">{featureName(f)}</th>
            <td className="numeric py-1.5 text-right">{limitValue(free[f])}</td>
            <td className="numeric py-1.5 text-right font-semibold text-foreground">{limitValue(premium[f])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
