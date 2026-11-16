import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, requireDecideAccess } from "@/features/auth/lib/session";
import { AppPage } from "@/features/decide/components/app-page";
import { PageHead } from "@/features/decide/components/bits";
import { smallLink, StatCell } from "@/features/decide/components/ui";
import { PlanCards } from "@/features/plans/components/plan-cards";
import { effectivePlan, planLine, shortDate, usedOf } from "@/features/plans/plans";
import { usageToday } from "@/features/plans/usage";
import { REFERRAL_PERCENT } from "@/features/referrals/lib";

// "Your plan" inside the planner (the sidebar footer, the plan chip and every in-app upgrade link come here): her plan
// and today's use, the plan cards with the Season Pass call to action, and the referral offer. /pricing stays public.

export const metadata: Metadata = { title: "Your plan", robots: { index: false, follow: false } };
const PATH = "/decide/plan";

export default async function PlanPage() {
  await requireDecideAccess(PATH);
  const user = await getCurrentUser();
  const eff = user && effectivePlan(user);
  const used = user && (await usageToday(user.id));
  const [name, until] = user ? planLine(user).split(" · ") : [];
  const daily = (n: number, limit: number) => ({ value: <span className="numeric">{usedOf(n, limit)}</span>, note: limit === Infinity ? "No daily limit" : "More at 00:00 IST" });

  return (
    <AppPage className="grid max-w-4xl grid-cols-1 gap-6">
      <PageHead title="Your plan" about="Daily limits reset at 00:00 IST. The Season Pass is paid once for the counselling season: no subscription, nothing renews." />
      {user && eff && used ? (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 max-sm:[&>:first-child]:col-span-2">
          <StatCell label="Plan" value={name} note={until ?? (eff.freeUntil && `Season Pass limits till ${shortDate(eff.freeUntil)}`)} />
          <StatCell label="Institute pages today" {...daily(used.institutes, eff.limits.institutes)} />
          <StatCell label="Residents searches today" {...daily(used.residents, eff.limits.residents)} />
        </dl>
      ) : (
        <p className="text-sm">
          Create a free account to use the planner, or <Link href={`/login?${new URLSearchParams({ next: PATH })}`} className="text-sky underline">sign in</Link>.
        </p>
      )}
      <section aria-labelledby="plans-h" className="grid gap-3">
        <h2 id="plans-h" className="text-lg font-semibold">Plans</h2>
        <PlanCards />
      </section>
      <Link href="/decide/refer" className={`${smallLink} text-sm text-sky`}>
        Refer a friend: {REFERRAL_PERCENT}% off for them, {REFERRAL_PERCENT}% for you
      </Link>
    </AppPage>
  );
}
