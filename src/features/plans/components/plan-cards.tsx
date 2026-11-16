import Link from "next/link";
import { Check, X } from "lucide-react";
import { getCurrentUser } from "@/features/auth/lib/session";
import { SeasonPassButton } from "@/features/payments/components/season-pass-button";
import { SEASON_PASS_UNTIL } from "@/features/payments/grant";
import { PLANS } from "@/features/payments/plans";
import { discountedPrice, formatPaise } from "@/features/referrals/lib";
import { cn } from "@/lib/cn";
import { FEATURE_LABEL, freeNow, longDate, passState, planLimits, shortDate, type Feature, type Plan } from "../plans";

// Free and Season Pass as two cards (the sign-in pop-up, /decide/plan, /pricing, the paywall, the account page), every
// line read from the plans config (env overrides included). Token colours, so it reads on the app's light sheet and the
// site's dark page alike; the Season Pass card is the hero in Seatora's ink and cyan.

/** What each card lists, in this order. Ask Seatora is the owner's beta, not a plan feature yet. */
const SHOWN: Feature[] = ["institutes", "residents", "compare", "choiceLists", "csv", "reports"];

/** "10 institute pages a day", "Unlimited institute pages", "1 saved choice list", "No CSV exports". */
export function limitLine(f: Feature, n: number) {
  const label = FEATURE_LABEL[f];
  if (n === 0) return `No ${label}`;
  if (n === Infinity) return `Unlimited ${label.replace(/ a day$/, "")}`;
  return `${n} ${n === 1 ? label.replace(/s\b/, "") : label}`;
}

const button = "inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 text-sm font-semibold";

/** The cards for the signed-in user (or signed out: "Create free account"); her plan's card says so. */
export async function PlanCards({ className }: { className?: string }) {
  const user = await getCurrentUser();
  const state = user && passState(user).state;
  return (
    <PlanCardsView
      className={className}
      current={!state ? null : state === "free" || state === "claimable" ? "FREE" : "PREMIUM"}
      free={state === "pass" || state === "staff" ? null : freeNow()} // a paid pass: its price, not the free-period offer
      cta={<SeasonPassButton className={cn(button, "bg-[#5fd36f] text-[#0b0e12] hover:bg-[#7fe08b]")} noteClassName="text-muted-foreground" />}
      freeCta={!user && <Link href="/signup" className={cn(button, "border border-border text-foreground hover:bg-muted")}>Create free account</Link>}
    />
  );
}

/**
 * The two cards, pure (tested). `current`: her plan, null signed out. `free`: FREE_FOR_ALL_UNTIL while ahead. `cta`: the
 * Season Pass card's call to action; `freeCta`: the Free card's when it isn't her plan.
 * The Season Pass comes first in the page (first on phones); from sm the Free card is drawn on its left.
 */
export function PlanCardsView({ current, free, cta, freeCta, className }: { current: Plan | null; free: Date | null; cta: React.ReactNode; freeCta?: React.ReactNode; className?: string }) {
  const list = PLANS.season_pass.amount;
  const yours = <span className="rounded-full bg-[#5ccfe6] px-2 py-0.5 text-xs font-bold text-[#0b0e12]">Your plan</span>;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div data-plan="PREMIUM" className={cn("flex flex-col overflow-hidden rounded-xl border-2 border-[#5ccfe6] bg-card", current === "PREMIUM" && "ring-4 ring-[#5ccfe6]/35")}>
        <div className="flex min-h-14 flex-wrap items-center gap-2 bg-[#0b0e12] px-4 py-2">
          <h3 className="text-lg font-bold text-[#f1f4f7]">Season Pass</h3>
          {current === "PREMIUM" && yours}
          {free && <span className="ml-auto rounded-full bg-[#5fd36f] px-2.5 py-0.5 text-xs font-bold text-[#0b0e12]">Free till {shortDate(free)}</span>}
        </div>
        <div className="flex flex-1 flex-col p-4">
          {free ? (
            <p className="flex items-baseline gap-2">
              <span className="sr-only">Was {formatPaise(list)}, now ₹0 till {shortDate(free)}</span>
              <s aria-hidden className="numeric text-lg text-muted-foreground">{formatPaise(list)}</s>
              <span aria-hidden className="numeric text-4xl font-extrabold">₹0</span>
              <span aria-hidden className="text-sm text-muted-foreground">till {shortDate(free)}</span>
            </p>
          ) : (
            <p className="flex items-baseline gap-2">
              <span className="numeric text-4xl font-extrabold">{formatPaise(list)}</span>
              <span className="text-sm text-muted-foreground">paid once</span>
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {free
              ? `Free for everyone till ${shortDate(free)}. After that ${formatPaise(list)} (${formatPaise(discountedPrice(list))} with an invite), valid till ${longDate(SEASON_PASS_UNTIL)}.`
              : `${formatPaise(discountedPrice(list))} with an invite, valid till ${longDate(SEASON_PASS_UNTIL)}.`}
          </p>
          <Lines plan="PREMIUM" />
          <div className="mt-auto pt-5">{cta}</div>
        </div>
      </div>

      <div data-plan="FREE" className={cn("flex flex-col overflow-hidden rounded-xl bg-card sm:order-first", current === "FREE" ? "border-2 border-foreground" : "border-2 border-border")}>
        <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <h3 className="text-lg font-bold">Free</h3>
          {current === "FREE" && yours}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="flex items-baseline gap-2">
            <span className="numeric text-4xl font-extrabold">₹0</span>
            <span className="text-sm text-muted-foreground">always</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">A free account, no card needed.</p>
          <Lines plan="FREE" />
          <div className="mt-auto pt-5">
            {current === "FREE" ? (
              <button type="button" disabled className={cn(button, "border border-border text-muted-foreground")}>Current plan</button>
            ) : freeCta}
          </div>
        </div>
      </div>
    </div>
  );
}

function Lines({ plan }: { plan: Plan }) {
  const limits = planLimits(plan);
  return (
    <ul className="mt-4 grid gap-2 text-sm">
      {SHOWN.map((f) => (
        <li key={f} className={cn("flex items-start gap-2", limits[f] === 0 && "text-muted-foreground")}>
          {limits[f] === 0 ? <X className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Check className="mt-0.5 size-4 shrink-0 text-leaf" strokeWidth={2.5} aria-hidden />}
          {limitLine(f, limits[f])}
        </li>
      ))}
    </ul>
  );
}
