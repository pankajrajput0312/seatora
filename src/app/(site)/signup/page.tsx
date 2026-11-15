import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { hasSiteAccess } from "@/features/auth/lib/session";
import { openAccess, safeNext } from "@/lib/site-access";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function SignupPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const to = typeof next === "string" ? next : undefined;
  if (await hasSiteAccess()) redirect(safeNext(to));
  if (openAccess()) {
    return (
      <AuthShell eyebrow="Free account" title="Create your account.">
        <p className="mb-6 text-sm text-muted-foreground max-sm:order-last max-sm:mt-6 max-sm:mb-0">
          The Seatora NEET PG 2026 Season Pass is free (₹0, regular ₹499): anyone can create an account and open the planner.
          Already have an account?{" "}
          <a href="/login" className="text-sky underline">Sign in</a>.
        </p>
        <AuthForm mode="signup" next={to} open />
      </AuthShell>
    );
  }
  return (
    <AuthShell eyebrow="Season Pass" title="Create your account.">
      <p className="mb-6 text-sm text-muted-foreground max-sm:order-last max-sm:mt-6 max-sm:mb-0">
        Accounts are created when you buy the Seatora NEET PG 2026 Season Pass (₹499) from the{" "}
        <a href="/pricing" className="text-sky underline">Pricing</a> page; you receive an access code with your purchase. Already have an
        account? <a href="/login" className="text-sky underline">Sign in</a>.
      </p>
      <AuthForm mode="signup" next={to} />
    </AuthShell>
  );
}
