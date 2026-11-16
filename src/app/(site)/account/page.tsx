import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { getCurrentUser } from "@/features/auth/lib/session";
import { PlanCards } from "@/features/plans/components/plan-cards";
import { effectivePlan, planLine, usedOf } from "@/features/plans/plans";
import { usageToday } from "@/features/plans/usage";
import { REFERRAL_PERCENT } from "@/features/referrals/lib";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const eff = effectivePlan(user);
  const used = await usageToday(user.id);

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

      <section id="plan" aria-labelledby="plan-h" className="max-w-3xl scroll-mt-24 border-b border-border py-12">
        <h2 id="plan-h" className="text-lg font-medium">Your plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {planLine(user)}. Today: {usedOf(used.institutes, eff.limits.institutes)} institute pages, {usedOf(used.residents, eff.limits.residents)} residents
          searches. Daily limits reset at 00:00 IST.
        </p>
        <PlanCards className="mt-6" />
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href="/decide/plan" className="text-sky underline">Your plan in the planner</Link> ·{" "}
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
