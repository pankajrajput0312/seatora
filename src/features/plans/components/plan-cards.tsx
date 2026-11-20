import { cookies } from "next/headers";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/features/auth/lib/session";
import { passLine } from "@/components/marketing/price-line";
import { SeasonPassButton } from "@/features/payments/components/season-pass-button";
import { SEASON_PASS_UNTIL } from "@/features/payments/grant";
import { PLANS } from "@/features/payments/plans";
import { paidPass } from "@/features/payments/service";
import { discountedPrice, formatPaise, REF_COOKIE } from "@/features/referrals/lib";
import { quote } from "@/features/referrals/service";
import { cn } from "@/lib/cn";
import { FEATURE_LABEL, freeNow, gotLine, inviteLine, longDate, passState, planLimits, shortDate, type Feature, type Plan } from "../plans";

// Free and Season Pass as two cards (the sign-in pop-up, /decide/plan, /pricing, the paywall, the account page), every
// line read from the plans config (env overrides included). Token colours only, so it reads on the app's light sheet and
// the site's dark page alike: flat sheets with a hairline; the Season Pass, the one to act on, edged and headed in the
// accent (docs/APP_DESIGN_SYSTEM.md).

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
const head = "flex min-h-14 flex-wrap items-center gap-2 border-b px-4 py-2";
const price = "numeric text-figure font-semibold";

/**
 * Her Season Pass for the plan cards and the Home box (so they say the same): `got`, what she has (gotLine: her paid
 * payment and its coupon, or the free claim); `invite`, her friend's price while she has no pass (her referredById, else
 * the /r/ cookie's code: quote).
 */
export async function passView() {
  const user = await getCurrentUser();
  const s = user && passState(user);
  const [paid, q] = await Promise.all([
    s?.state === "pass" ? paidPass(user!.id) : null,
    s?.state === "pass" || s?.state === "staff" ? null : (async () => quote(user?.id ?? null, (await cookies()).get(REF_COOKIE)?.value))(),
  ]);
  return { user, state: s?.state ?? null, got: s && gotLine(s, paid), invite: q?.inviter ? { name: q.inviter, amount: q.amount } : null };
}

/** The cards for the signed-in user (or signed out: "Create free account"); her plan's card says so. `coupon`: the page's ?coupon=. */
export async function PlanCards({ className, coupon }: { className?: string; coupon?: string | null }) {
  const { user, state, got, invite } = await passView();
  return (
    <PlanCardsView
      className={className}
      current={!state ? null : state === "free" || state === "claimable" ? "FREE" : "PREMIUM"}
      free={state === "pass" || state === "staff" ? null : freeNow()} // a paid pass: its price, not the free-period offer
      got={got}
      invite={invite}
      cta={<SeasonPassButton coupon={coupon} className={cn(button, "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90")} noteClassName="text-muted-foreground" />}
      freeCta={!user && <Link href={coupon ? `/signup?${new URLSearchParams({ coupon })}` : "/signup"} className={cn(button, "border border-edge bg-card text-foreground shadow-xs hover:border-input hover:bg-muted")}>Create free account</Link>}
    />
  );
}

/**
 * The two cards, pure (tested). `current`: her plan, null signed out. `free`: FREE_FOR_ALL_UNTIL while ahead. `cta`: the
 * Season Pass card's call to action; `freeCta`: the Free card's when it isn't her plan. `got`: what her pass is (gotLine),
 * in place of the price; `invite`: her friend's price (inviteLine).
 * The Season Pass comes first in the page (first on phones); from sm the Free card is drawn on its left.
 */
export function PlanCardsView({ current, free, got, invite, cta, freeCta, className }: {
  current: Plan | null; free: Date | null; got?: string | null; invite?: { name: string; amount: number } | null; cta: React.ReactNode; freeCta?: React.ReactNode; className?: string;
}) {
  const list = PLANS.season_pass.amount;
  const season = longDate(SEASON_PASS_UNTIL);
  // "Valid till 31 Mar 2027" only where she pays (or has paid): the free upgrade ends with the free period.
  const line = got
    ? free && `Your free pass ends ${shortDate(free)}. After that you return to the Free plan (your list stays) unless you pay ${formatPaise(invite?.amount ?? list)} once. We never charge automatically.` // the free claim; a pass says it all
    : free
      ? invite ? "No card now, no auto-renew." : passLine(free)
      : invite ? `Once, no auto-renew, valid till ${season}.` : `${formatPaise(discountedPrice(list))} with an invite, valid till ${season}.`;
  const yours = <Badge tone="info" className="font-semibold">Your plan</Badge>;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div data-plan="PREMIUM" className="flex flex-col overflow-hidden rounded-xl border border-sky bg-card ring-1 ring-sky">
        <div className={cn(head, "border-wash-line bg-wash")}>
          <h3 className="text-title font-semibold">Season Pass</h3>
          {current === "PREMIUM" && yours}
          {free && <Badge tone="success" className="ml-auto font-semibold">Free till {shortDate(free)}</Badge>}
        </div>
        <div className="flex flex-1 flex-col p-4">
          {/* The price it costs (her invite's), in and after the free period: the free period is the ribbon and the line. */}
          {got ? (
            <p className="numeric text-title font-semibold">{got}</p>
          ) : (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className={price}>{formatPaise(invite?.amount ?? list)}</span>
              <span className="text-sm text-muted-foreground">{invite ? `with ${invite.name}'s invite` : "once, no auto-renew"}</span>
            </p>
          )}
          {/* The free period (claimed or not): her invite's price after it. */}
          {free && invite && <p className="mt-2 rounded-md border border-wash-line bg-wash px-3 py-2 text-sm font-semibold">{inviteLine(invite.name, invite.amount, list, free)}</p>}
          {line && <p className="mt-1 text-sm text-muted-foreground">{line}</p>}
          <Lines plan="PREMIUM" />
          <div className="mt-auto pt-5">{cta}</div>
        </div>
      </div>

      <div data-plan="FREE" className="flex flex-col overflow-hidden rounded-xl border border-border bg-card sm:order-first">
        <div className={cn(head, "border-border")}>
          <h3 className="text-title font-semibold">Free</h3>
          {current === "FREE" && yours}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="flex items-baseline gap-2">
            <span className={price}>₹0</span>
            <span className="text-sm text-muted-foreground">always</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">A free account, no card needed.</p>
          <Lines plan="FREE" />
          <div className="mt-auto pt-5">
            {current === "FREE" ? (
              <button type="button" disabled className={cn(button, "border border-border bg-muted text-muted-foreground")}>Current plan</button>
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
