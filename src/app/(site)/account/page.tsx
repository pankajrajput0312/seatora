import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { getCurrentUser } from "@/features/auth/lib/session";
import { SeasonPassButton } from "@/features/payments/components/season-pass-button";
import { ALL_FEATURES, featureName, limitValue } from "@/features/plans/components/plan-table";
import { COUNTED, effectivePlan, longDate, passState, shortDate, type Counted } from "@/features/plans/plans";
import { usageToday } from "@/features/plans/usage";
import { REFERRAL_PERCENT } from "@/features/referrals/lib";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const eff = effectivePlan(user);
  const used = await usageToday(user.id);
  const s = passState(user);
  const plan = {
    staff: `${user.role === "OWNER" ? "Owner" : "Admin"}: no limits`,
    pass: `Season Pass${s.until ? `, till ${longDate(s.until)}` : ""}`,
    claimed: `Season Pass, free till ${shortDate(s.until ?? new Date())}`,
    claimable: `Free till ${shortDate(s.until ?? new Date())}, with Season Pass limits`,
    free: "Free",
  }[s.state];

  return (
    <Container className="py-16 md:py-24">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{user.email}</p>
          <h1 className="glow mt-3 font-pixel text-4xl leading-none md:text-5xl">Hi, {user.name}.</h1>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="secondary">Sign out</Button>
        </form>
      </div>

      <section id="plan" aria-labelledby="plan-h" className="max-w-md scroll-mt-24 border-b border-border py-12">
        <h2 id="plan-h" className="text-lg font-medium">Your plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">{plan}. Daily limits reset at 00:00 IST.</p>
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">Your limits and today&apos;s use</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1 font-semibold">Feature</th>
              <th scope="col" className="py-1 text-right font-semibold">Your limit</th>
              <th scope="col" className="py-1 text-right font-semibold">Used today</th>
            </tr>
          </thead>
          <tbody>
            {ALL_FEATURES.map((f) => (
              <tr key={f} className="border-t border-border">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">{featureName(f)}</th>
                <td className="numeric py-1.5 text-right">{limitValue(eff.limits[f])}</td>
                <td className="numeric py-1.5 text-right">{(COUNTED as readonly string[]).includes(f) ? used[f as Counted] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6">
          <SeasonPassButton className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" noteClassName="text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href="/pricing#buy" className="text-sky underline">Compare plans</Link> ·{" "}
          <Link href="/decide/refer" className="text-sky underline">Refer &amp; earn</Link>: your friend gets {REFERRAL_PERCENT}% off, you get {REFERRAL_PERCENT}% of what they pay.
        </p>
      </section>

      <section aria-labelledby="password-h" className="max-w-sm py-12">
        <h2 id="password-h" className="text-lg font-medium">Change password</h2>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">This signs you out on every other device.</p>
        <ChangePasswordForm email={user.email} />
      </section>
    </Container>
  );
}
